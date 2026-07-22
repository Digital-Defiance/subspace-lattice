import { SubspaceLatticeEngine } from '../game-engine';
import { PieceType } from '../interfaces/pieceType';
import { AgentMove } from './agent';
import { evaluatePosition } from './evaluate';

/** Capture enemy Command Hub if any legal move does so. */
export function findHubCaptureMove(
  engine: SubspaceLatticeEngine,
): AgentMove | null {
  const legal = engine.listLegalMoves();
  for (const move of legal) {
    const target = engine.getPieceAt(move.to);
    if (target?.type === PieceType.CommandHub) {
      return { pieceId: move.pieceId, to: move.to };
    }
  }
  return null;
}

/**
 * One-ply look ahead: take any move that ends the game in our favor,
 * else null (caller continues with search).
 */
export function findImmediateWinningMove(
  engine: SubspaceLatticeEngine,
): AgentMove | null {
  const hub = findHubCaptureMove(engine);
  if (hub) return hub;

  const me = engine.getState().currentPlayer;
  for (const move of engine.listLegalMoves()) {
    const child = engine.clone();
    if (!child.movePiece(move.pieceId, move.to)) continue;
    if (child.getState().winner === me) {
      return { pieceId: move.pieceId, to: move.to };
    }
  }
  return null;
}

/**
 * Shallow maximizer over evaluatePosition after each legal move.
 * Depth 1 only (branching is large under hybrid infiltrator warps).
 */
export function shallowBestMove(
  engine: SubspaceLatticeEngine,
  rng: () => number = Math.random,
): AgentMove | null {
  const me = engine.getState().currentPlayer;
  const legal = engine.listLegalMoves();
  if (legal.length === 0) return null;

  let bestScore = Number.NEGATIVE_INFINITY;
  const best: AgentMove[] = [];

  for (const move of legal) {
    const child = engine.clone();
    if (!child.movePiece(move.pieceId, move.to)) continue;
    const score = evaluatePosition(child, me);
    const choice = { pieceId: move.pieceId, to: move.to };
    if (score > bestScore) {
      bestScore = score;
      best.length = 0;
      best.push(choice);
    } else if (score === bestScore) {
      best.push(choice);
    }
  }

  if (best.length === 0) return null;
  const index = Math.min(best.length - 1, Math.floor(rng() * best.length));
  return best[index] ?? null;
}
