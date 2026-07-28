import { SubspaceLatticeEngine } from '../game-engine';
import { Agent, AgentMove } from './agent';
import { Coordinate } from '../interfaces/coordinate';
import { Piece } from '../interfaces/piece';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { pickBestAvoidingHubMate } from './tactical';

export interface AiMoveChoice extends AgentMove {
  from: Coordinate;
  score: number;
}

const PIECE_VALUE: Record<PieceType, number> = {
  [PieceType.CommandHub]: 10_000,
  [PieceType.Carrier]: 90,
  [PieceType.Refractor]: 55,
  [PieceType.Beam]: 50,
  [PieceType.Infiltrator]: 40,
  [PieceType.Escort]: 25,
};

/**
 * Deterministic-friendly heuristic AI for local testing and ladder baseline.
 * Prefers capturing the command hub, then material, then closing distance
 * on the enemy hub. Never walks into an avoidable Surgical Strike reply.
 * Tie-breaks via injected RNG (default Math.random).
 */
export class HeuristicAi implements Agent {
  readonly name = 'heuristic';

  constructor(private readonly rng: () => number = Math.random) {}

  public chooseMove(engine: SubspaceLatticeEngine): AiMoveChoice | null {
    const color = engine.getState().currentPlayer;
    const legal = engine.listLegalMoves(color);
    if (legal.length === 0) return null;

    const enemyHub = Object.values(engine.getState().pieces).find(
      (p) => p.owner !== color && p.type === PieceType.CommandHub,
    );

    const scored = legal.map((move) => {
      const score = this.scoreMove(engine, move.pieceId, move.to, enemyHub);
      return { move: { ...move, score } as AiMoveChoice, score };
    });

    return pickBestAvoidingHubMate(engine, scored, this.rng);
  }

  private scoreMove(
    engine: SubspaceLatticeEngine,
    pieceId: string,
    to: Coordinate,
    enemyHub: Piece | undefined,
  ): number {
    const piece = engine.getPiece(pieceId);
    if (!piece) return Number.NEGATIVE_INFINITY;

    let score = 0;
    const spoolAnnounce =
      engine.usesInfiltratorSpool() &&
      piece.type === PieceType.Infiltrator &&
      !piece.spoolTarget &&
      !engine.isPieceDetected(piece);

    const target = engine.getPieceAt(to);
    if (target && !spoolAnnounce) {
      score += PIECE_VALUE[target.type] * 10;
    } else if (target && spoolAnnounce) {
      // Locking a capture lane is valuable but not an immediate capture.
      score += PIECE_VALUE[target.type] * 3;
    }

    if (enemyHub) {
      const before =
        Math.abs(piece.position.x - enemyHub.position.x) +
        Math.abs(piece.position.y - enemyHub.position.y);
      const after =
        Math.abs(to.x - enemyHub.position.x) +
        Math.abs(to.y - enemyHub.position.y);
      score += (before - after) * (spoolAnnounce ? 1.5 : 3);
    }

    if (piece.owner === PlayerColor.Black) {
      score += piece.position.y - to.y;
    } else {
      score += to.y - piece.position.y;
    }

    return score;
  }
}

export { createSequenceRng, createSeededRng } from './rng';
