import { SubspaceLatticeEngine } from '../game-engine';
import { PieceType } from '../interfaces/pieceType';
import { AgentMove, applyAgentMove, isEmpAgentMove } from './agent';
import { evaluatePosition, pieceMaterialValue } from './evaluate';
/**
 * Read Node ablation env vars without throwing in the browser bundle
 * (`process` is undefined under Vite).
 */
function nodeEnv(name: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  return process.env[name];
}

/**
 * Ablation switches for the Jul 23 hub-safety layer (`83109c9`).
 * - `LATTICE_HUB_SAFETY=0` disables both mate-avoid filters and hub-in-one eval
 *   (pre-83109c9 agent behavior; needed for Track A continuity with July 21).
 * - `LATTICE_HUB_MATE_FILTER=0` disables only moveLeavesHubHanging filters.
 * - `LATTICE_HUB_IN_ONE=0` disables only the hub-in-one eval bonus (see evaluate.ts).
 * - `LATTICE_TRADE_FILTER=0` disables bad-trade / hanging-mover filters.
 * - `LATTICE_EMP_LOCKOUT_FILTER=0` disables opponent EMP-Lockout reply filter.
 * Default: all on.
 */
export function hubSafetyEnabled(): boolean {
  return nodeEnv('LATTICE_HUB_SAFETY') !== '0';
}

export function hubMateFilterEnabled(): boolean {
  return hubSafetyEnabled() && nodeEnv('LATTICE_HUB_MATE_FILTER') !== '0';
}

export function hubInOneEvalEnabled(): boolean {
  return hubSafetyEnabled() && nodeEnv('LATTICE_HUB_IN_ONE') !== '0';
}

export function tradeFilterEnabled(): boolean {
  return nodeEnv('LATTICE_TRADE_FILTER') !== '0';
}

export function empLockoutFilterEnabled(): boolean {
  return nodeEnv('LATTICE_EMP_LOCKOUT_FILTER') !== '0';
}

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
  if (engine.canFireEmp()) {
    const child = engine.clone();
    if (child.fireEmp() && child.getState().winner === me) {
      return { type: 'emp' };
    }
  }
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
 * True when playing `move` leaves the opponent able to capture our Command Hub
 * on the reply (Surgical Strike). Winning moves that end the game are safe.
 *
 * Cheap by design (hot path for every agent): instead of enumerating the
 * opponent's full legal-move list, test each enemy piece directly against the
 * hub square.
 */
export function moveLeavesHubHanging(
  engine: SubspaceLatticeEngine,
  move: AgentMove,
): boolean {
  if (!hubMateFilterEnabled()) return false;
  if (isEmpAgentMove(move)) return false;
  const me = engine.getState().currentPlayer;
  const child = engine.clone();
  if (!applyAgentMove(child, move)) return true;
  const state = child.getState();
  if (state.winner) return false;
  const hub = Object.values(state.pieces).find(
    (p) => p.owner === me && p.type === PieceType.CommandHub,
  );
  if (!hub) return false;
  for (const piece of Object.values(state.pieces)) {
    if (piece.owner === me) continue;
    if (child.canMovePiece(piece, hub.position)) return true;
  }
  return false;
}

/**
 * True when the moved piece can be recaptured for a net material loss —
 * classic "suicide" trades and hanging free pieces on empty squares.
 * Hub captures and game-ending plies are never flagged.
 */
export function moveLosesMaterialOnReply(
  engine: SubspaceLatticeEngine,
  move: AgentMove,
): boolean {
  if (!tradeFilterEnabled()) return false;
  if (isEmpAgentMove(move)) return false;
  const me = engine.getState().currentPlayer;
  const mover = engine.getPiece(move.pieceId);
  if (!mover) return true;
  const target = engine.getPieceAt(move.to);
  if (target?.type === PieceType.CommandHub) return false;

  const gained = target ? pieceMaterialValue(target.type) : 0;
  const child = engine.clone();
  if (!applyAgentMove(child, move)) return true;
  if (child.getState().winner) return false;

  const landed = child.getPiece(move.pieceId);
  if (!landed) return false;

  for (const piece of Object.values(child.getState().pieces)) {
    if (piece.owner === me) continue;
    if (child.canMovePiece(piece, landed.position)) {
      return pieceMaterialValue(landed.type) > gained;
    }
  }
  return false;
}

/**
 * True when playing `move` leaves the opponent able to fire EMP and win on
 * Lockout (`no-moves`) immediately. Mirrors HeuristicAi's +50k EMP Lockout
 * tactical from the defender's side. Winning moves that end the game are safe.
 */
export function moveLeavesEmpLockout(
  engine: SubspaceLatticeEngine,
  move: AgentMove,
): boolean {
  if (!empLockoutFilterEnabled()) return false;
  if (!engine.empEnabled()) return false;
  const me = engine.getState().currentPlayer;
  const child = engine.clone();
  if (!applyAgentMove(child, move)) return true;
  const state = child.getState();
  if (state.winner) return false;
  // Opponent to move after our ply.
  if (!child.canFireEmp()) return false;
  const enemy = state.currentPlayer;
  const probe = child.clone();
  if (!probe.fireEmp()) return false;
  return probe.getState().winner === enemy && me !== enemy;
}

/** Hub mate, EMP Lockout reply, or a clearly losing trade. */
export function moveIsTacticallyUnsafe(
  engine: SubspaceLatticeEngine,
  move: AgentMove,
): boolean {
  return (
    moveLeavesHubHanging(engine, move) ||
    moveLeavesEmpLockout(engine, move) ||
    moveLosesMaterialOnReply(engine, move)
  );
}

/**
 * Prefer moves that do not walk into an immediate Surgical Strike or
 * EMP Lockout reply. If every legal move is unsafe, return the full list.
 */
export function filterMovesAvoidingHubMate<T extends AgentMove>(
  engine: SubspaceLatticeEngine,
  moves: readonly T[],
): T[] {
  if (moves.length === 0) return [];
  if (
    !hubMateFilterEnabled() &&
    !empLockoutFilterEnabled() &&
    !tradeFilterEnabled()
  ) {
    return [...moves];
  }
  const safe = moves.filter((m) => !moveIsTacticallyUnsafe(engine, m));
  return safe.length > 0 ? safe : [...moves];
}

/**
 * Pick the best-scoring move that does not hang the Hub or throw material,
 * checking safety lazily from the top score band down. Falls back to the best
 * hanging/unsafe move when every option is bad. Ties break via `rng`.
 */
export function pickBestAvoidingHubMate<T extends AgentMove>(
  engine: SubspaceLatticeEngine,
  scored: readonly { move: T; score: number }[],
  rng: () => number,
): T | null {
  if (scored.length === 0) return null;
  if (
    !hubMateFilterEnabled() &&
    !empLockoutFilterEnabled() &&
    !tradeFilterEnabled()
  ) {
    let bestScore = Number.NEGATIVE_INFINITY;
    const best: T[] = [];
    for (const { move, score } of scored) {
      if (score > bestScore) {
        bestScore = score;
        best.length = 0;
        best.push(move);
      } else if (score === bestScore) {
        best.push(move);
      }
    }
    if (best.length === 0) return null;
    return best[Math.min(best.length - 1, Math.floor(rng() * best.length))]!;
  }
  const bands = new Map<number, T[]>();
  for (const { move, score } of scored) {
    const band = bands.get(score);
    if (band) band.push(move);
    else bands.set(score, [move]);
  }
  const scores = [...bands.keys()].sort((a, b) => b - a);

  const pickSafe = (pred: (m: T) => boolean): T | null => {
    for (const score of scores) {
      const safe = bands.get(score)!.filter(pred);
      if (safe.length > 0) {
        return safe[
          Math.min(safe.length - 1, Math.floor(rng() * safe.length))
        ]!;
      }
    }
    return null;
  };

  // Prefer: not hub-mate / EMP-lockout AND not a losing trade.
  const best =
    pickSafe((m) => !moveIsTacticallyUnsafe(engine, m)) ??
    pickSafe(
      (m) =>
        !moveLeavesHubHanging(engine, m) && !moveLeavesEmpLockout(engine, m),
    );
  if (best) return best;

  // Everything tactically losing — forced loss; keep the strongest attempt.
  const top = bands.get(scores[0]!)!;
  return top[Math.min(top.length - 1, Math.floor(rng() * top.length))]!;
}

/**
 * Shallow maximizer over evaluatePosition after each legal move.
 * Depth 1 only (branching is large under hybrid infiltrator warps).
 * Skips moves that leave the Command Hub hanging when safer options exist.
 */
export function shallowBestMove(
  engine: SubspaceLatticeEngine,
  rng: () => number = Math.random,
): AgentMove | null {
  const me = engine.getState().currentPlayer;
  const scored: { move: AgentMove; score: number }[] = [];

  for (const legal of engine.listLegalMoves()) {
    const move = { pieceId: legal.pieceId, to: legal.to };
    const child = engine.clone();
    if (!child.movePiece(move.pieceId, move.to)) continue;
    scored.push({ move, score: evaluatePosition(child, me) });
  }

  if (engine.canFireEmp()) {
    const child = engine.clone();
    if (child.fireEmp()) {
      scored.push({
        move: { type: 'emp' },
        score: evaluatePosition(child, me),
      });
    }
  }

  return pickBestAvoidingHubMate(engine, scored, rng);
}
