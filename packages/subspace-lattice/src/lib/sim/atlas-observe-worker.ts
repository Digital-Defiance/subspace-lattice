/**
 * Worker for atlas:observe — plays one match and returns serializable rows.
 * Bundled to dist/atlas-observe-worker.mjs by scripts/atlas-observe.sh.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { createSeededRng } from '../ai/rng';
import { HeuristicAi } from '../ai/heuristic-ai';
import { MctsAi } from '../ai/mcts-ai';
import { RandomLegalAgent } from '../ai/random-legal-agent';
import type { Agent } from '../ai/agent';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { resolveRulesConfig, type RulesVersion } from '../rules/rules-config';
import { playMatch } from './match-runner';

const PIECE_LABEL: Record<PieceType, string> = {
  [PieceType.CommandHub]: 'CommandHub',
  [PieceType.Escort]: 'Escort',
  [PieceType.Infiltrator]: 'Infiltrator',
  [PieceType.Beam]: 'Beam',
  [PieceType.Refractor]: 'Refractor',
  [PieceType.Carrier]: 'Carrier',
};

type AgentKind = 'heuristic' | 'random' | 'mcts';

export type ObserveWorkerJob = {
  game: number;
  seed: number;
  sims: number;
  maxPlies: number;
  version: RulesVersion;
  whiteKind: AgentKind;
  blackKind: AgentKind;
  firstPlayerRelayCount?: number;
};

function makeAgent(kind: AgentKind, seed: number, sims: number): Agent {
  const rng = createSeededRng(seed);
  if (kind === 'heuristic') return new HeuristicAi(rng);
  if (kind === 'random') return new RandomLegalAgent(rng);
  return new MctsAi({ simulations: sims, rng });
}

const job = workerData as ObserveWorkerJob;
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

parentPort?.postMessage({
  game: {
    type: 'game' as const,
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
});
