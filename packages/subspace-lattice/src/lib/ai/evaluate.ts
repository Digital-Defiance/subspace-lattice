import { SubspaceLatticeEngine } from '../game-engine';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';

const PIECE_VALUE: Record<PieceType, number> = {
  [PieceType.CommandHub]: 10_000,
  [PieceType.Beam]: 50,
  [PieceType.Infiltrator]: 40,
  [PieceType.Escort]: 25,
};

/**
 * Static evaluation from `perspective`'s point of view (higher = better).
 * Hybrid-aware: net size, sector progress, detection, mobility.
 */
export function evaluatePosition(
  engine: SubspaceLatticeEngine,
  perspective: PlayerColor,
): number {
  const state = engine.getState();
  if (state.winner) {
    return state.winner === perspective ? 100_000 : -100_000;
  }

  const enemy =
    perspective === PlayerColor.White
      ? PlayerColor.Black
      : PlayerColor.White;

  let score = 0;
  let myHubDist = Number.POSITIVE_INFINITY;
  let enemyHub: { x: number; y: number } | undefined;
  let myHub: { x: number; y: number } | undefined;

  for (const piece of Object.values(state.pieces)) {
    const value = PIECE_VALUE[piece.type];
    if (piece.owner === perspective) {
      score += value;
      if (piece.type === PieceType.CommandHub) {
        myHub = piece.position;
      }
    } else {
      score -= value;
      if (piece.type === PieceType.CommandHub) {
        enemyHub = piece.position;
      }
    }
  }

  if (!myHub) return -100_000;
  if (!enemyHub) return 100_000;

  for (const piece of Object.values(state.pieces)) {
    if (piece.owner !== perspective) continue;
    const d =
      Math.abs(piece.position.x - enemyHub.x) +
      Math.abs(piece.position.y - enemyHub.y);
    if (d < myHubDist) myHubDist = d;
  }
  score += (30 - Math.min(30, myHubDist)) * 2;

  const myMobility = engine.listLegalMoves(perspective).length;
  const enemyMobility = engine.listLegalMoves(enemy).length;
  score += (myMobility - enemyMobility) * 0.35;

  if (engine.isHybrid()) {
    const mySector = engine.sectorControlRatio(perspective);
    const enemySector = engine.sectorControlRatio(enemy);
    score += (mySector - enemySector) * 400;
    score += (engine.getSensorNetSet(perspective).size -
      engine.getSensorNetSet(enemy).size) *
      0.15;

    let detectedMine = 0;
    let detectedTheirs = 0;
    for (const piece of Object.values(state.pieces)) {
      if (engine.isPieceDetected(piece)) {
        if (piece.owner === perspective) detectedMine += 1;
        else detectedTheirs += 1;
      }
    }
    score += (detectedTheirs - detectedMine) * 8;
  }

  return score;
}
