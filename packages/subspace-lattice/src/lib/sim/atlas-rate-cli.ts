/**
 * Lattice Atlas rate — build an opening playbook frontier.
 *
 * Modes:
 *   deep-leaf (default) — for each legal move, play it, then run Deep-shaped
 *     MCTS@sims on the child; score = value for the mover. Honest ranking.
 *   root — one shared root MCTS + static eval (fast, weak with wide fan-out).
 *
 * Usage (worthwhile overnight map):
 *   yarn atlas:rate --mode deep-leaf --depth 1 --sims 800 --jobs 8
 *
 * Then expand top 12:
 *   yarn atlas:rate --mode deep-leaf --depth 2 --top 12 --sims 800 \
 *     --reply-sims 400 --jobs 8 \
 *     --from docs/atlas/runs/opening-rate-deep-leaf-d1-s800.json
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import {
  applyAgentMove,
  agentMoveKey,
  isEmpAgentMove,
  type AgentMove,
} from '../ai/agent';
import { explainAdvisorMove } from '../ai/advisor';
import { evaluatePosition } from '../ai/evaluate';
import { MctsAi } from '../ai/mcts-ai';
import { createSeededRng } from '../ai/rng';
import { SubspaceLatticeEngine } from '../game-engine';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { resolveRulesConfig, type RulesVersion } from '../rules/rules-config';
import {
  moveLabel,
  PIECE_LABEL,
  rateMoveDeepLeaf,
  type RatedMove,
  type RateMoveJob,
} from './atlas-rate-lib';

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

function listRootMoves(engine: SubspaceLatticeEngine): AgentMove[] {
  const moves: AgentMove[] = engine.listLegalMoves().map((m) => ({
    pieceId: m.pieceId,
    to: m.to,
  }));
  if (engine.canFireEmp()) moves.push({ type: 'emp' });
  return moves;
}

function sortRated(rated: RatedMove[]): RatedMove[] {
  return [...rated].sort((a, b) => {
    const da = a.deepValue ?? Number.NEGATIVE_INFINITY;
    const db = b.deepValue ?? Number.NEGATIVE_INFINITY;
    if (db !== da) return db - da;
    return b.staticEval - a.staticEval;
  });
}

function rateAllStaticPlusRoot(
  engine: SubspaceLatticeEngine,
  perspective: PlayerColor,
  sims: number,
  maxBranch: number,
  seed: number,
): RatedMove[] {
  const legal = listRootMoves(engine);
  const visitMap = new Map<string, { visits: number; winRate: number }>();
  if (sims > 0) {
    const mcts = new MctsAi({
      simulations: sims,
      maxBranch,
      rng: createSeededRng(seed),
      name: `atlas-rate-root-${sims}`,
      quiescencePlies: 4,
      rolloutEpsilon: 0.15,
    });
    for (const row of mcts.analyzeRoot(engine)) {
      visitMap.set(agentMoveKey(row.move), {
        visits: row.visits,
        winRate: row.winRate,
      });
    }
  }

  const rated: RatedMove[] = [];
  for (const move of legal) {
    const child = engine.clone();
    if (!applyAgentMove(child, move)) continue;
    const staticEval = evaluatePosition(child, perspective);
    const key = agentMoveKey(move);
    const mctsRow = visitMap.get(key);
    const reasons = explainAdvisorMove(engine, move, perspective).slice(0, 3);
    let mover = 'EMP';
    let pieceId: string | undefined;
    let to: { x: number; y: number } | undefined;
    if (!isEmpAgentMove(move)) {
      const piece = engine.getPiece(move.pieceId);
      mover = piece ? PIECE_LABEL[piece.type] : '?';
      pieceId = move.pieceId;
      to = { ...move.to };
    }
    rated.push({
      key,
      label: moveLabel(engine, move),
      pieceId,
      to,
      emp: isEmpAgentMove(move) || undefined,
      mover,
      staticEval,
      deepValue: mctsRow ? 2 * mctsRow.winRate - 1 : null,
      visits: mctsRow?.visits ?? 0,
      winRate: mctsRow ? mctsRow.winRate : null,
      reasons,
    });
  }
  return sortRated(rated);
}

async function rateDeepLeafParallel(
  engine: SubspaceLatticeEngine,
  perspective: PlayerColor,
  sims: number,
  seed: number,
  jobs: number,
  workerUrl: string,
): Promise<RatedMove[]> {
  const legal = listRootMoves(engine);
  const state = engine.getStateCopy();
  const rulesVersion = engine.getRules().version;
  const results: RatedMove[] = new Array(legal.length);
  let done = 0;
  const t0 = Date.now();
  const queue = legal.map((move, index) => ({ move, index }));
  const workers = Math.max(1, Math.min(jobs, legal.length));

  await new Promise<void>((resolve, reject) => {
    let q = 0;
    let finishedWorkers = 0;
    let rejected = false;

    const fail = (err: Error) => {
      if (rejected) return;
      rejected = true;
      reject(err);
    };

    const pump = (worker: Worker) => {
      if (rejected) {
        void worker.terminate();
        return;
      }
      if (q >= queue.length) {
        void worker.terminate();
        finishedWorkers += 1;
        if (finishedWorkers >= workers) resolve();
        return;
      }
      const item = queue[q]!;
      q += 1;
      const job: RateMoveJob = {
        state,
        rulesVersion,
        move: item.move,
        perspective,
        sims,
        seed: seed + item.index * 17,
      };
      worker.postMessage({ id: item.index, job });
    };

    for (let w = 0; w < workers; w++) {
      const worker = new Worker(workerUrl);
      worker.on(
        'message',
        (msg: {
          id: number;
          ok: boolean;
          result?: RatedMove;
          error?: string;
        }) => {
          if (!msg.ok || !msg.result) {
            fail(new Error(msg.error ?? 'worker failed'));
            return;
          }
          results[msg.id] = msg.result;
          done += 1;
          if (done % 5 === 0 || done === legal.length) {
            const elapsed = (Date.now() - t0) / 1000;
            const rate = done / Math.max(1e-6, elapsed);
            const eta = (legal.length - done) / Math.max(1e-6, rate);
            console.log(
              `atlas:rate — ${done}/${legal.length} deep-leaf ` +
                `(${elapsed.toFixed(0)}s, ~${eta.toFixed(0)}s left)`,
            );
          }
          pump(worker);
        },
      );
      worker.on('error', (err) => fail(err));
      pump(worker);
    }
  });

  return sortRated(results.filter(Boolean));
}

function rateDeepLeafSequential(
  engine: SubspaceLatticeEngine,
  perspective: PlayerColor,
  sims: number,
  seed: number,
): RatedMove[] {
  const legal = listRootMoves(engine);
  const rated: RatedMove[] = [];
  const t0 = Date.now();
  for (let i = 0; i < legal.length; i++) {
    const move = legal[i]!;
    rated.push(
      rateMoveDeepLeaf(engine, move, perspective, sims, seed + i * 17),
    );
    if ((i + 1) % 5 === 0 || i + 1 === legal.length) {
      const elapsed = (Date.now() - t0) / 1000;
      const rate = (i + 1) / Math.max(1e-6, elapsed);
      const eta = (legal.length - i - 1) / Math.max(1e-6, rate);
      console.log(
        `atlas:rate — ${i + 1}/${legal.length} deep-leaf ` +
          `(${elapsed.toFixed(0)}s, ~${eta.toFixed(0)}s left)`,
      );
    }
  }
  return sortRated(rated);
}

function toAgentMove(row: RatedMove): AgentMove {
  if (row.emp) return { type: 'emp' };
  return { pieceId: row.pieceId!, to: row.to! };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const mode = (argValue(argv, '--mode') ?? 'deep-leaf') as
    | 'deep-leaf'
    | 'root';
  const depth = argInt(argv, '--depth', 1);
  const sims = argInt(argv, '--sims', 800);
  const maxBranch = argInt(argv, '--max-branch', 200);
  const top = argInt(argv, '--top', 12);
  const replySims = argInt(argv, '--reply-sims', 400);
  const seed = argInt(argv, '--seed', 41);
  const jobs = argInt(
    argv,
    '--jobs',
    Math.max(1, availableParallelism() - 1),
  );
  const version = (argValue(argv, '--rules') ?? 'hybrid-fleet') as RulesVersion;
  const fromPath = argValue(argv, '--from');
  const outPath = path.resolve(
    argValue(argv, '--out') ??
      `docs/atlas/runs/opening-rate-${mode}-d${depth}-s${sims}.json`,
  );

  const rules = resolveRulesConfig(version);
  const root = new SubspaceLatticeEngine({ rules });
  const white = PlayerColor.White;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const workerUrl = path.resolve(here, 'atlas-rate-worker.mjs');
  const useWorkers =
    mode === 'deep-leaf' && jobs > 1 && existsSync(workerUrl);

  console.log(
    `atlas:rate — mode=${mode} depth=${depth} sims=${sims} top=${top} ` +
      `jobs=${useWorkers ? jobs : 1} legal=${listRootMoves(root).length}`,
  );
  if (mode === 'deep-leaf' && jobs > 1 && !existsSync(workerUrl)) {
    console.log(
      `atlas:rate — worker missing at ${workerUrl}; falling back to sequential`,
    );
  }

  let ply0: RatedMove[];
  const t0 = Date.now();

  if (fromPath && depth >= 2) {
    const prior = JSON.parse(readFileSync(path.resolve(fromPath), 'utf8')) as {
      ply0?: { all?: RatedMove[]; byDeep?: RatedMove[] };
    };
    ply0 = prior.ply0?.byDeep ?? prior.ply0?.all ?? [];
    if (ply0.length === 0) {
      throw new Error(`--from ${fromPath} has no ply0 rankings`);
    }
    ply0 = sortRated(ply0);
    console.log(
      `atlas:rate — loaded ${ply0.length} ply-0 rows from ${fromPath}`,
    );
  } else if (mode === 'deep-leaf') {
    ply0 = useWorkers
      ? await rateDeepLeafParallel(
          root,
          white,
          sims,
          seed,
          jobs,
          workerUrl,
        )
      : rateDeepLeafSequential(root, white, sims, seed);
  } else {
    ply0 = rateAllStaticPlusRoot(root, white, sims, maxBranch, seed);
  }

  console.log(
    `atlas:rate — ply-0 done in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );

  const byMover: Record<string, number> = {};
  for (const row of ply0) {
    byMover[row.mover] = (byMover[row.mover] ?? 0) + 1;
  }

  type ReplyTree = { white: RatedMove; blackReplies: RatedMove[] };
  const depth2: ReplyTree[] = [];

  if (depth >= 2) {
    const expand = sortRated(ply0).slice(0, top);
    for (const whiteMove of expand) {
      const afterWhite = root.clone();
      if (!applyAgentMove(afterWhite, toAgentMove(whiteMove))) continue;
      console.log(`atlas:rate — expanding replies after ${whiteMove.label}`);
      const blackReplies =
        mode === 'deep-leaf'
          ? useWorkers
            ? await rateDeepLeafParallel(
                afterWhite,
                PlayerColor.Black,
                replySims,
                seed + 1000,
                jobs,
                workerUrl,
              )
            : rateDeepLeafSequential(
                afterWhite,
                PlayerColor.Black,
                replySims,
                seed + 1000,
              )
          : rateAllStaticPlusRoot(
              afterWhite,
              PlayerColor.Black,
              replySims,
              120,
              seed + 1000,
            );
      depth2.push({
        white: whiteMove,
        blackReplies: blackReplies.slice(0, top),
      });
    }
  }

  const byDeep = sortRated(ply0);
  const draft = {
    generator: 'atlas-rate',
    at: new Date().toISOString(),
    mode,
    rulesVersion: rules.version,
    depth,
    sims,
    replySims: depth >= 2 ? replySims : undefined,
    maxBranch,
    top,
    seed,
    jobs: useWorkers ? jobs : 1,
    legalCount: ply0.length,
    byMoverType: byMover,
    ply0: {
      byDeep: byDeep.slice(0, 40),
      byStatic: [...ply0]
        .sort((a, b) => b.staticEval - a.staticEval)
        .slice(0, 40),
      all: byDeep,
    },
    depth2,
  };

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(draft, null, 2)}\n`);

  console.log(`atlas:rate — wrote ${outPath}`);
  console.log('Top by deep value:');
  for (const row of byDeep.slice(0, 12)) {
    console.log(
      `  deep=${row.deepValue?.toFixed(3) ?? '—'}  eval=${row.staticEval.toFixed(1)}  ${row.label}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
