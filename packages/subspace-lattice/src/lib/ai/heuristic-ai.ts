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
 * Fires EMP on Lockout, strong soft freezes, and late/thin boards so charged
 * Overload actually ends games (Terminal / Lockout) instead of sitting unused.
 */
export class HeuristicAi implements Agent {
  readonly name = 'heuristic';

  constructor(private readonly rng: () => number = Math.random) {}

  public chooseMove(engine: SubspaceLatticeEngine): AiMoveChoice | null {
    const scored = this.scoreMoves(engine);
    if (scored.length === 0) {
      return engine.canFireEmp() ? { type: 'emp', score: 0 } : null;
    }

    const pick = pickBestAvoidingHubMate(engine, scored, this.rng);
    if (!pick) return null;
    if (isEmpAgentMove(pick)) {
      return {
        type: 'emp',
        score: scored.find((s) => isEmpAgentMove(s.move))!.score,
      };
    }
    return pick;
  }

  /**
   * Score every legal action (including EMP when fireable). Used by MCTS for
   * root priors and guided rollouts — no hub/trade filter applied here.
   */
  public scoreMoves(
    engine: SubspaceLatticeEngine,
  ): { move: AiMoveChoice; score: number }[] {
    const color = engine.getState().currentPlayer;
    const legal = engine.listLegalMoves(color);
    if (legal.length === 0 && !engine.canFireEmp()) return [];

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
      scored.push({
        move: { type: 'emp', score: empScore },
        score: empScore,
      });
    }

    return scored;
  }

  /**
   * Score a fireable EMP. Lockout is decisive. Soft midgame EMP is a *tactic*
   * (meaningful freeze + eval gain), not a default shuffle — equal heuristics
   * were firing ~20×/game and truncating (Atlas 2026-08-01). Still always
   * returns a finite score so charged Overload stays on the candidate list.
   */
  private scoreEmp(
    engine: SubspaceLatticeEngine,
    color: PlayerColor,
  ): number {
    const probe = engine.clone();
    if (!probe.fireEmp()) return -10_000;

    if (probe.getState().winnerReason === 'no-moves') {
      return 50_000;
    }

    const frozen = Object.values(probe.getState().pieces).filter((p) =>
      probe.isEmpDisabled(p),
    );
    const frozenCount = frozen.length;
    const hubFrozen = frozen.some((p) => p.type === PieceType.CommandHub);
    const before = evaluatePosition(engine, color);
    const after = evaluatePosition(probe, color);
    const delta = after - before;
    const enemy =
      color === PlayerColor.White ? PlayerColor.Black : PlayerColor.White;
    const enemyCount = Object.values(engine.getState().pieces).filter(
      (p) => p.owner === enemy,
    ).length;
    const myCount = Object.values(engine.getState().pieces).filter(
      (p) => p.owner === color,
    ).length;
    const terminal = engine.isTerminalOverclock(color);

    // Terminal miss: fused yourself without Lockout (already handled above).
    if (terminal) {
      return -5_000;
    }

    // Near-Lockout: only one enemy ship left outside the blast.
    if (enemyCount > 0 && frozenCount >= enemyCount - 1 && frozenCount >= 1) {
      return 320 + frozenCount * 40 + Math.max(0, delta);
    }

    // Strong soft EMP: freeze a cluster *and* clear standing gain.
    if (frozenCount >= 3 && delta >= 50) {
      return 160 + frozenCount * 30 + delta;
    }

    // Hub freeze with real standing gain (not break-even shuffle).
    if (hubFrozen && frozenCount >= 2 && delta >= 40) {
      return 120 + frozenCount * 20 + delta;
    }

    // Thin endgames only: use Overload to force Terminal / Lockout pressure.
    if (frozenCount >= 1 && enemyCount + myCount <= 6 && delta >= 20) {
      return 80 + frozenCount * 20 + Math.max(0, delta);
    }

    // Legal but not tactical — stay below routine piece play so mirrors do not
    // soft-EMP forever. Still above -∞ so search can pick it when nothing else
    // exists.
    if (delta >= 0 && frozenCount >= 1) {
      return 8 + frozenCount * 4;
    }

    return -60 + Math.min(0, delta);
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
    const plyNow = engine.getState().plyCount ?? 0;
    const totalPieces = Object.keys(engine.getState().pieces).length;
    const spoolAnnounce =
      engine.usesInfiltratorSpool() &&
      piece.type === PieceType.Infiltrator &&
      !piece.spoolTarget &&
      !engine.isPieceDetected(piece);

    // Prefer non-Hub moves while charging EMP (hold Hub ground) — except
    // Terminal Overclock, where the Hub itself is the charger.
    if (
      engine.empEnabled() &&
      piece.type !== PieceType.CommandHub &&
      engine.getEmpCharge(piece.owner) < engine.getEmpChargeTarget(piece.owner)
    ) {
      score += 8;
    }
    if (piece.type === PieceType.CommandHub && engine.empEnabled()) {
      if (engine.isTerminalOverclock(piece.owner)) {
        score += 10;
      } else {
        score -= 15;
      }
    }

    const target = engine.getPieceAt(to);
    if (target && !spoolAnnounce) {
      score += PIECE_VALUE[target.type] * 10;
      // Trade toward Terminal Overclock (both lone Hubs) — EMP alone with a
      // 1-ply midgame blackout cannot finish spread fleets.
      if (totalPieces <= 12 || plyNow >= 80) {
        score += PIECE_VALUE[target.type] * 5;
      }
      if (engine.isEmpDisabled(target)) {
        score += PIECE_VALUE[target.type] * 8;
      }
    } else if (target && spoolAnnounce) {
      score += PIECE_VALUE[target.type] * 3;
    }

    if (enemyHub) {
      if (engine.isTerminalOverclock(piece.owner)) {
        const before = Math.max(
          Math.abs(piece.position.x - enemyHub.position.x),
          Math.abs(piece.position.y - enemyHub.position.y),
        );
        const after = Math.max(
          Math.abs(to.x - enemyHub.position.x),
          Math.abs(to.y - enemyHub.position.y),
        );
        // Terminal blast geometry is Chebyshev (same as EMP radius).
        score += (before - after) * 12;
        const radius = engine.getEmpRadius(piece.owner);
        if (before > radius && after <= radius) score += 80;
        if (before <= radius && after > radius) score -= 60;
      } else {
        const before =
          Math.abs(piece.position.x - enemyHub.position.x) +
          Math.abs(piece.position.y - enemyHub.position.y);
        const after =
          Math.abs(to.x - enemyHub.position.x) +
          Math.abs(to.y - enemyHub.position.y);
        // Infiltrators can leap the whole board in one ply — uncapped Manhattan
        // closure made every opening tip "warp to (1,10)". Cap credit at a
        // short approach so Escorts / Beams stay competitive in the opening.
        const closed = before - after;
        const cappedClose =
          piece.type === PieceType.Infiltrator
            ? Math.min(closed, 3)
            : closed;
        score += cappedClose * (spoolAnnounce ? 1.5 : 3);
      }
    }

    // Mid/late: hunt nearest enemy ship so fleets re-engage. Without contact,
    // midgame EMP (1-ply blackout) and Terminal never get a board to finish.
    if (!target && (plyNow >= 48 || totalPieces <= 14)) {
      let nearestBefore = Number.POSITIVE_INFINITY;
      let nearestAfter = Number.POSITIVE_INFINITY;
      for (const enemy of Object.values(engine.getState().pieces)) {
        if (enemy.owner === piece.owner) continue;
        const b =
          Math.abs(piece.position.x - enemy.position.x) +
          Math.abs(piece.position.y - enemy.position.y);
        const a =
          Math.abs(to.x - enemy.position.x) + Math.abs(to.y - enemy.position.y);
        if (b < nearestBefore) nearestBefore = b;
        if (a < nearestAfter) nearestAfter = a;
      }
      if (Number.isFinite(nearestBefore)) {
        const closed = nearestBefore - nearestAfter;
        const capped =
          piece.type === PieceType.Infiltrator ? Math.min(closed, 4) : closed;
        score += capped * 5;
      }
    }

    // Opening: keep Infiltrators near the fleet; reward Escort net pushes.
    if (plyNow < 48 && engine.isHybrid()) {
      if (piece.type === PieceType.Escort && !target) {
        score += 6;
        // Trojan tip: landing ortho-adjacent to a parked (undetected) enemy
        // Infiltrator paints them and lets them take this Escort next.
        for (const enemy of Object.values(engine.getState().pieces)) {
          if (enemy.owner === piece.owner) continue;
          if (enemy.type !== PieceType.Infiltrator) continue;
          if (engine.isPieceDetected(enemy)) continue;
          const dx = Math.abs(enemy.position.x - to.x);
          const dy = Math.abs(enemy.position.y - to.y);
          if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
            score -= 90;
            break;
          }
        }
      }
      if (piece.type === PieceType.Infiltrator && !target) {
        const myHub = Object.values(engine.getState().pieces).find(
          (p) =>
            p.owner === piece.owner && p.type === PieceType.CommandHub,
        );
        if (myHub) {
          const fromHub = Math.max(
            Math.abs(piece.position.x - myHub.position.x),
            Math.abs(piece.position.y - myHub.position.y),
          );
          const toHub = Math.max(
            Math.abs(to.x - myHub.position.x),
            Math.abs(to.y - myHub.position.y),
          );
          if (toHub > fromHub + 3) {
            score -= (toHub - fromHub) * 4;
          }
        }
      }
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
