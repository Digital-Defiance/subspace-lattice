/**
 * Node-only: round-robin ladder from AgentSpecs with optional worker_threads
 * parallelism (one game per job). Ratings applied in deterministic order so
 * results match sequential runLadder for the same seeds.
 */
import { availableParallelism, cpus } from 'node:os';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import {
  agentFromSpec,
  agentSpecName,
  type AgentSpec,
} from '../ai/agent-spec';
import { createSeededRng } from '../ai/rng';
import { PlayerColor } from '../interfaces/playerColor';
import {
  resolveRulesConfig,
  type RulesVersion,
} from '../rules/rules-config';
import { playMatch } from './match-runner';
import { mapInParallel } from './parallel';
import {
  applyMatchResult,
  calibrationPairAccuracy,
  createRating,
  rankByOrdinal,
  toAgentSkill,
  type Rating,
} from './ratings';
import type { TeiGrade } from './tei-grade';
import type {
  LadderPairResult,
  LadderResult,
} from './ladder';
import type {
  NeuralMatchRequest,
  SlimMatchResult,
} from '../ai/neural-match-worker';

export function nodeDefaultJobs(): number {
  const n =
    typeof availableParallelism === 'function'
      ? availableParallelism()
      : cpus().length;
  return Math.max(1, n - 1);
}

function resolveNeuralMatchWorkerPath(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, 'neural-match-worker.mjs'),
    path.resolve(process.cwd(), 'packages/subspace-lattice/dist/neural-match-worker.mjs'),
    path.resolve(process.cwd(), 'dist/neural-match-worker.mjs'),
    path.resolve(here, '../../../dist/neural-match-worker.mjs'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

type Pending = {
  resolve: (v: SlimMatchResult) => void;
  reject: (e: Error) => void;
};

class NeuralMatchPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: Array<{
    req: Omit<NeuralMatchRequest, 'id'>;
    pending: Pending;
  }> = [];
  private nextId = 1;
  private readonly pendingById = new Map<number, Pending>();

  constructor(
    workerPath: string,
    size: number,
  ) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(workerPath);
      w.on(
        'message',
        (msg: {
          id: number;
          ok: boolean;
          result?: SlimMatchResult;
          error?: string;
        }) => {
          const pending = this.pendingById.get(msg.id);
          this.pendingById.delete(msg.id);
          if (!pending) return;
          if (msg.ok && msg.result) pending.resolve(msg.result);
          else pending.reject(new Error(msg.error ?? 'worker failed'));
          this.idle.push(w);
          this.pump();
        },
      );
      w.on('error', (err) => {
        console.error('neural-match worker error', err);
      });
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  private pump(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const job = this.queue.shift()!;
      const worker = this.idle.pop()!;
      const id = this.nextId++;
      this.pendingById.set(id, job.pending);
      worker.postMessage({ ...job.req, id });
    }
  }

  run(req: Omit<NeuralMatchRequest, 'id'>): Promise<SlimMatchResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ req, pending: { resolve, reject } });
      this.pump();
    });
  }

  async destroy(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
    this.idle = [];
  }
}

function updateElo(
  elo: Record<string, number>,
  winner: string,
  loser: string,
  k = 24,
): void {
  const rw = elo[winner] ?? 1000;
  const rl = elo[loser] ?? 1000;
  const ew = 1 / (1 + 10 ** ((rl - rw) / 400));
  elo[winner] = rw + k * (1 - ew);
  elo[loser] = rl + k * (0 - (1 - ew));
}

function gameSeed(
  baseSeed: number,
  gameIndex: number,
  whiteIndex: number,
  blackIndex: number,
): number {
  return baseSeed + gameIndex * 1009 + whiteIndex * 17 + blackIndex;
}

export type RunLadderFromSpecsOptions = {
  agentSpecs: AgentSpec[];
  rulesVersion?: RulesVersion;
  gamesPerPairing?: number;
  seed?: number;
  maxPlies?: number;
  /** Worker threads for concurrent games. Default: cores−1. Use 1 for sequential. */
  jobs?: number;
  expectedOrder?: string[];
  /**
   * When set, only play directed pairings that pass the predicate.
   * Strength bar uses this to score candidates vs heuristic only
   * (skip candidate–candidate mirrors that often truncate).
   */
  includePairing?: (white: string, black: string) => boolean;
  onGameComplete?: (info: {
    white: string;
    black: string;
    gameIndex: number;
    gamesPerPairing: number;
    pairingIndex: number;
    pairingTotal: number;
    plies: number;
    truncated: boolean;
    winner?: string;
    winnerReason?: string;
  }) => void;
};

type GameJob = {
  jobIndex: number;
  pairingIndex: number;
  pairingTotal: number;
  whiteName: string;
  blackName: string;
  whiteSpec: AgentSpec;
  blackSpec: AgentSpec;
  gameIndex: number;
  gamesPerPairing: number;
  seed: number;
};

/**
 * Same pairing schedule as runLadder, but games may run in parallel workers.
 * OpenSkill / Elo updates still run in jobIndex order.
 */
export async function runLadderFromSpecs(
  options: RunLadderFromSpecsOptions,
): Promise<LadderResult> {
  const rulesVersion = options.rulesVersion ?? 'hybrid-fleet';
  const rules = resolveRulesConfig(rulesVersion);
  const gamesPerPairing = options.gamesPerPairing ?? 10;
  const seed = options.seed ?? 1;
  const maxPlies = options.maxPlies ?? 400;
  const jobs = Math.max(1, options.jobs ?? nodeDefaultJobs());

  const specs = options.agentSpecs;
  const names = specs.map(agentSpecName);
  const nameToSpec = new Map(names.map((n, i) => [n, specs[i]!] as const));

  const elo: Record<string, number> = Object.fromEntries(
    names.map((n) => [n, 1000]),
  );
  const ratings: Record<string, Rating> = Object.fromEntries(
    names.map((n) => [n, createRating()]),
  );
  const teiGrade: Record<string, TeiGrade | undefined> = Object.fromEntries(
    names.map((n) => [n, undefined]),
  );

  const include = options.includePairing ?? ((_w, _b) => true);
  const directed = names.flatMap((w) =>
    names
      .filter((b) => b !== w && include(w, b))
      .map((b) => [w, b] as const),
  );

  const gameJobs: GameJob[] = [];
  let pairingIndex = 0;
  for (const [whiteName, blackName] of directed) {
    pairingIndex += 1;
    for (let g = 0; g < gamesPerPairing; g++) {
      gameJobs.push({
        jobIndex: gameJobs.length,
        pairingIndex,
        pairingTotal: directed.length,
        whiteName,
        blackName,
        whiteSpec: nameToSpec.get(whiteName)!,
        blackSpec: nameToSpec.get(blackName)!,
        gameIndex: g,
        gamesPerPairing,
        seed: gameSeed(
          seed,
          g,
          names.indexOf(whiteName),
          names.indexOf(blackName),
        ),
      });
    }
  }

  const playInProcess = (job: GameJob): SlimMatchResult => {
    const rng = createSeededRng(job.seed);
    const white = agentFromSpec(job.whiteSpec, rng);
    const black = agentFromSpec(job.blackSpec, rng);
    const result = playMatch(white, black, { rules, maxPlies });
    return {
      winner: result.winner,
      winnerReason: result.winnerReason,
      plies: result.plies,
      truncated: result.truncated,
    };
  };

  let results: SlimMatchResult[];
  const workerPath = jobs > 1 ? resolveNeuralMatchWorkerPath() : null;

  if (jobs > 1 && workerPath) {
    console.log(
      `  parallel: ${jobs} workers · ${gameJobs.length} games · ${path.basename(workerPath)}`,
    );
    const pool = new NeuralMatchPool(workerPath, jobs);
    try {
      results = await mapInParallel(
        gameJobs,
        async (job) => {
          const slim = await pool.run({
            type: 'match',
            payload: {
              white: job.whiteSpec,
              black: job.blackSpec,
              seed: job.seed,
              maxPlies,
              rulesVersion,
            },
          });
          options.onGameComplete?.(gameCompleteInfo(job, slim));
          return slim;
        },
        jobs,
      );
    } finally {
      await pool.destroy();
    }
  } else {
    if (jobs > 1 && !workerPath) {
      console.warn(
        '  parallel: neural-match-worker.mjs missing — falling back to sequential',
      );
    }
    results = gameJobs.map((job) => {
      const slim = playInProcess(job);
      options.onGameComplete?.(gameCompleteInfo(job, slim));
      return slim;
    });
  }

  // Aggregate pairings + ratings in deterministic job order
  const pairs: LadderPairResult[] = [];
  let cursor = 0;
  pairingIndex = 0;
  for (const [whiteName, blackName] of directed) {
    pairingIndex += 1;
    let whiteWins = 0;
    let blackWins = 0;
    let draws = 0;
    let truncated = 0;
    let pliesSum = 0;

    for (let g = 0; g < gamesPerPairing; g++) {
      const result = results[cursor++]!;
      pliesSum += result.plies;

      const wRating = ratings[whiteName]!;
      const bRating = ratings[blackName]!;

      if (result.truncated || !result.winner) {
        truncated += 1;
        draws += 1;
        const next = applyMatchResult(wRating, bRating, 'draw');
        ratings[whiteName] = next.white;
        ratings[blackName] = next.black;
      } else if (result.winner === PlayerColor.White) {
        whiteWins += 1;
        updateElo(elo, whiteName, blackName);
        const next = applyMatchResult(wRating, bRating, 'white');
        ratings[whiteName] = next.white;
        ratings[blackName] = next.black;
      } else {
        blackWins += 1;
        updateElo(elo, blackName, whiteName);
        const next = applyMatchResult(wRating, bRating, 'black');
        ratings[whiteName] = next.white;
        ratings[blackName] = next.black;
      }

      for (const n of [whiteName, blackName]) {
        const skill = toAgentSkill(n, ratings[n]!, teiGrade[n]);
        teiGrade[n] = skill.tei.grade;
      }
    }

    pairs.push({
      white: whiteName,
      black: blackName,
      games: gamesPerPairing,
      whiteWins,
      blackWins,
      draws,
      truncated,
      avgPlies: pliesSum / gamesPerPairing,
    });
  }

  const openskill: LadderResult['openskill'] = {};
  for (const name of names) {
    openskill[name] = toAgentSkill(name, ratings[name]!, teiGrade[name]);
  }
  const ranking = rankByOrdinal(openskill);

  let calibration: LadderResult['calibration'];
  if (options.expectedOrder?.length) {
    const cal = calibrationPairAccuracy(openskill, options.expectedOrder);
    calibration = { expectedOrder: options.expectedOrder, ...cal };
  }

  return {
    rulesVersion: rules.version,
    pairs,
    openskill,
    ranking,
    calibration,
    elo,
  };
}

function gameCompleteInfo(
  job: GameJob,
  result: SlimMatchResult,
): Parameters<NonNullable<RunLadderFromSpecsOptions['onGameComplete']>>[0] {
  let winnerLabel: string | undefined;
  if (!result.truncated && result.winner === PlayerColor.White) {
    winnerLabel = job.whiteName;
  } else if (!result.truncated && result.winner === PlayerColor.Black) {
    winnerLabel = job.blackName;
  }
  return {
    white: job.whiteName,
    black: job.blackName,
    gameIndex: job.gameIndex + 1,
    gamesPerPairing: job.gamesPerPairing,
    pairingIndex: job.pairingIndex,
    pairingTotal: job.pairingTotal,
    plies: result.plies,
    truncated: result.truncated,
    winner: winnerLabel,
    winnerReason: result.winnerReason,
  };
}
