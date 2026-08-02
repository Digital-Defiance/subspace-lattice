/**
 * Shared Deep-leaf move scoring for atlas:rate (CLI + worker).
 * No side effects — safe to import from workers.
 */
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
import type { GameState } from '../interfaces/gameState';
import type { RulesVersion } from '../rules/rules-config';

const PIECE_LABEL: Record<PieceType, string> = {
  [PieceType.CommandHub]: 'CommandHub',
  [PieceType.Escort]: 'Escort',
  [PieceType.Infiltrator]: 'Infiltrator',
  [PieceType.Beam]: 'Beam',
  [PieceType.Refractor]: 'Refractor',
  [PieceType.Carrier]: 'Carrier',
};

export type RatedMove = {
  key: string;
  label: string;
  pieceId?: string;
  to?: { x: number; y: number };
  emp?: boolean;
  mover: string;
  staticEval: number;
  /** Deep-leaf value for the side that just moved, in [-1, 1]. */
  deepValue: number | null;
  visits: number;
  winRate: number | null;
  reasons: string[];
};

export type RateMoveJob = {
  state: GameState;
  rulesVersion: RulesVersion;
  move: AgentMove;
  perspective: PlayerColor;
  sims: number;
  seed: number;
};

function moveLabel(engine: SubspaceLatticeEngine, move: AgentMove): string {
  if (isEmpAgentMove(move)) return 'EMP';
  const piece = engine.getPiece(move.pieceId);
  const mover = piece ? PIECE_LABEL[piece.type] : '?';
  const from = piece ? `${piece.position.x},${piece.position.y}` : '?';
  return `${mover}(${from})→(${move.to.x},${move.to.y})`;
}

export function createDeepLeafAi(sims: number, rng: () => number): MctsAi {
  return new MctsAi({
    simulations: sims,
    rng,
    name: `deep-leaf-${sims}`,
    maxRolloutPlies: 48,
    quiescencePlies: 10,
    rolloutEpsilon: 0.12,
    maxBranch: 56,
    exploration: 1.25,
  });
}

export function rateMoveDeepLeaf(
  engine: SubspaceLatticeEngine,
  move: AgentMove,
  perspective: PlayerColor,
  sims: number,
  seed: number,
): RatedMove {
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
  const label = moveLabel(engine, move);
  const key = agentMoveKey(move);

  const child = engine.clone();
  if (!applyAgentMove(child, move)) {
    return {
      key,
      label,
      pieceId,
      to,
      emp: isEmpAgentMove(move) || undefined,
      mover,
      staticEval: -1e9,
      deepValue: -1,
      visits: 0,
      winRate: null,
      reasons: ['illegal'],
    };
  }

  const staticEval = evaluatePosition(child, perspective);
  const winner = child.getState().winner;
  if (winner === perspective) {
    return {
      key,
      label,
      pieceId,
      to,
      emp: isEmpAgentMove(move) || undefined,
      mover,
      staticEval,
      deepValue: 1,
      visits: sims,
      winRate: 1,
      reasons,
    };
  }
  if (winner) {
    return {
      key,
      label,
      pieceId,
      to,
      emp: isEmpAgentMove(move) || undefined,
      mover,
      staticEval,
      deepValue: -1,
      visits: sims,
      winRate: 0,
      reasons,
    };
  }

  const stm = child.getState().currentPlayer;
  const ai = createDeepLeafAi(sims, createSeededRng(seed));
  ai.chooseMove(child);
  const stmValue = ai.getLastSearchValue();
  const deepValue =
    stmValue == null ? null : stm === perspective ? stmValue : -stmValue;

  return {
    key,
    label,
    pieceId,
    to,
    emp: isEmpAgentMove(move) || undefined,
    mover,
    staticEval,
    deepValue,
    visits: sims,
    winRate: deepValue == null ? null : (deepValue + 1) / 2,
    reasons,
  };
}

export { PIECE_LABEL, moveLabel };
