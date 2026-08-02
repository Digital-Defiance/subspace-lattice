import { SubspaceLatticeEngine } from '../game-engine';
import { Coordinate } from '../interfaces/coordinate';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { AgentMove, applyAgentMove, isEmpAgentMove } from './agent';
import {
  AiStrengthId,
  createAiForStrength,
  MctsAi,
} from './mcts-ai';
import { HeuristicAi } from './heuristic-ai';
import { evaluatePosition } from './evaluate';
import { moveLeavesHubHanging } from './tactical';
import { yieldToMain } from './cooperative-yield';

export interface AdvisorSuggestion {
  pieceId: string;
  from: Coordinate;
  to: Coordinate;
  /** Human-readable coaching lines (local only — never chat). Max 4. */
  reasons: string[];
  strength: AiStrengthId;
  /** One-line summary for banners / logs. */
  summary: string;
}

/** Heuristic/eval rank + coaching for a move that was actually played. */
export interface PlayedMoveGrade {
  /** explainAdvisorMove lines for the played move. */
  reasons: string[];
  /** Short label of the played action. */
  summary: string;
  /** 1 = best among eval shortlist. */
  rank: number;
  candidateCount: number;
  score: number;
  bestScore: number;
  /**
   * 0–100 vs best 1-ply eval candidate in the shortlist.
   * 100 = matched top score; lower = more eval left on the table.
   */
  optimalityPct: number;
  /** True when played move matches `suggestAdvisorMove` at the grading strength. */
  agreesWithTop: boolean;
  /** When search disagrees, the advisor tip (MCTS at normal+). */
  alternative?: {
    summary: string;
    reasons: string[];
    score: number;
  };
}

const PIECE_LABEL: Record<PieceType, string> = {
  [PieceType.CommandHub]: 'Command Hub',
  [PieceType.Escort]: 'Escort',
  [PieceType.Infiltrator]: 'Infiltrator',
  [PieceType.Beam]: 'Beam',
  [PieceType.Refractor]: 'Refractor',
  [PieceType.Carrier]: 'Carrier',
};

const MAX_REASONS = 4;

function chebyshev(a: Coordinate, b: Coordinate): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function explainEmpFire(
  engine: SubspaceLatticeEngine,
  color: PlayerColor,
): string[] {
  const lines: string[] = [
    'Fire Command Overload (EMP) — spend the whole turn to seize enemy engines inside the blast radius.',
  ];
  const charge = engine.getEmpCharge(color);
  const target = engine.getEmpChargeTarget(color);
  lines.push(`Charge is armed (${charge}/${target}).`);

  if (engine.isTerminalOverclock(color)) {
    const myHub = Object.values(engine.getState().pieces).find(
      (p) => p.owner === color && p.type === PieceType.CommandHub,
    );
    const enemyHub = Object.values(engine.getState().pieces).find(
      (p) => p.owner !== color && p.type === PieceType.CommandHub,
    );
    if (myHub && enemyHub) {
      const radius = engine.getEmpRadius(color);
      const dist = chebyshev(myHub.position, enemyHub.position);
      if (dist <= radius) {
        lines.push(
          'Enemy Hub is inside your Terminal blast — Lockout if their drives fuse.',
        );
      } else {
        lines.push(
          `Enemy Hub is outside blast range (Chebyshev ${dist} > radius ${radius}) — miss fuses you first.`,
        );
      }
    }
  }

  return lines;
}

/**
 * Tactical advisor: same decision path as local AI strengths, plus plain-language
 * reasons. Suggestions stay on-device (Warp-style: never auto-play / never chat).
 */
export function suggestAdvisorMove(
  engine: SubspaceLatticeEngine,
  strength: AiStrengthId = 'normal',
  rng: () => number = Math.random,
): AdvisorSuggestion | null {
  const state = engine.getState();
  if (state.winner) return null;

  const color = state.currentPlayer;
  const ai = createAiForStrength(strength, rng);
  const choice = ai.chooseMove(engine);
  return suggestionFromChoice(engine, color, strength, choice);
}

/**
 * Same as `suggestAdvisorMove`, but uses yielding MCTS so the UI stays
 * responsive during annotate / Deep Lattice tips.
 */
export async function suggestAdvisorMoveAsync(
  engine: SubspaceLatticeEngine,
  strength: AiStrengthId = 'normal',
  rng: () => number = Math.random,
  options: {
    onSearchProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<AdvisorSuggestion | null> {
  const state = engine.getState();
  if (state.winner) return null;

  const color = state.currentPlayer;
  const ai = createAiForStrength(strength, rng);
  const choice =
    ai instanceof MctsAi
      ? await ai.chooseMoveAsync(engine, {
          onProgress: options.onSearchProgress,
          signal: options.signal,
        })
      : ai.chooseMove(engine);
  return suggestionFromChoice(engine, color, strength, choice);
}

function suggestionFromChoice(
  engine: SubspaceLatticeEngine,
  color: PlayerColor,
  strength: AiStrengthId,
  choice: AgentMove | null,
): AdvisorSuggestion | null {
  if (!choice) return null;

  if (isEmpAgentMove(choice)) {
    const hub = Object.values(engine.getState().pieces).find(
      (p) => p.owner === color && p.type === PieceType.CommandHub,
    );
    if (!hub) return null;
    const from = { ...hub.position };
    return {
      pieceId: hub.id,
      from,
      to: from,
      reasons: mergeCoachReasons(explainEmpFire(engine, color)),
      strength,
      summary: 'Command Overload (EMP)',
    };
  }

  const piece = engine.getPiece(choice.pieceId);
  if (!piece) return null;

  const from = { ...piece.position };
  const to = { ...choice.to };
  const reasons = mergeCoachReasons([
    ...explainAdvisorMove(engine, choice, color),
    'Selected by the tactical search budget.',
  ]);
  return {
    pieceId: choice.pieceId,
    from,
    to,
    reasons,
    strength,
    summary: formatAdvisorSuggestion(from, to, piece.type),
  };
}

export function formatAdvisorSuggestion(
  from: Coordinate,
  to: Coordinate,
  pieceType: PieceType,
): string {
  return `${PIECE_LABEL[pieceType]} (${from.x},${from.y}) → (${to.x},${to.y})`;
}

/** Whether a local-AI result should update TEI (Warp: assisted matches do not). */
export function shouldRecordLocalAiTei(assisted: boolean): boolean {
  return !assisted;
}

/**
 * Plain-language coaching lines for a chosen move (exported for unit tests).
 * Caps at {@link MAX_REASONS} like Warp's mergeCoachReasons.
 */
export function explainAdvisorMove(
  engine: SubspaceLatticeEngine,
  move: AgentMove,
  color: PlayerColor = engine.getState().currentPlayer,
): string[] {
  if (isEmpAgentMove(move)) {
    return mergeCoachReasons(explainEmpFire(engine, color));
  }

  const piece = engine.getPiece(move.pieceId);
  if (!piece) return ['No legal coaching line available.'];

  const reasons: string[] = [];
  const label = PIECE_LABEL[piece.type];
  const target = engine.getPieceAt(move.to);
  const spoolAnnounce =
    engine.usesInfiltratorSpool() &&
    piece.type === PieceType.Infiltrator &&
    !piece.spoolTarget &&
    !engine.isPieceDetected(piece);

  reasons.push(
    `Move ${label} from (${piece.position.x},${piece.position.y}) → (${move.to.x},${move.to.y}).`,
  );

  if (spoolAnnounce) {
    reasons.push(
      'Announce infiltrator spool — warp destination without revealing yet.',
    );
  } else if (target) {
    reasons.push(
      target.type === PieceType.CommandHub
        ? 'Capture the enemy Command Hub — win condition.'
        : `Capture enemy ${PIECE_LABEL[target.type]}.`,
    );
  }

  const myHub = Object.values(engine.getState().pieces).find(
    (p) => p.owner === color && p.type === PieceType.CommandHub,
  );
  if (myHub && !moveLeavesHubHanging(engine, move)) {
    const wasThreatened = Object.values(engine.getState().pieces).some(
      (p) =>
        p.owner !== color && engine.canMovePiece(p, myHub.position),
    );
    if (wasThreatened) {
      reasons.push('Keeps your Command Hub safe from Surgical Strike.');
    }
  }

  const enemyHub = Object.values(engine.getState().pieces).find(
    (p) => p.owner !== color && p.type === PieceType.CommandHub,
  );

  // Terminal Overclock coaching — charge, blast geometry, Lockout fuse.
  if (
    engine.isTerminalOverclock(color) &&
    piece.type === PieceType.CommandHub &&
    enemyHub
  ) {
    const radius = engine.getEmpRadius(color);
    const before = chebyshev(piece.position, enemyHub.position);
    const after = chebyshev(move.to, enemyHub.position);
    const charge = engine.getEmpCharge(color);
    const chargeTarget = engine.getEmpChargeTarget(color);
    reasons.push(
      `Terminal charge progress ${Math.min(charge + 1, chargeTarget)}/${chargeTarget} after this Hub step.`,
    );
    if (before > radius && after <= radius) {
      reasons.push('Steps into EMP blast range of the enemy Hub.');
    } else if (before <= radius && after > radius) {
      reasons.push('Steps outside current EMP blast range.');
    } else if (after < before) {
      reasons.push('Closes Chebyshev distance for the growing Terminal blast.');
    }
  } else if (enemyHub && !target) {
    const before =
      Math.abs(piece.position.x - enemyHub.position.x) +
      Math.abs(piece.position.y - enemyHub.position.y);
    const after =
      Math.abs(move.to.x - enemyHub.position.x) +
      Math.abs(move.to.y - enemyHub.position.y);
    if (after < before) {
      reasons.push('Closes distance on the enemy Command Hub.');
    } else if (after > before) {
      reasons.push('Repositions relative to the enemy Command Hub.');
    }
  }

  if (engine.isHybrid()) {
    const after = engine.clone();
    if (after.movePiece(move.pieceId, move.to)) {
      const netBefore = engine.getSensorNetSet(color).size;
      const netAfter = after.getSensorNetSet(color).size;
      if (netAfter > netBefore) {
        reasons.push('Expands your Sensor Net coverage.');
      } else if (netAfter < netBefore) {
        reasons.push('Trades some Sensor Net for tempo or safety.');
      }

      const need = after.getRules().sectorHoldPlies ?? 0;
      if (need > 0) {
        const progress =
          after.getState().sectorHoldProgress?.[color] ?? 0;
        const remaining = Math.max(0, need - progress);
        if (
          after.hasSectorIntegration(color) &&
          remaining > 0 &&
          remaining <= 4
        ) {
          reasons.push(
            `Sector Integration arms in ${remaining} hold ${remaining === 1 ? 'ply' : 'plies'}.`,
          );
        }
      }
    }
  }

  return mergeCoachReasons(reasons);
}

export type FleetPhase =
  | 'opening-screen'
  | 'midgame-contest'
  | 'sector-race'
  | 'strike-hunt'
  | 'emp-pressure'
  | 'terminal';

/**
 * Coarse fleet phase for coaching — used by annotate and advisor tips.
 * Not a rules concept; just a teaching lens.
 */
export function inferFleetPhase(
  engine: SubspaceLatticeEngine,
  color: PlayerColor,
): FleetPhase {
  const state = engine.getState();
  if (engine.isTerminalOverclock(color) || state.terminalPhaseArmed) {
    return 'terminal';
  }
  if (
    engine.empEnabled() &&
    engine.getEmpCharge(color) >= engine.getEmpChargeTarget(color) - 2
  ) {
    return 'emp-pressure';
  }
  const ply = state.plyCount ?? 0;
  const mySector = engine.isHybrid() ? engine.sectorControlRatio(color) : 0;
  const gate = engine.getRules().sectorIntegrationRatio ?? 0.51;
  if (mySector >= gate * 0.8) return 'sector-race';

  const enemy = color === PlayerColor.White ? PlayerColor.Black : PlayerColor.White;
  const enemyPieces = Object.values(state.pieces).filter((p) => p.owner === enemy);
  const enemyNonHub = enemyPieces.filter((p) => p.type !== PieceType.CommandHub);
  if (enemyNonHub.length <= 3 && ply >= 40) return 'strike-hunt';
  if (ply < 36) return 'opening-screen';
  if (mySector >= gate * 0.55) return 'sector-race';
  return 'midgame-contest';
}

/**
 * Longer-horizon coaching: what plan this ply serves (screen, sector, strike…).
 * Complements the tactical lines from {@link explainAdvisorMove}.
 */
export function explainStrategicIntent(
  engine: SubspaceLatticeEngine,
  move: AgentMove,
  color: PlayerColor = engine.getState().currentPlayer,
): string[] {
  const phase = inferFleetPhase(engine, color);
  const lines: string[] = [];

  if (isEmpAgentMove(move)) {
    if (phase === 'terminal') {
      lines.push('Terminal plan: fire for Lockout (or force a fused miss race).');
    } else {
      lines.push(
        'Plan: Command Overload to freeze the enemy screen and steal a tempo.',
      );
    }
    return lines;
  }

  const piece = engine.getPiece(move.pieceId);
  if (!piece) return lines;
  const target = engine.getPieceAt(move.to);
  const after = engine.clone();
  if (!after.movePiece(move.pieceId, move.to)) {
    return lines;
  }

  const netBefore = engine.isHybrid() ? engine.getSensorNetSet(color).size : 0;
  const netAfter = after.isHybrid() ? after.getSensorNetSet(color).size : 0;
  const sectorBefore = engine.isHybrid()
    ? engine.sectorControlRatio(color)
    : 0;
  const sectorAfter = after.isHybrid() ? after.sectorControlRatio(color) : 0;

  if (phase === 'opening-screen') {
    if (piece.type === PieceType.Escort && netAfter > netBefore) {
      lines.push(
        'Plan: build the Escort screen — grow Sensor Net toward midboard.',
      );
    } else if (piece.type === PieceType.Escort) {
      lines.push('Plan: advance the screen fringe / Initiative Relay.');
    } else if (
      piece.type === PieceType.Carrier ||
      piece.type === PieceType.Beam ||
      piece.type === PieceType.Refractor
    ) {
      lines.push(
        'Plan: develop a heavy behind the screen so later raids have lanes.',
      );
    } else if (piece.type === PieceType.Infiltrator) {
      lines.push(
        target
          ? 'Plan: early harassment — pick at the forming screen.'
          : 'Plan: probe with the Infiltrator (risky before the screen is set).',
      );
    } else if (piece.type === PieceType.CommandHub) {
      lines.push(
        'Plan: step the Hub up as a deeper net anchor (resets EMP charge).',
      );
    }
  } else if (phase === 'midgame-contest') {
    if (target && target.type !== PieceType.CommandHub) {
      lines.push(
        `Plan: liquidate the defensive screen (take ${PIECE_LABEL[target.type]}).`,
      );
    } else if (netAfter > netBefore) {
      lines.push('Plan: claim contested space — widen coverage before the clock matters.');
    } else if (
      piece.type === PieceType.Carrier ||
      piece.type === PieceType.Beam
    ) {
      lines.push('Plan: heavy pressure through / around the screen.');
    } else {
      lines.push('Plan: midgame contest — improve structure or force trades.');
    }
  } else if (phase === 'sector-race') {
    if (sectorAfter > sectorBefore) {
      lines.push(
        `Plan: Sector Integration race — coverage ${Math.round(sectorAfter * 100)}% (need ${Math.round((engine.getRules().sectorIntegrationRatio ?? 0.51) * 100)}%).`,
      );
    } else {
      lines.push('Plan: hold or contest the sector clock while preventing their Integration.');
    }
  } else if (phase === 'strike-hunt') {
    if (target?.type === PieceType.CommandHub) {
      lines.push('Plan: Surgical Strike — take the Command Hub.');
    } else if (target) {
      lines.push('Plan: clear the last defenders before the Hub hunt.');
    } else {
      lines.push('Plan: Hub hunt — restrict flight squares / cut the kite.');
    }
  } else if (phase === 'emp-pressure') {
    lines.push(
      piece.type === PieceType.CommandHub
        ? 'Plan: Hub is almost EMP-armed — moving it dumps charge; prefer non-Hub plies or fire.'
        : 'Plan: keep charging EMP (non-Hub ply) or set up a blast that actually seizes ships.',
    );
  } else if (phase === 'terminal') {
    lines.push(
      'Plan: Terminal Overclock — charge, close Chebyshev range, then Lockout.',
    );
  }

  return lines;
}

function movesEqual(a: AgentMove, b: AgentMove): boolean {
  if (isEmpAgentMove(a) || isEmpAgentMove(b)) {
    return isEmpAgentMove(a) && isEmpAgentMove(b);
  }
  return a.pieceId === b.pieceId && a.to.x === b.to.x && a.to.y === b.to.y;
}

function summarizeAgentMove(
  engine: SubspaceLatticeEngine,
  move: AgentMove,
): string {
  if (isEmpAgentMove(move)) return 'Command Overload (EMP)';
  const piece = engine.getPiece(move.pieceId);
  if (!piece) return 'Unknown move';
  return formatAdvisorSuggestion(piece.position, move.to, piece.type);
}

/**
 * Grade a played move: coaching "why", 1-ply eval rank among a shortlist, and
 * a real advisor tip (`suggestAdvisorMove`) when search disagrees.
 */
export function gradePlayedMove(
  engine: SubspaceLatticeEngine,
  move: AgentMove,
  options: {
    /** Advisor search budget for the preferred tip (default `normal`). */
    strength?: AiStrengthId;
    rng?: () => number;
  } = {},
): PlayedMoveGrade {
  const strength = options.strength ?? 'normal';
  const rng = options.rng ?? (() => 0.5);
  const base = gradePlayedMoveBase(engine, move);
  const tip = suggestAdvisorMove(engine, strength, rng);
  return finalizePlayedMoveGrade(engine, move, base, tip);
}

/**
 * Same as `gradePlayedMove`, but yields during MCTS tip search so browser
 * annotate stays responsive.
 */
export async function gradePlayedMoveAsync(
  engine: SubspaceLatticeEngine,
  move: AgentMove,
  options: {
    strength?: AiStrengthId;
    rng?: () => number;
    onSearchProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<PlayedMoveGrade> {
  const strength = options.strength ?? 'normal';
  const rng = options.rng ?? (() => 0.5);
  const base = gradePlayedMoveBase(engine, move);
  await yieldToMain();
  const tip = await suggestAdvisorMoveAsync(engine, strength, rng, {
    onSearchProgress: options.onSearchProgress,
    signal: options.signal,
  });
  return finalizePlayedMoveGrade(engine, move, base, tip);
}

type PlayedMoveGradeBase = Omit<
  PlayedMoveGrade,
  'agreesWithTop' | 'alternative'
> & {
  evalRows: { move: AgentMove; score: number }[];
};

function gradePlayedMoveBase(
  engine: SubspaceLatticeEngine,
  move: AgentMove,
): PlayedMoveGradeBase {
  const scout = new HeuristicAi(() => 0);
  const scored = scout.scoreMoves(engine);
  scored.sort((a, b) => b.score - a.score);

  const reasons = explainAdvisorMove(engine, move);
  const summary = summarizeAgentMove(engine, move);

  if (scored.length === 0 && !engine.canFireEmp()) {
    return {
      reasons,
      summary,
      rank: 1,
      candidateCount: 0,
      score: 0,
      bestScore: 0,
      optimalityPct: 100,
      evalRows: [],
    };
  }

  const shortlist: AgentMove[] = [];
  const pushUnique = (m: AgentMove) => {
    if (!shortlist.some((x) => movesEqual(x, m))) shortlist.push(m);
  };
  pushUnique(move);
  for (const row of scored.slice(0, 32)) pushUnique(row.move);
  if (engine.canFireEmp()) pushUnique({ type: 'emp' });

  const me = engine.getState().currentPlayer;
  const evalRows = shortlist.map((m) => {
    const child = engine.clone();
    if (!applyAgentMove(child, m)) {
      return { move: m, score: Number.NEGATIVE_INFINITY };
    }
    if (child.getState().winner === me) {
      return { move: m, score: 1_000_000 };
    }
    return { move: m, score: evaluatePosition(child, me) };
  });
  evalRows.sort((a, b) => b.score - a.score);

  const bestScore = evalRows[0]?.score ?? 0;
  let matchIndex = evalRows.findIndex((s) => movesEqual(s.move, move));
  const score =
    matchIndex >= 0 ? evalRows[matchIndex]!.score : bestScore - 1000;
  if (matchIndex < 0) matchIndex = Math.max(0, evalRows.length - 1);
  const rank = matchIndex + 1;
  const worst = evalRows[evalRows.length - 1]?.score ?? score;
  const span = Math.max(1e-9, bestScore - worst);
  const optimalityPct = Math.max(
    0,
    Math.min(100, Math.round((100 * (score - worst)) / span)),
  );

  return {
    reasons,
    summary,
    rank,
    candidateCount: evalRows.length,
    score,
    bestScore,
    optimalityPct,
    evalRows,
  };
}

function finalizePlayedMoveGrade(
  engine: SubspaceLatticeEngine,
  move: AgentMove,
  base: PlayedMoveGradeBase,
  tip: AdvisorSuggestion | null,
): PlayedMoveGrade {
  const { evalRows, ...rest } = base;
  let agreesWithTop = false;
  let alternative: PlayedMoveGrade['alternative'];

  if (tip) {
    const tipIsEmp = tip.summary.startsWith('Command Overload');
    const tipAgent: AgentMove = tipIsEmp
      ? { type: 'emp' }
      : { pieceId: tip.pieceId, to: { ...tip.to } };
    agreesWithTop = movesEqual(move, tipAgent);
    if (!agreesWithTop) {
      alternative = {
        summary: tip.summary,
        reasons: tip.reasons,
        score: rest.bestScore,
      };
    }
  } else {
    agreesWithTop = rest.rank === 1;
    if (!agreesWithTop && evalRows[0]) {
      const top = evalRows[0];
      alternative = {
        summary: summarizeAgentMove(engine, top.move),
        reasons: explainAdvisorMove(engine, top.move),
        score: top.score,
      };
    }
  }

  return {
    ...rest,
    agreesWithTop,
    alternative,
  };
}

function mergeCoachReasons(lines: readonly string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);
    merged.push(line);
    if (merged.length >= MAX_REASONS) break;
  }
  return merged;
}
