/**
 * Lattice Atlas observe — ply-event JSONL from N self-play games.
 * Bundled by scripts/atlas-observe.sh — not imported from browser.
 *
 * Usage:
 *   yarn atlas:observe --games 20 --jobs 8 --seed 7 \
 *     --white mcts --black mcts --sims 40 \
 *     --out docs/atlas/runs/observe-seed7.jsonl
 *
 * Each line is either a game summary (`type:"game"`) or a ply event
 * (`type:"ply"`). Diff corpora with `yarn atlas:diff`.
 */
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { createSeededRng } from '../ai/rng';
import { HeuristicAi } from '../ai/heuristic-ai';
import { MctsAi } from '../ai/mcts-ai';
import { RandomLegalAgent } from '../ai/random-legal-agent';
import type { Agent } from '../ai/agent';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { resolveRulesConfig, type RulesVersion } from '../rules/rules-config';
import { playMatch } from './match-runner';
import type { ObserveWorkerJob } from './atlas-observe-worker';

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  return argv[i + 1];
}

function argInt(argv: string[], flag: string, fallback: number): number {
  const v = argValue(argv, flag);
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

type AgentKind = 'heuristic' | 'random' | 'mcts';

function makeAgent(kind: AgentKind, seed: number, sims: number): Agent {
  const rng = createSeededRng(seed);
  if (kind === 'heuristic') return new HeuristicAi(rng);
  if (kind === 'random') return new RandomLegalAgent(rng);
  return new MctsAi({ simulations: sims, rng });
}

function parseKind(raw: string | undefined, fallback: AgentKind): AgentKind {
  if (raw === 'heuristic' || raw === 'random' || raw === 'mcts') return raw;
  return fallback;
}

const PIECE_LABEL: Record<PieceType, string> = {
  [PieceType.CommandHub]: 'CommandHub',
  [PieceType.Escort]: 'Escort',
  [PieceType.Infiltrator]: 'Infiltrator',
  [PieceType.Beam]: 'Beam',
  [PieceType.Refractor]: 'Refractor',
  [PieceType.Carrier]: 'Carrier',
};

type GameBundle = {
  game: Record<string, unknown>;
  plies: Record<string, unknown>[];
  hub: number;
  sector: number;
  noMoves: number;
  trunc: number;
  empFires: number;
  pliesCount: number;
};

function playOneSequential(job: ObserveWorkerJob): GameBundle {
  const rules = resolveRulesConfig(job.version, {
    ...(job.firstPlayerRelayCount !== undefined
      ? { firstPlayerRelayCount: job.firstPlayerRelayCount }
      : {}),
  });
  const white = makeAgent(job.whiteKind, job.seed + job.game * 2, job.sims);
  const black = makeAgent(job.blackKind, job.seed + job.game * 2 + 1, job.sims);
  const result = playMatch(white, black, { rules, maxPlies: job.maxPlies });
  const plies = result.replay.map((ply, i) => ({
    type: 'ply' as const,
    game: job.game,
    i,
    player: ply.player === PlayerColor.White ? 'W' : 'B',
    mover: PIECE_LABEL[ply.moverType] ?? String(ply.moverType),
    pieceId: ply.pieceId,
    to: ply.to ? { x: ply.to.x, y: ply.to.y } : null,
    capture: ply.capturedType
      ? (PIECE_LABEL[ply.capturedType] ?? String(ply.capturedType))
      : null,
    emp: !!ply.empFired,
    spool: !!ply.spoolAnnounce,
    spoolFail: !!ply.spoolFailed,
  }));
  return {
    game: {
      type: 'game',
      game: job.game,
      winner:
        result.winner === PlayerColor.White
          ? 'W'
          : result.winner === PlayerColor.Black
            ? 'B'
            : null,
      reason: result.winnerReason ?? null,
      plies: result.plies,
      truncated: result.truncated,
      empFires: result.replay.filter((p) => p.empFired).length,
      infiltratorCaptures: result.infiltratorCaptures,
      spoolAnnounces: result.spoolAnnounces,
    },
    plies,
    hub: result.winnerReason === 'hub-capture' ? 1 : 0,
    sector: result.winnerReason === 'sector-integration' ? 1 : 0,
    noMoves: result.winnerReason === 'no-moves' ? 1 : 0,
    trunc: result.truncated ? 1 : 0,
    empFires: result.replay.filter((p) => p.empFired).length,
    pliesCount: result.plies,
  };
}

function playOneWorker(workerUrl: string, job: ObserveWorkerJob): Promise<GameBundle> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, { workerData: job });
    worker.once('message', (msg: GameBundle) => resolve(msg));
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`observe worker exited ${code}`));
    });
  });
}

async function runPool(
  jobs: ObserveWorkerJob[],
  concurrency: number,
  workerUrl: string | null,
): Promise<GameBundle[]> {
  const out: GameBundle[] = new Array(jobs.length);
  let next = 0;
  async function workerSlot(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= jobs.length) return;
      const job = jobs[i]!;
      out[i] = workerUrl
        ? await playOneWorker(workerUrl, job)
        : playOneSequential(job);
      if ((i + 1) % 4 === 0 || i + 1 === jobs.length) {
        console.log(`atlas:observe — ${i + 1}/${jobs.length} games`);
      }
    }
  }
  const n = Math.max(1, Math.min(concurrency, jobs.length));
  await Promise.all(Array.from({ length: n }, () => workerSlot()));
  return out;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const games = argInt(argv, '--games', 12);
  const seed = argInt(argv, '--seed', 7);
  const sims = argInt(argv, '--sims', 40);
  const maxPlies = argInt(argv, '--max-plies', 400);
  const jobsFlag = argInt(argv, '--jobs', 0);
  const jobs =
    jobsFlag > 0 ? jobsFlag : Math.max(1, Math.min(availableParallelism(), 12));
  const version = (argValue(argv, '--rules') ?? 'hybrid-fleet') as RulesVersion;
  const whiteKind = parseKind(argValue(argv, '--white'), 'heuristic');
  const blackKind = parseKind(argValue(argv, '--black'), 'random');
  const relayRaw = argValue(argv, '--relay-count');
  const firstPlayerRelayCount =
    relayRaw !== undefined ? Number.parseInt(relayRaw, 10) : undefined;
  const outPath = path.resolve(
    argValue(argv, '--out') ??
      `docs/atlas/runs/observe-${whiteKind}-${blackKind}-s${seed}.jsonl`,
  );

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, '');

  const rules = resolveRulesConfig(version, {
    ...(firstPlayerRelayCount !== undefined && Number.isFinite(firstPlayerRelayCount)
      ? { firstPlayerRelayCount }
      : {}),
  });
  const runMeta = {
    type: 'run' as const,
    generator: 'atlas-observe',
    at: new Date().toISOString(),
    games,
    seed,
    rulesVersion: rules.version,
    white: whiteKind,
    black: blackKind,
    sims,
    maxPlies,
    jobs,
    ...(firstPlayerRelayCount !== undefined
      ? { firstPlayerRelayCount }
      : {}),
  };
  appendFileSync(outPath, `${JSON.stringify(runMeta)}\n`);

  const here = path.dirname(fileURLToPath(import.meta.url));
  const workerUrl = path.resolve(here, 'atlas-observe-worker.mjs');
  let useWorkers = jobs > 1;
  if (useWorkers) {
    try {
      const { accessSync, constants } = await import('node:fs');
      accessSync(workerUrl, constants.R_OK);
    } catch {
      console.warn(
        `atlas:observe — worker missing at ${workerUrl}; sequential fallback`,
      );
      useWorkers = false;
    }
  }

  const jobList: ObserveWorkerJob[] = Array.from({ length: games }, (_, game) => ({
    game,
    seed,
    sims,
    maxPlies,
    version,
    whiteKind,
    blackKind,
    ...(firstPlayerRelayCount !== undefined && Number.isFinite(firstPlayerRelayCount)
      ? { firstPlayerRelayCount }
      : {}),
  }));

  console.log(
    `atlas:observe — games=${games} jobs=${useWorkers ? jobs : 1} ` +
      `sims=${sims} ${whiteKind}v${blackKind} seed=${seed}` +
      (firstPlayerRelayCount !== undefined
        ? ` relay=${firstPlayerRelayCount}`
        : ''),
  );

  const bundles = await runPool(
    jobList,
    useWorkers ? jobs : 1,
    useWorkers ? workerUrl : null,
  );

  let hub = 0;
  let sector = 0;
  let noMoves = 0;
  let trunc = 0;
  let empFires = 0;
  let pliesSum = 0;

  for (const b of bundles) {
    for (const ply of b.plies) {
      appendFileSync(outPath, `${JSON.stringify(ply)}\n`);
    }
    appendFileSync(outPath, `${JSON.stringify(b.game)}\n`);
    hub += b.hub;
    sector += b.sector;
    noMoves += b.noMoves;
    trunc += b.trunc;
    empFires += b.empFires;
    pliesSum += b.pliesCount;
  }

  const summary = {
    type: 'summary' as const,
    games,
    hub,
    sector,
    noMoves,
    trunc,
    empFires,
    meanPlies: games === 0 ? 0 : pliesSum / games,
  };
  appendFileSync(outPath, `${JSON.stringify(summary)}\n`);

  console.log(`atlas:observe — wrote ${outPath}`);
  console.log(
    `atlas:observe — games=${games} hub=${hub} sector=${sector} lockout=${noMoves} trunc=${trunc} empFires=${empFires} meanPlies=${summary.meanPlies.toFixed(1)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
