import { SubspaceLatticeEngine } from '../game-engine';
import { Agent, AgentMove, isEmpAgentMove } from './agent';
import { Coordinate } from '../interfaces/coordinate';
import { Piece } from '../interfaces/piece';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { evaluatePosition, PIECE_VALUE } from './evaluate';
import { pickBestAvoidingHubMate } from './tactical';

export type AiMoveChoice = AgentMove & {
  from?: Coordinate;
  score: number;
};

/**
 * Deterministic-friendly heuristic AI for local testing and ladder baseline.
 * Prefers capturing the command hub, then material, then closing distance
 * on the enemy hub. Avoids avoidable Surgical Strikes and losing trades.
 * Fires EMP on Lockout, or when the static eval clearly improves.
 */
export class HeuristicAi implements Agent {
  readonly name = 'heuristic';

  constructor(private readonly rng: () => number = Math.random) {}

  public chooseMove(engine: SubspaceLatticeEngine): AiMoveChoice | null {
    const color = engine.getState().currentPlayer;

    const legal = engine.listLegalMoves(color);
    if (legal.length === 0 && !engine.canFireEmp()) {
      return null;
    }

    const enemyHub = Object.values(engine.getState().pieces).find(
      (p) => p.owner !== color && p.type === PieceType.CommandHub,
    );

    const scored: { move: AiMoveChoice; score: number }[] = legal.map(
      (move) => {
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
      },
    );

    if (engine.canFireEmp()) {
      const empScore = this.scoreEmp(engine, color);
      if (empScore != null) {
        scored.push({
          move: { type: 'emp', score: empScore },
          score: empScore,
        });
      }
    }

    if (scored.length === 0) {
      return engine.canFireEmp() ? { type: 'emp', score: 0 } : null;
    }

    const pick = pickBestAvoidingHubMate(engine, scored, this.rng);
    if (!pick) return null;
    if (isEmpAgentMove(pick)) {
      return { type: 'emp', score: scored.find((s) => isEmpAgentMove(s.move))!.score };
    }
    return pick;
  }

  /**
   * Lockout → always. Soft EMP only when eval after fire beats standing pat
   * by a clear margin and freezes at least two ships (no RNG suicide).
   */
  private scoreEmp(
    engine: SubspaceLatticeEngine,
    color: PlayerColor,
  ): number | null {
    const probe = engine.clone();
    if (!probe.fireEmp()) return null;
    if (probe.getState().winnerReason === 'no-moves') {
      return 50_000;
    }
    const frozen = Object.values(probe.getState().pieces).filter((p) =>
      probe.isEmpDisabled(p),
    ).length;
    if (frozen < 2) return null;

    const before = evaluatePosition(engine, color);
    const after = evaluatePosition(probe, color);
    if (after < before + 35) return null;
    return 180 + frozen * 35 + (after - before);
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
