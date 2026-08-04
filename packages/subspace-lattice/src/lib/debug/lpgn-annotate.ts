/**
 * Annotate an LPGN replay: facts per ply + missed forced wins (shortcuts).
 */
import { SubspaceLatticeEngine } from '../game-engine';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import type { GameState } from '../interfaces/gameState';
import {
  applyAgentMove,
  isEmpAgentMove,
  type AgentMove,
} from '../ai/agent';
import { findImmediateWinningMove } from '../ai/tactical';
import {
  explainAdvisorMove,
  explainStrategicIntent,
  gradePlayedMoveAsync,
  inferFleetPhase,
  type PlayedMoveGrade,
} from '../ai/advisor';
import type { AiStrengthId } from '../ai/mcts-ai';
import { yieldToMain } from '../ai/cooperative-yield';
import {
  coordToLpgnSquare,
  describeWinnerReason,
  pieceLetter,
} from './lpgn';
import type { LpgnReplayPly, LpgnReplayResult } from './lpgn-replay';

const PIECE_LABEL: Record<PieceType, string> = {
  [PieceType.CommandHub]: 'Command Hub',
  [PieceType.Escort]: 'Escort',
  [PieceType.Infiltrator]: 'Infiltrator',
  [PieceType.Beam]: 'Beam',
  [PieceType.Refractor]: 'Refractor',
  [PieceType.Carrier]: 'Carrier',
};

export interface LpgnShortcut {
  /** 0-based ply index where the win was available (before that ply). */
  atPly: number;
  side: PlayerColor;
  depth: 1 | 2;
  move: AgentMove;
  moveLabel: string;
  playedToken: string;
  note: string;
}

/** Soft coaching fork — not a forced mate, but a clearer plan. */
export interface LpgnBranchPoint {
  atPly: number;
  kind:
    | 'emp-ready-empty'
    | 'emp-ready-hit'
    | 'hub-walk-reset-emp'
    | 'liquidation'
    | 'net-peak'
    | 'hub-adjacent'
    | 'phase';
  title: string;
  note: string;
  betterIdea?: string;
}

export interface LpgnPlyAnnotation {
  ply: number;
  moveNo: number;
  side: 'White' | 'Black';
  token: string;
  heading: string;
  facts: string[];
  body: string;
  /** Highlight cells for diagrams (from/to when available). */
  focus: { x: number; y: number }[];
  /** Tactical + strategic "why" for this ply (both seats). */
  why: string[];
  /** Fleet-phase label for coaching context. */
  phase?: string;
  shortcut?: LpgnShortcut;
  branch?: LpgnBranchPoint;
  /** Optimality grade — perspective seat only. */
  grade?: PlayedMoveGrade;
  isKeyDiagram: boolean;
}

export interface LpgnAnnotationReport {
  replay: LpgnReplayResult;
  annotations: LpgnPlyAnnotation[];
  shortcuts: LpgnShortcut[];
  branches: LpgnBranchPoint[];
  summary: string[];
}

function seatName(c: PlayerColor): 'White' | 'Black' {
  return c === PlayerColor.White ? 'White' : 'Black';
}

function formatAgentMove(
  engine: SubspaceLatticeEngine,
  move: AgentMove,
): string {
  if (isEmpAgentMove(move)) {
    const hub = Object.values(engine.getState().pieces).find(
      (p) =>
        p.owner === engine.getState().currentPlayer &&
        p.type === PieceType.CommandHub,
    );
    const sq = hub ? coordToLpgnSquare(hub.position) : '??';
    return `EMP@${sq}`;
  }
  const piece = engine.getPiece(move.pieceId);
  const letter = piece ? pieceLetter(piece.type) : 'X';
  const from = piece ? coordToLpgnSquare(piece.position) : '??';
  const to = coordToLpgnSquare(move.to);
  const cap = engine.getPieceAt(move.to) ? 'x' : '';
  return `${letter}${from}${cap}${to}`;
}

function listCandidateMoves(engine: SubspaceLatticeEngine): AgentMove[] {
  const moves: AgentMove[] = engine.listLegalMoves().map((m) => ({
    pieceId: m.pieceId,
    to: m.to,
  }));
  if (engine.canFireEmp()) moves.push({ type: 'emp' });
  return moves;
}

/**
 * Mate-in-2: a move such that every legal reply leaves us with an immediate win.
 * Yields periodically so browser annotate stays responsive.
 */
export async function findForcedWinInTwo(
  engine: SubspaceLatticeEngine,
  options: {
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<AgentMove | null> {
  const immediate = findImmediateWinningMove(engine);
  if (immediate) return immediate;

  const me = engine.getState().currentPlayer;
  const enemy =
    me === PlayerColor.White ? PlayerColor.Black : PlayerColor.White;

  const candidates = listCandidateMoves(engine);
  const total = Math.max(1, candidates.length);
  let checked = 0;
  for (const move of candidates) {
    if (options.signal?.aborted) {
      const err = new Error('Annotation aborted');
      err.name = 'AbortError';
      throw err;
    }
    checked += 1;
    if (checked === 1 || checked === total || checked % 8 === 0) {
      options.onProgress?.(checked, total);
    }
    if (checked % 12 === 0) await yieldToMain();

    const child = engine.clone();
    if (!applyAgentMove(child, move)) continue;
    if (child.getState().winner === me) return move;
    if (child.getState().winner) continue;

    const replies = listCandidateMoves(child);
    if (replies.length === 0) continue;

    let forces = true;
    for (const reply of replies) {
      const g2 = child.clone();
      if (!applyAgentMove(g2, reply)) {
        forces = false;
        break;
      }
      if (g2.getState().winner === enemy) {
        forces = false;
        break;
      }
      if (g2.getState().winner === me) continue;
      if (!findImmediateWinningMove(g2)) {
        forces = false;
        break;
      }
    }
    if (forces) return move;
  }
  return null;
}

function playedMatches(
  engine: SubspaceLatticeEngine,
  played: LpgnReplayPly,
  win: AgentMove,
): boolean {
  if (isEmpAgentMove(win)) {
    return (
      played.parsed.kind === 'emp' || played.parsed.kind === 'terminal-emp'
    );
  }
  if (played.parsed.kind !== 'move' && played.parsed.kind !== 'spool-announce') {
    return false;
  }
  const piece = engine.getPiece(win.pieceId);
  if (!piece) return false;
  if (played.parsed.kind === 'move') {
    return (
      piece.position.x === played.parsed.from.x &&
      piece.position.y === played.parsed.from.y &&
      win.to.x === played.parsed.to.x &&
      win.to.y === played.parsed.to.y
    );
  }
  return (
    win.to.x === (played.parsed.to?.x ?? -1) &&
    win.to.y === (played.parsed.to?.y ?? -1)
  );
}

function netPct(state: GameState, color: PlayerColor, engine: SubspaceLatticeEngine): number {
  const live = SubspaceLatticeEngine.fromState(state, engine.getRules());
  const cells = live.countControllableCells();
  if (cells <= 0) return 0;
  return Math.round((1000 * live.getSensorNetSet(color).size) / cells) / 10;
}

function factsForPly(
  engineBefore: SubspaceLatticeEngine,
  ply: LpgnReplayPly,
): string[] {
  const facts: string[] = [];
  if (ply.captureType) {
    facts.push(`captures ${PIECE_LABEL[ply.captureType]}`);
  }
  if (ply.after.winner) {
    facts.push(
      `**${seatName(ply.after.winner)} wins** — ${describeWinnerReason(ply.after.winnerReason)}`,
    );
  }
  const w = netPct(ply.after, PlayerColor.White, engineBefore);
  const b = netPct(ply.after, PlayerColor.Black, engineBefore);
  facts.push(`net W ${w}% / B ${b}%`);
  const chargeW = SubspaceLatticeEngine.fromState(
    ply.after,
    engineBefore.getRules(),
  ).getEmpCharge(PlayerColor.White);
  const chargeB = SubspaceLatticeEngine.fromState(
    ply.after,
    engineBefore.getRules(),
  ).getEmpCharge(PlayerColor.Black);
  if (chargeW > 0 || chargeB > 0) {
    facts.push(`EMP charge W ${chargeW} / B ${chargeB}`);
  }
  return facts;
}

function focusFor(ply: LpgnReplayPly): { x: number; y: number }[] {
  const p = ply.parsed;
  if (p.kind === 'move') return [p.from, p.to];
  if (p.kind === 'emp' || p.kind === 'terminal-emp') return [p.origin];
  if (p.kind === 'spool-announce' && p.to) return [p.from, p.to];
  if (p.kind === 'spool-failed') return [p.from];
  return [];
}

function headingFor(ply: LpgnReplayPly): string {
  const n = Math.floor(ply.index / 2) + 1;
  const side = seatName(ply.player);
  if (ply.parsed.kind === 'emp') return `Ply ${ply.index + 1} — ${side} EMP`;
  if (ply.parsed.kind === 'terminal-emp') {
    return `Ply ${ply.index + 1} — ${side} Terminal Overclock`;
  }
  if (ply.parsed.kind === 'spool-announce') {
    return `Ply ${ply.index + 1} — ${side} spool announce`;
  }
  if (ply.parsed.kind === 'spool-failed') {
    return `Ply ${ply.index + 1} — ${side} spool failed`;
  }
  if (ply.parsed.kind !== 'move') {
    return `Ply ${ply.index + 1} — ${side} (${ply.token}) · move ${n}`;
  }
  const label = PIECE_LABEL[ply.parsed.moverType] ?? 'ship';
  const verb = ply.captureType ? 'takes' : 'moves';
  return `Ply ${ply.index + 1} — ${side} ${label} ${verb} (${ply.token}) · move ${n}`;
}

function plyToAgentMove(
  engine: SubspaceLatticeEngine,
  ply: LpgnReplayPly,
): AgentMove | null {
  if (ply.parsed.kind === 'emp' || ply.parsed.kind === 'terminal-emp') {
    return { type: 'emp' };
  }
  if (ply.parsed.kind === 'spool-failed') return null;
  const from =
    ply.parsed.kind === 'move' || ply.parsed.kind === 'spool-announce'
      ? ply.parsed.from
      : null;
  const to =
    ply.parsed.kind === 'move'
      ? ply.parsed.to
      : ply.parsed.kind === 'spool-announce'
        ? ply.parsed.to
        : null;
  if (!from || !to) return null;
  const piece = Object.values(engine.getState().pieces).find(
    (p) =>
      p.owner === ply.player &&
      p.position.x === from.x &&
      p.position.y === from.y,
  );
  if (!piece) return null;
  return { pieceId: piece.id, to: { ...to } };
}

function formatGradeBlurb(grade: PlayedMoveGrade): string {
  const shortlist = `1-ply shortlist #${grade.rank}/${grade.candidateCount} (${grade.optimalityPct}%)`;
  if (grade.agreesWithTop) {
    return `GRADE: Matched advisor tip · ${shortlist}.`;
  }
  const head =
    grade.rank === 1
      ? `GRADE: ${shortlist} (top of shortlist). Deeper search still preferred another plan.`
      : `GRADE: ${shortlist}. Deeper search preferred another plan.`;
  if (!grade.alternative) return head;
  const tipExtra = grade.alternative.reasons
    .filter(
      (r) =>
        !r.startsWith('Move ') &&
        !r.startsWith('Selected by the tactical') &&
        !grade.reasons.includes(r),
    )
    .slice(0, 2);
  const tipTail =
    tipExtra.length > 0 ? ` — ${tipExtra.join(' ')}` : '';
  return `${head} Try instead: ${grade.alternative.summary}${tipTail}`;
}

function formatWhyBlurb(why: string[], phase?: string): string {
  const head = phase ? `PHASE: ${phase}. ` : '';
  return `WHY: ${head}${why.join(' ')}`;
}

function chebyshev(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function countEmpSeizures(
  engine: SubspaceLatticeEngine,
  firer: PlayerColor,
): number {
  const child = engine.clone();
  if (!child.fireEmp()) return 0;
  const enemy =
    firer === PlayerColor.White ? PlayerColor.Black : PlayerColor.White;
  return Object.values(child.getState().pieces).filter(
    (p) => p.owner === enemy && child.isEmpDisabled(p),
  ).length;
}

export interface AnnotateLpgnStepProgress {
  label: string;
  current: number;
  total: number;
  /** 0–100 within this step */
  percent: number;
}

export interface AnnotateLpgnProgress {
  phase: 'replay' | 'annotate';
  current: number;
  total: number;
  /** Overall job 0–100 (mostly annotate plies; replay is a brief prelude). */
  percent: number;
  message: string;
  /** Latest ply just finished (for live UI). */
  annotation?: LpgnPlyAnnotation;
  /** Fine-grained work inside the current ply (MCTS sims, mate scan, …). */
  step?: AnnotateLpgnStepProgress;
}

export type AnnotateLpgnOptions = {
  perspective?: PlayerColor;
  /** 1 = hub/EMP/sector instant wins only; 2 = also mate-in-2 (slower). */
  mateDepth?: 1 | 2;
  /** Advisor strength for grade tips (default `normal` = MCTS@50). */
  advisorStrength?: AiStrengthId;
  onProgress?: (p: AnnotateLpgnProgress) => void;
  signal?: AbortSignal;
  /**
   * Yield to the event loop every N plies so the UI can paint (browser).
   * Default 1. Use 0 for tight CLI batches.
   */
  yieldEvery?: number;
};

function overallAnnotatePercent(
  completedPlies: number,
  plyTotal: number,
  stepPercent = 0,
): number {
  const frac = (completedPlies + stepPercent / 100) / Math.max(1, plyTotal);
  return Math.min(99, Math.round(100 * frac));
}
export async function annotateLpgnReplay(
  replay: LpgnReplayResult,
  options: AnnotateLpgnOptions = {},
): Promise<LpgnAnnotationReport> {
  const perspective = options.perspective ?? PlayerColor.White;
  const mateDepth = options.mateDepth ?? 2;
  const advisorStrength = options.advisorStrength ?? 'normal';
  const yieldEvery = options.yieldEvery ?? 1;
  const shortcuts: LpgnShortcut[] = [];
  const branches: LpgnBranchPoint[] = [];
  const annotations: LpgnPlyAnnotation[] = [];
  const rules = replay.engine.getRules();
  const total = Math.max(1, replay.plies.length);

  let sawEmpReadyEmpty = false;
  let sawEmpReadyHit = false;
  let liquidationNoted = false;
  const recentCapturePlies: number[] = [];
  let peakNet = 0;
  let peakNetPly = -1;
  let firstHubAdjacent = -1;

  for (const ply of replay.plies) {
    let lastStepEmit = 0;
    const reportStep = (
      label: string,
      current: number,
      stepTotal: number,
      force = false,
    ) => {
      const now = Date.now();
      if (!force && now - lastStepEmit < 120 && current < stepTotal) return;
      lastStepEmit = now;
      const stepPercent = Math.round((100 * current) / Math.max(1, stepTotal));
      options.onProgress?.({
        phase: 'annotate',
        current: ply.index,
        total,
        percent: overallAnnotatePercent(ply.index, total, stepPercent),
        message: `Ply ${ply.index + 1}/${total} (${ply.token}) — ${label}`,
        step: {
          label,
          current,
          total: stepTotal,
          percent: stepPercent,
        },
      });
    };

    if (options.signal?.aborted) {
      const err = new Error('Annotation aborted');
      err.name = 'AbortError';
      throw err;
    }

    const beforeEngine = SubspaceLatticeEngine.fromState(ply.before, rules);
    const facts = factsForPly(beforeEngine, ply);
    let branch: LpgnBranchPoint | undefined;

    const netW = netPct(ply.after, perspective, beforeEngine);
    if (netW > peakNet) {
      peakNet = netW;
      peakNetPly = ply.index;
    }

    const enemy =
      perspective === PlayerColor.White
        ? PlayerColor.Black
        : PlayerColor.White;
    const enemyHub = Object.values(ply.before.pieces).find(
      (p) => p.owner === enemy && p.type === PieceType.CommandHub,
    );
    if (enemyHub && ply.player === perspective) {
      const adjacent = Object.values(ply.before.pieces).some(
        (p) =>
          p.owner === perspective &&
          chebyshev(p.position, enemyHub.position) <= 1,
      );
      if (adjacent && firstHubAdjacent < 0) {
        firstHubAdjacent = ply.index;
        branch = {
          atPly: ply.index,
          kind: 'hub-adjacent',
          title: 'Enemy Hub adjacent',
          note: `A friendly ship sits next to the enemy Hub on ${coordToLpgnSquare(enemyHub.position)}, but no legal capture exists yet (net geometry / piece rules).`,
          betterIdea:
            'Bring a Carrier, Beam, or Infiltrator that can actually take the Hub — adjacency alone is not Surgical Strike.',
        };
        branches.push(branch);
      }
    }

    if (ply.player === perspective) {
      if (beforeEngine.canFireEmp()) {
        const seized = countEmpSeizures(beforeEngine, perspective);
        if (seized === 0 && !sawEmpReadyEmpty) {
          sawEmpReadyEmpty = true;
          branch = {
            atPly: ply.index,
            kind: 'emp-ready-empty',
            title: 'EMP armed — empty blast',
            note: `Command Overload is ready (${beforeEngine.getEmpCharge(perspective)}/${beforeEngine.getEmpChargeTarget(perspective)}), but radius ${beforeEngine.getRules().empRadius} from your Hub seizes zero enemy ships.`,
            betterIdea:
              'Do not spend the tempo. Either ignore EMP and play pieces, or walk the Hub closer first so the next charge cycle can actually Lockout.',
          };
          branches.push(branch);
        } else if (seized > 0 && !sawEmpReadyHit) {
          sawEmpReadyHit = true;
          branch = {
            atPly: ply.index,
            kind: 'emp-ready-hit',
            title: 'EMP would seize ships',
            note: `EMP is ready and would seize ${seized} enemy ship(s). Played ${ply.token} instead.`,
            betterIdea: `Consider EMP@${coordToLpgnSquare(
              Object.values(ply.before.pieces).find(
                (p) =>
                  p.owner === perspective &&
                  p.type === PieceType.CommandHub,
              )!.position,
            )} for Lockout pressure.`,
          };
          branches.push(branch);
        }
      }

      if (
        ply.parsed.kind === 'move' &&
        ply.parsed.moverType === PieceType.CommandHub &&
        beforeEngine.getEmpCharge(perspective) >=
          beforeEngine.getEmpChargeTarget(perspective)
      ) {
        branch = {
          atPly: ply.index,
          kind: 'hub-walk-reset-emp',
          title: 'Hub walk resets EMP',
          note: `Moving the Hub (${ply.token}) dumps a full EMP charge.`,
          betterIdea:
            'Only walk the Hub when the blast was useless anyway — or fire before stepping.',
        };
        branches.push(branch);
      }
    }

    if (ply.captureType && ply.player === perspective) {
      recentCapturePlies.push(ply.index);
      const window = recentCapturePlies.filter((i) => ply.index - i <= 12);
      if (window.length >= 3 && !liquidationNoted) {
        liquidationNoted = true;
        branch = {
          atPly: ply.index,
          kind: 'liquidation',
          title: 'Screen liquidated',
          note: 'Capture burst clears the defensive screen — convert to a Hub hunt or Sector push immediately.',
          betterIdea:
            'Avoid long Escort inching; use Carrier/Infiltrator routes to shorten the kite.',
        };
        branches.push(branch);
      }
    }

    let shortcut: LpgnShortcut | undefined;
    if (ply.player === perspective) {
      reportStep(`Preparing ply ${ply.index + 1}`, 0, 1, true);
      const win1 = findImmediateWinningMove(beforeEngine);
      let win: AgentMove | null = win1;
      let depth: 1 | 2 = 1;
      if (!win && mateDepth >= 2) {
        const legalN = beforeEngine.listLegalMoves().length;
        if (legalN <= 48) {
          reportStep('Mate-in-2 scan', 0, Math.max(1, legalN), true);
          win = await findForcedWinInTwo(beforeEngine, {
            signal: options.signal,
            onProgress: (done, stepTotal) =>
              reportStep('Mate-in-2 scan', done, stepTotal),
          });
          depth = 2;
        }
      }
      if (win) {
        if (win1) depth = 1;
        const label = formatAgentMove(beforeEngine, win);
        const tookIt = playedMatches(beforeEngine, ply, win);
        if (!tookIt) {
          shortcut = {
            atPly: ply.index,
            side: ply.player,
            depth,
            move: win,
            moveLabel: label,
            playedToken: ply.token,
            note:
              depth === 1
                ? `Forced win available (${label}) but played ${ply.token}.`
                : `Mate-in-2 available via ${label}; played ${ply.token} instead.`,
          };
          shortcuts.push(shortcut);
        }
      }
    }

    const agentMove = plyToAgentMove(beforeEngine, ply);
    const phase = agentMove
      ? inferFleetPhase(beforeEngine, ply.player)
      : undefined;
    const why =
      agentMove != null
        ? [
            ...explainStrategicIntent(beforeEngine, agentMove, ply.player),
            ...explainAdvisorMove(beforeEngine, agentMove, ply.player).filter(
              (line, i) => i > 0 || !line.startsWith('Move '),
            ),
          ].slice(0, 5)
        : [];

    // Grade optimality only for the annotated seat (not the opponent).
    const grade =
      agentMove && ply.player === perspective
        ? await (async () => {
            reportStep(
              `Advisor ${advisorStrength} tip`,
              0,
              1,
              true,
            );
            await yieldToMain();
            return gradePlayedMoveAsync(beforeEngine, agentMove, {
              strength: advisorStrength,
              rng: () => 0.5,
              signal: options.signal,
              onSearchProgress: (done, stepTotal) =>
                reportStep(
                  `Advisor ${advisorStrength} (${stepTotal} sims)`,
                  done,
                  stepTotal,
                  done === 0 || done >= stepTotal,
                ),
            });
          })()
        : undefined;

    const isKeyDiagram =
      Boolean(ply.captureType) ||
      Boolean(ply.after.winner) ||
      Boolean(shortcut) ||
      Boolean(branch) ||
      (grade != null &&
        (!grade.agreesWithTop || grade.optimalityPct < 70)) ||
      ply.index === 0 ||
      ply.index === replay.plies.length - 1 ||
      ply.index % 10 === 9;

    let body = facts.join(' · ');
    if (shortcut) body += ` — SHORTCUT: ${shortcut.note}`;
    if (branch) body += ` — BRANCH: ${branch.title}. ${branch.note}`;
    if (why.length) body += ` — ${formatWhyBlurb(why, phase)}`;
    if (grade) body += ` — ${formatGradeBlurb(grade)}`;

    annotations.push({
      ply: ply.index + 1,
      moveNo: Math.floor(ply.index / 2) + 1,
      side: seatName(ply.player),
      token: ply.token,
      heading: headingFor(ply),
      facts,
      body,
      focus: focusFor(ply),
      why,
      phase,
      shortcut,
      branch,
      grade,
      isKeyDiagram,
    });

    const current = ply.index + 1;
    const annotation = annotations[annotations.length - 1]!;
    options.onProgress?.({
      phase: 'annotate',
      current,
      total,
      percent: overallAnnotatePercent(current, total, 0),
      message:
        ply.player === perspective && grade
          ? `Graded ply ${current}/${total} (${ply.token})`
          : `Annotated ply ${current}/${total}`,
      annotation,
    });
    if (options.signal?.aborted) {
      const err = new Error('Annotation aborted');
      err.name = 'AbortError';
      throw err;
    }
    if (yieldEvery > 0 && current % yieldEvery === 0) {
      await yieldToMain();
    }
  }

  if (peakNetPly >= 0) {
    branches.push({
      atPly: peakNetPly,
      kind: 'net-peak',
      title: 'Peak Sensor Net',
      note: `Highest coverage for the annotated seat was ~${peakNet}% (need 51% for Sector Integration).`,
      betterIdea:
        peakNet >= 45
          ? 'Sector Integration was almost on the table — one more Escort wave might have been shorter than the Hub hunt.'
          : 'Strike was the correct win path; the clock was never close.',
    });
  }

  const summary: string[] = [];
  const h = replay.parsed.headers;
  const terminationLabel = h.Termination
    ? describeWinnerReason(h.Termination)
    : 'unterminated';
  summary.push(
    `${h.White ?? 'White'} vs ${h.Black ?? 'Black'} — ${h.Result ?? '*'} (${terminationLabel})`,
  );
  if (h.Termination === 'ai-resigned') {
    summary.push(
      'Ended by Grandmaster resignation: search judged every legal reply a forced loss.',
    );
  } else if (h.Termination === 'resign') {
    summary.push('Ended by resignation.');
  }
  summary.push(
    `${replay.plies.length} plies · ${h.Rules ?? '?'} · ${h.HeavyWing ?? '?'}`,
  );

  const perspectiveGrades = annotations.filter(
    (a) =>
      a.grade &&
      ((perspective === PlayerColor.White && a.side === 'White') ||
        (perspective === PlayerColor.Black && a.side === 'Black')),
  );
  if (perspectiveGrades.length > 0) {
    const avg =
      perspectiveGrades.reduce(
        (s, a) => s + (a.grade?.optimalityPct ?? 0),
        0,
      ) / perspectiveGrades.length;
    const topHits = perspectiveGrades.filter((a) => a.grade?.agreesWithTop)
      .length;
    summary.push(
      `${seatName(perspective)} advisor (${advisorStrength}): avg eval-shortlist optimality ${avg.toFixed(0)}% · matched advisor tip ${topHits}/${perspectiveGrades.length} plies.`,
    );
    const misses = perspectiveGrades
      .filter((a) => a.grade && !a.grade.agreesWithTop && a.grade.optimalityPct < 70)
      .slice(0, 8);
    if (misses.length > 0) {
      summary.push('Largest advisor disagreements:');
      for (const m of misses) {
        summary.push(
          `  · ply ${m.ply} ${m.token}: eval #${m.grade!.rank}/${m.grade!.candidateCount} (${m.grade!.optimalityPct}%) — advisor tip ${m.grade!.alternative?.summary ?? '?'}`,
        );
      }
    }
  }

  if (shortcuts.length === 0) {
    summary.push(
      `No missed mate-in-1/2 for ${seatName(perspective)} under tactical scan.`,
    );
  } else {
    summary.push(
      `${shortcuts.length} shortcut(s) where a faster forced win was available:`,
    );
    for (const s of shortcuts.slice(0, 12)) {
      summary.push(
        `  · ply ${s.atPly + 1}: play ${s.moveLabel} (mate-in-${s.depth}) instead of ${s.playedToken}`,
      );
    }
    if (shortcuts.length > 12) {
      summary.push(`  · …and ${shortcuts.length - 12} more`);
    }
  }
  if (branches.length > 0) {
    summary.push(`${branches.length} coaching branch point(s):`);
    for (const b of branches.slice(0, 10)) {
      summary.push(`  · ply ${b.atPly + 1}: ${b.title}`);
    }
  }

  return { replay, annotations, shortcuts, branches, summary };
}
