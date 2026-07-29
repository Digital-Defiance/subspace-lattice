import { SubspaceLatticeEngine } from '../game-engine';
import { Agent, AgentMove } from './agent';
import { Coordinate } from '../interfaces/coordinate';
import { Piece } from '../interfaces/piece';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { pickBestAvoidingHubMate } from './tactical';

export type AiMoveChoice = AgentMove & {
  from?: Coordinate;
  score: number;
};

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
 * Fires EMP when it forces Lockout (or as a strong freeze).
 * Tie-breaks via injected RNG (default Math.random).
 */
export class HeuristicAi implements Agent {
  readonly name = 'heuristic';

  constructor(private readonly rng: () => number = Math.random) {}

  public chooseMove(engine: SubspaceLatticeEngine): AiMoveChoice | null {
    const color = engine.getState().currentPlayer;

    if (engine.canFireEmp()) {
      const probe = engine.clone();
      if (probe.fireEmp()) {
        if (probe.getState().winnerReason === 'no-moves') {
          return { type: 'emp', score: 50_000 };
        }
        // Soft preference: freeze when many enemy pieces are hit.
        const blast = probe.getState().empActive;
        if (blast) {
          const frozen = Object.values(probe.getState().pieces).filter((p) =>
            probe.isEmpDisabled(p),
          ).length;
          if (frozen >= 3 && this.rng() < 0.35) {
            return { type: 'emp', score: 200 + frozen * 40 };
          }
        }
      }
    }

    const legal = engine.listLegalMoves(color);
    if (legal.length === 0) {
      return engine.canFireEmp() ? { type: 'emp', score: 0 } : null;
    }

    const enemyHub = Object.values(engine.getState().pieces).find(
      (p) => p.owner !== color && p.type === PieceType.CommandHub,
    );

    const scored = legal.map((move) => {
      const score = this.scoreMove(engine, move.pieceId, move.to, enemyHub);
      return {
        move: {
          type: 'move' as const,
          pieceId: move.pieceId,
          to: move.to,
          from: move.from,
          score,
        },
        score,
      };
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

    // Prefer non-Hub moves while charging EMP (hold Hub ground).
    if (
      engine.empEnabled() &&
      piece.type !== PieceType.CommandHub &&
      engine.getEmpCharge(piece.owner) < engine.getEmpChargeTarget()
    ) {
      score += 8;
    }
    if (piece.type === PieceType.CommandHub && engine.empEnabled()) {
      score -= 15;
    }

    const target = engine.getPieceAt(to);
    if (target && !spoolAnnounce) {
      score += PIECE_VALUE[target.type] * 10;
    } else if (target && spoolAnnounce) {
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
