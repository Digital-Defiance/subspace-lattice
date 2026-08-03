import { SubspaceLatticeEngine } from '../game-engine';
import type { Coordinate } from '../interfaces/coordinate';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { tryNeuralValue } from './neural-value';
import { empLockoutFilterEnabled, hubInOneEvalEnabled } from './tactical';

export const PIECE_VALUE: Record<PieceType, number> = {
  [PieceType.CommandHub]: 10_000,
  [PieceType.Carrier]: 90,
  [PieceType.Refractor]: 55,
  [PieceType.Beam]: 50,
  [PieceType.Infiltrator]: 40,
  [PieceType.Escort]: 25,
};

export function pieceMaterialValue(type: PieceType): number {
  return PIECE_VALUE[type];
}

function chebyshev(a: Coordinate, b: Coordinate): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function sideToMoveCanCaptureHub(engine: SubspaceLatticeEngine): boolean {
  for (const move of engine.listLegalMoves()) {
    if (engine.getPieceAt(move.to)?.type === PieceType.CommandHub) {
      return true;
    }
  }
  return false;
}

/** Side to move can fire EMP and win immediately on Lockout. */
function sideToMoveCanEmpLockout(engine: SubspaceLatticeEngine): boolean {
  if (!engine.empEnabled() || !engine.canFireEmp()) return false;
  const mover = engine.getState().currentPlayer;
  const probe = engine.clone();
  if (!probe.fireEmp()) return false;
  const state = probe.getState();
  return state.winner === mover && state.winnerReason === 'no-moves';
}

/** Charge is full — may fire on that color's turn (ignores side-to-move). */
function empChargeReady(
  engine: SubspaceLatticeEngine,
  color: PlayerColor,
): boolean {
  return engine.getEmpCharge(color) >= engine.getEmpChargeTarget(color);
}

/**
 * Soft midgame: how bad/good is a charged EMP from `firer`'s Hub against
 * `victim`'s fleet geometry (Chebyshev ≤ radius). HeuristicAi converts these
 * shots; the leaf must price them before charge is spent.
 * Returns a magnitude ≥ 0 (caller applies sign).
 */
function chargedEmpBlastMagnitude(
  engine: SubspaceLatticeEngine,
  firer: PlayerColor,
  victim: PlayerColor,
): number {
  if (!empChargeReady(engine, firer)) return 0;
  const hub = Object.values(engine.getState().pieces).find(
    (p) => p.owner === firer && p.type === PieceType.CommandHub,
  );
  if (!hub || hub.enginesFused) return 0;
  if (engine.isEmpDisabled(hub)) return 0;

  const radius = engine.getEmpRadius(firer);
  let inBlast = 0;
  let victimCount = 0;
  let hubInBlast = false;
  for (const piece of Object.values(engine.getState().pieces)) {
    if (piece.owner !== victim) continue;
    victimCount += 1;
    if (chebyshev(piece.position, hub.position) > radius) continue;
    inBlast += 1;
    if (piece.type === PieceType.CommandHub) hubInBlast = true;
  }
  if (inBlast === 0) return 0;
  // Total freeze geometry ≈ Lockout if they fire on their turn.
  if (victimCount > 0 && inBlast >= victimCount) return 6_000;
  if (hubInBlast && inBlast >= 2) return 900 + inBlast * 120;
  if (inBlast >= 3) return 400 + inBlast * 70;
  if (inBlast >= 2) return 180 + inBlast * 40;
  return hubInBlast ? 120 : 35 * inBlast;
}

/** Net soft-EMP charge threat from `perspective`'s point of view. */
function softEmpChargeThreat(
  engine: SubspaceLatticeEngine,
  perspective: PlayerColor,
): number {
  if (!engine.empEnabled() || !empLockoutFilterEnabled()) return 0;
  const enemy =
    perspective === PlayerColor.White
      ? PlayerColor.Black
      : PlayerColor.White;
  const toMove = engine.getState().currentPlayer;
  let score =
    chargedEmpBlastMagnitude(engine, perspective, enemy) -
    chargedEmpBlastMagnitude(engine, enemy, perspective);
  // Side-to-move with a Lockout-geometry blast is almost the in-one case
  // (handled above); still amplify "they are about to fire" when it's theirs.
  if (toMove === enemy) {
    const theirs = chargedEmpBlastMagnitude(engine, enemy, perspective);
    if (theirs >= 6_000) score -= 2_000;
    else if (theirs >= 900) score -= 400;
  } else if (toMove === perspective) {
    const ours = chargedEmpBlastMagnitude(engine, perspective, enemy);
    if (ours >= 6_000) score += 2_000;
    else if (ours >= 900) score += 400;
  }
  return score;
}

/**
 * Terminal Overclock / EMP endgame features.
 * Material is nearly dead once only Hubs remain — charge, blast range, and
 * Lockout proximity dominate.
 */
function terminalEmpEval(
  engine: SubspaceLatticeEngine,
  perspective: PlayerColor,
  myHub: Coordinate,
  enemyHub: Coordinate,
): number {
  if (!engine.empEnabled()) return 0;

  const enemy =
    perspective === PlayerColor.White
      ? PlayerColor.Black
      : PlayerColor.White;
  const myTerm = engine.isTerminalOverclock(perspective);
  const theirTerm = engine.isTerminalOverclock(enemy);
  const phaseArmed = Boolean(engine.getState().terminalPhaseArmed);

  if (!myTerm && !theirTerm && !phaseArmed) {
    // Soft midgame EMP: count ships currently seized by a live blast.
    let score = softEmpChargeThreat(engine, perspective);
    for (const piece of Object.values(engine.getState().pieces)) {
      if (!engine.isEmpDisabled(piece)) continue;
      const v = PIECE_VALUE[piece.type] * 0.35;
      if (piece.owner === perspective) score -= v;
      else score += v;
    }
    return score;
  }

  let score = 0;
  const dist = chebyshev(myHub, enemyHub);
  const toMove = engine.getState().currentPlayer;

  const chargeTerm = (color: PlayerColor, sign: 1 | -1) => {
    if (!engine.isTerminalOverclock(color) && !phaseArmed) return;
    const target = Math.max(1, engine.getEmpChargeTarget(color));
    const charge = engine.getEmpCharge(color);
    score += sign * (charge / target) * 140;
  };
  chargeTerm(perspective, 1);
  chargeTerm(enemy, -1);

  if (myTerm || phaseArmed) {
    const radius = engine.getEmpRadius(perspective);
    if (dist <= radius) {
      score += 220;
      if (empChargeReady(engine, perspective)) {
        // Armed Lockout shot — near-decisive (below hub-mate 99k).
        score += toMove === perspective ? 5_500 : 2_800;
      }
    } else {
      // Close the gap into growing blast range.
      const outside = dist - radius;
      score += (16 - Math.min(16, outside)) * 10;
      if (empChargeReady(engine, perspective) && toMove === perspective) {
        // Self-fuse miss: fire now and you die later.
        score -= 2_400;
      }
    }
  }

  if (theirTerm || phaseArmed) {
    const radius = engine.getEmpRadius(enemy);
    if (dist <= radius) {
      score -= 220;
      if (empChargeReady(engine, enemy)) {
        score -= toMove === enemy ? 5_500 : 2_800;
      }
    } else {
      const outside = dist - radius;
      score -= (16 - Math.min(16, outside)) * 10;
    }
  }

  // Amplify Lockout proximity once fleets are fused or nearly immobile.
  if (myTerm || theirTerm) {
    const myMoves = engine.listLegalMoves(perspective).length;
    const theirMoves = engine.listLegalMoves(enemy).length;
    score += (myMoves - theirMoves) * 4;
  }

  return score;
}

/**
 * Static evaluation from `perspective`'s point of view (higher = better).
 * Hybrid-aware: net size, sector progress, detection, mobility.
 * Terminal Overclock: EMP charge, blast range, Lockout proximity.
 * Positions where the side to move can Surgical-Strike the hub score as near-terminal.
 */
export function evaluatePosition(
  engine: SubspaceLatticeEngine,
  perspective: PlayerColor,
): number {
  const state = engine.getState();
  if (state.winner) {
    return state.winner === perspective ? 100_000 : -100_000;
  }

  // Hub-in-one: side to move can capture Command Hub — treat as decided.
  if (hubInOneEvalEnabled() && sideToMoveCanCaptureHub(engine)) {
    return state.currentPlayer === perspective ? 99_000 : -99_000;
  }

  // EMP Lockout-in-one: same urgency as Surgical Strike (HeuristicAi +50k).
  if (empLockoutFilterEnabled() && sideToMoveCanEmpLockout(engine)) {
    return state.currentPlayer === perspective ? 98_500 : -98_500;
  }

  // Deep Lattice neural leaf (ADR 007). Opt-in via setNeuralValueEvaluator.
  // Overlay charged soft-EMP blast geometry — nets never saw Lockout threat.
  const neural = tryNeuralValue(engine, perspective);
  if (neural != null) {
    return neural + softEmpChargeThreat(engine, perspective);
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

  // Soft en-prise pressure: pieces the opponent can take right now
  // (includes Command Hub — skipping it hid Surgical Strike races from the
  // leaf and let Deepish lose hub-captures to greedy heuristic White).
  score -= hangingPressure(engine, perspective) * 0.7;
  score += hangingPressure(engine, enemy) * 0.7;

  // Soft hub defense: enemy fleet closing on our Hub (before en-prise).
  score -= enemyPressureOnHub(engine, perspective, myHub) * 1.2;
  score += enemyPressureOnHub(engine, enemy, enemyHub) * 1.2;

  if (engine.isHybrid()) {
    const mySector = engine.sectorControlRatio(perspective);
    const enemySector = engine.sectorControlRatio(enemy);
    score += (mySector - enemySector) * 400;
    score +=
      (engine.getSensorNetSet(perspective).size -
        engine.getSensorNetSet(enemy).size) *
      0.15;

    // Sector Integration urgency once either side is close to the threshold.
    const gate = engine.getRules().sectorIntegrationRatio;
    if (mySector >= gate * 0.75 || enemySector >= gate * 0.75) {
      score += (mySector - enemySector) * 280;
    }

    let detectedMine = 0;
    let detectedTheirs = 0;
    for (const piece of Object.values(state.pieces)) {
      if (!engine.isPieceDetected(piece)) continue;
      if (piece.owner === perspective) {
        detectedMine += 1;
        continue;
      }
      // Do not reward Target-Locking enemy Infiltrators — that is how Trojans
      // activate. Other piece types still score as "caught in our net."
      if (piece.type === PieceType.Infiltrator) continue;
      detectedTheirs += 1;
    }
    score += (detectedTheirs - detectedMine) * 8;

    // Infiltrator Trojan: Target-Locked enemy Infiltrators that can ortho-take
    // our ships (especially the tip that just painted them) are parasites.
    score -= trojanParasitePenalty(engine, perspective);
    score += trojanParasitePenalty(engine, enemy) * 0.85;
  }

  score += terminalEmpEval(engine, perspective, myHub, enemyHub);

  return score;
}

/**
 * Extra leaf cost when `owner` has activated enemy Infiltrators that can
 * capture owner pieces right now (fringe expand onto a parked I).
 */
function trojanParasitePenalty(
  engine: SubspaceLatticeEngine,
  owner: PlayerColor,
): number {
  const state = engine.getState();
  let penalty = 0;
  for (const enemy of Object.values(state.pieces)) {
    if (enemy.owner === owner) continue;
    if (enemy.type !== PieceType.Infiltrator) continue;
    if (!engine.isPieceDetected(enemy)) continue;
    for (const mine of Object.values(state.pieces)) {
      if (mine.owner !== owner) continue;
      if (!engine.canMovePiece(enemy, mine.position)) continue;
      // Heavier than raw hangingPressure so expand-onto-I loses to quiet expands.
      const base = PIECE_VALUE[mine.type];
      penalty += mine.type === PieceType.CommandHub ? base * 2 : base * 2.2;
      break;
    }
  }
  return penalty;
}

/** Sum of material values currently capturable by the opponent of `owner`. */
function hangingPressure(
  engine: SubspaceLatticeEngine,
  owner: PlayerColor,
): number {
  const state = engine.getState();
  let total = 0;
  for (const piece of Object.values(state.pieces)) {
    if (piece.owner !== owner) continue;
    for (const enemy of Object.values(state.pieces)) {
      if (enemy.owner === owner) continue;
      if (engine.canMovePiece(enemy, piece.position)) {
        total += PIECE_VALUE[piece.type];
        break;
      }
    }
  }
  return total;
}

/**
 * How hard the opponent is pressing `owner`'s Hub geometrically.
 * Closer / jumpier pieces weigh more; already-hanging Hub is mostly covered
 * by hangingPressure — this catches the approach race one ply earlier.
 */
function enemyPressureOnHub(
  engine: SubspaceLatticeEngine,
  owner: PlayerColor,
  hub: Coordinate,
): number {
  let pressure = 0;
  for (const enemy of Object.values(engine.getState().pieces)) {
    if (enemy.owner === owner) continue;
    if (enemy.type === PieceType.CommandHub) continue;
    const d =
      Math.abs(enemy.position.x - hub.x) + Math.abs(enemy.position.y - hub.y);
    if (d > 8) continue;
    const weight =
      enemy.type === PieceType.Infiltrator
        ? 4.5
        : enemy.type === PieceType.Beam
          ? 3.5
          : enemy.type === PieceType.Escort
            ? 2.5
            : 2;
    pressure += (9 - d) * weight;
  }
  return pressure;
}
