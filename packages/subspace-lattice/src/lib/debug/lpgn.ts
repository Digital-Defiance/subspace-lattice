import type { MoveInfo } from '../game-engine';
import type { Coordinate } from '../interfaces/coordinate';
import type { GameState, WinnerReason } from '../interfaces/gameState';
import type { PieceType } from '../interfaces/pieceType';
import { pieceTypeChessSymbolMap } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import type { RulesConfig } from '../rules/rules-config';
import { heavyWingPresetFromRules } from '../rules/rules-config';
import type {
  LatticeDebugExport,
  LatticeDebugMode,
  MatchDebugMoveEntry,
  MatchDebugMoveSource,
  MatchDebugPlyKind,
} from './match-debug-log';
import { sanitizeFilenamePart } from './match-debug-log';

export const LPGN_VERSION = '0.1' as const;

export type { MatchDebugPlyKind };

/** Extended fields used by LPGN (optional on older logs). */
export type LpgnMoveFields = {
  kind?: MatchDebugPlyKind;
  moverType?: PieceType;
  capturedType?: PieceType;
};

export type LpgnMoveEntry = MatchDebugMoveEntry & LpgnMoveFields;

/** Build a move-log row from engine MoveInfo (local AI / pass-and-play). */
export function matchDebugEntryFromMoveInfo(options: {
  player: PlayerColor | string;
  pieceId: string;
  from?: Coordinate;
  to: Coordinate;
  capturedId?: string;
  capturedType?: PieceType;
  source: MatchDebugMoveSource;
  ok: boolean;
  info?: MoveInfo | null;
  /** When firing EMP, pass the Hub square. */
  empOrigin?: Coordinate;
}): MatchDebugMoveEntry {
  const info = options.info;
  let kind: MatchDebugPlyKind = 'move';
  if (info?.empFired || options.pieceId === 'emp') kind = 'emp';
  else if (info?.spoolAnnounce) kind = 'spool-announce';
  else if (info?.spoolFailed) kind = 'spool-failed';

  const from =
    kind === 'emp'
      ? (options.empOrigin ?? options.from ?? options.to)
      : options.from;

  return {
    at: new Date().toISOString(),
    player: options.player,
    pieceId: options.pieceId,
    from,
    to: kind === 'emp' ? (from ?? options.to) : options.to,
    captured: options.capturedId,
    capturedType: options.capturedType ?? info?.capturedType,
    source: options.source,
    ok: options.ok,
    kind,
    moverType: info?.moverType,
  };
}

/** Engine (x,y) → algebraic square (`a1` … `k11`). */
export function coordToLpgnSquare(c: Coordinate): string {
  if (c.x < 0 || c.y < 0) return '??';
  const file = String.fromCharCode('a'.charCodeAt(0) + c.x);
  return `${file}${c.y + 1}`;
}

export function pieceLetter(type: PieceType): string {
  return pieceTypeChessSymbolMap[type].toUpperCase();
}

export function formatLpgnPlyToken(entry: LpgnMoveEntry): string | null {
  if (!entry.ok) return null;
  const kind = entry.kind ?? 'move';

  if (kind === 'emp') {
    const origin = entry.from ?? entry.to;
    return `EMP@${coordToLpgnSquare(origin)}`;
  }

  const letter = entry.moverType ? pieceLetter(entry.moverType) : 'X';
  const from = entry.from ? coordToLpgnSquare(entry.from) : '??';

  if (kind === 'spool-announce') {
    return `N@${from}->${coordToLpgnSquare(entry.to)}`;
  }
  if (kind === 'spool-failed') {
    return `N@${from}--`;
  }

  const to = coordToLpgnSquare(entry.to);
  const cap = entry.captured || entry.capturedType ? 'x' : '';
  return `${letter}${from}${cap}${to}`;
}

export function lpgnResult(
  winner?: PlayerColor,
  reason?: WinnerReason,
): { result: string; termination?: WinnerReason } {
  if (!winner) return { result: '*' };
  const result = winner === PlayerColor.White ? '1-0' : '0-1';
  return { result, termination: reason };
}

export function formatLpgnMoveText(entries: readonly LpgnMoveEntry[]): string {
  const tokens = entries
    .map(formatLpgnPlyToken)
    .filter((t): t is string => Boolean(t));
  if (tokens.length === 0) return '';

  const parts: string[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    const moveNo = Math.floor(i / 2) + 1;
    const white = tokens[i]!;
    const black = tokens[i + 1];
    if (black) {
      parts.push(`${moveNo}. ${white} ${black}`);
    } else {
      parts.push(`${moveNo}. ${white}`);
    }
  }
  return parts.join(' ');
}

/**
 * Scrollable game-log lines for the LPGN display toggle (one ply per line).
 * White: `1. Pe5e6` · Black: `1... nd8c6`.
 */
export function formatLpgnGameLogLines(
  entries: readonly LpgnMoveEntry[],
): string[] {
  const tokens = entries
    .map(formatLpgnPlyToken)
    .filter((t): t is string => Boolean(t));
  const lines: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const moveNo = Math.floor(i / 2) + 1;
    const token = tokens[i]!;
    lines.push(i % 2 === 0 ? `${moveNo}. ${token}` : `${moveNo}... ${token}`);
  }
  return lines;
}

export interface FormatLpgnOptions {
  event: string;
  site?: string;
  date?: string;
  white: string;
  black: string;
  mode: LatticeDebugMode | 'tutorial';
  rules: RulesConfig;
  gameState: GameState;
  moves: readonly LpgnMoveEntry[];
  sectorCode?: string;
  tei?: 'rated' | 'casual' | 'assisted';
  extraHeaders?: Record<string, string>;
}

function tag(name: string, value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `[${name} "${escaped}"]`;
}

function utcDateStamp(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '.');
  }
  return d.toISOString().slice(0, 10).replace(/-/g, '.');
}

export function formatLpgn(options: FormatLpgnOptions): string {
  const { result, termination } = lpgnResult(
    options.gameState.winner,
    options.gameState.winnerReason,
  );
  const rules = options.rules;
  const headers = [
    tag('Event', options.event),
    tag('Site', options.site ?? 'lattice.iwgf.org'),
    tag('Date', options.date ?? utcDateStamp()),
    tag('White', options.white),
    tag('Black', options.black),
    tag('Result', result),
    tag('Rules', String(options.gameState.rulesVersion ?? rules.version)),
    tag('Mode', options.mode),
    tag('LPGN', LPGN_VERSION),
    tag('HeavyWing', heavyWingPresetFromRules(rules)),
    tag('SectorClock', String(rules.sectorActivationPly ?? 0)),
    tag('EmpRadius', String(rules.empRadius ?? 0)),
    tag('EmpCharge', String(rules.empChargeTarget ?? 0)),
    tag('EmpBlackout', String(rules.empBlackoutPlies ?? 1)),
    tag('InfiltratorSpool', rules.infiltratorSpoolUp ? '1' : '0'),
    tag('InfiltratorUnlock', String(rules.infiltratorActivationPly ?? 0)),
  ];
  if (termination) headers.push(tag('Termination', termination));
  if (options.sectorCode) headers.push(tag('Sector', options.sectorCode));
  if (options.tei) headers.push(tag('TEI', options.tei));
  if (options.gameState.plyCount != null) {
    headers.push(tag('PlyCount', String(options.gameState.plyCount)));
  }
  for (const [k, v] of Object.entries(options.extraHeaders ?? {})) {
    headers.push(tag(k, v));
  }

  const body = formatLpgnMoveText(options.moves);
  const lines = [...headers, '', body ? `${body} ${result}` : result, ''];
  return lines.join('\n');
}

/** Build LPGN text from a debug export payload (shared path for all modes). */
export function formatLpgnFromDebugExport(
  payload: LatticeDebugExport,
  rules: RulesConfig,
): string {
  const c = payload.client;
  const white =
    c.passAndPlay?.whiteName ??
    c.online?.whiteDisplayName ??
    (c.localAi?.localPlayerColor === PlayerColor.White
      ? 'You'
      : c.localAi
        ? `Lattice AI (${c.localAi.strength})`
        : 'White');
  const black =
    c.passAndPlay?.blackName ??
    c.online?.blackDisplayName ??
    (c.localAi?.localPlayerColor === PlayerColor.Black
      ? 'You'
      : c.localAi
        ? `Lattice AI (${c.localAi.strength})`
        : 'Black');

  let tei: FormatLpgnOptions['tei'];
  if (c.localAi?.assisted || c.online?.assisted) tei = 'assisted';
  else if (c.online?.rated) tei = 'rated';
  else if (payload.mode === 'online' || payload.mode === 'local-ai') tei = 'casual';

  const event =
    payload.mode === 'local-ai'
      ? 'Local vs AI'
      : payload.mode === 'pass-and-play'
        ? 'Pass & Play'
        : c.online?.roomName
          ? `Online · ${c.online.roomName}`
          : 'Online';

  return formatLpgn({
    event,
    date: utcDateStamp(payload.exportedAt),
    white,
    black,
    mode: payload.mode,
    rules,
    gameState: c.gameState,
    moves: c.moveLog as LpgnMoveEntry[],
    sectorCode: payload.sectorCode,
    tei,
  });
}

export function buildLpgnFilename(
  sectorCode: string,
  exportedAt: string = new Date().toISOString(),
): string {
  const stamp = exportedAt.slice(0, 19).replace(/[:T]/g, '-');
  return `lattice-${sanitizeFilenamePart(sectorCode)}-${stamp}.lpgn`;
}

/**
 * Infer one debug/LPGN ply from a before→after state delta (online sync).
 */
export function diffStatesToLpgnEntry(
  before: GameState,
  after: GameState,
): LpgnMoveEntry | null {
  const beforePly = before.plyCount ?? 0;
  const afterPly = after.plyCount ?? 0;
  if (afterPly <= beforePly) return null;

  const player = before.currentPlayer;

  if (!before.empActive && after.empActive) {
    const origin = after.empActive.origin;
    return {
      at: new Date().toISOString(),
      player,
      pieceId: 'emp',
      kind: 'emp',
      from: { ...origin },
      to: { ...origin },
      source: 'human',
      ok: true,
    };
  }

  // Spool announce: same positions, new spoolTarget
  for (const [id, piece] of Object.entries(after.pieces ?? {})) {
    const prev = before.pieces?.[id];
    if (!prev) continue;
    if (
      prev.position.x === piece.position.x &&
      prev.position.y === piece.position.y &&
      piece.spoolTarget &&
      (!prev.spoolTarget ||
        prev.spoolTarget.x !== piece.spoolTarget.x ||
        prev.spoolTarget.y !== piece.spoolTarget.y)
    ) {
      return {
        at: new Date().toISOString(),
        player,
        pieceId: id,
        kind: 'spool-announce',
        moverType: piece.type,
        from: { ...piece.position },
        to: { ...piece.spoolTarget },
        source: 'human',
        ok: true,
      };
    }
  }

  // Spool failed: spoolTarget cleared, no move, not capture
  for (const [id, prev] of Object.entries(before.pieces ?? {})) {
    const piece = after.pieces?.[id];
    if (!piece || !prev.spoolTarget) continue;
    if (
      piece.position.x === prev.position.x &&
      piece.position.y === prev.position.y &&
      !piece.spoolTarget
    ) {
      // Could be execute cleared after move — only if no other piece moved
      const moved = Object.keys(after.pieces ?? {}).some((pid) => {
        const a = after.pieces![pid]!;
        const b = before.pieces?.[pid];
        return (
          b &&
          (a.position.x !== b.position.x || a.position.y !== b.position.y)
        );
      });
      if (!moved) {
        return {
          at: new Date().toISOString(),
          player,
          pieceId: id,
          kind: 'spool-failed',
          moverType: prev.type,
          from: { ...prev.position },
          to: { ...prev.position },
          source: 'human',
          ok: true,
        };
      }
    }
  }

  for (const [id, piece] of Object.entries(after.pieces ?? {})) {
    const prev = before.pieces?.[id];
    if (!prev) continue;
    if (
      prev.position.x !== piece.position.x ||
      prev.position.y !== piece.position.y
    ) {
      const capturedId = Object.keys(before.pieces ?? {}).find(
        (pid) => !after.pieces?.[pid],
      );
      const capturedType = capturedId
        ? before.pieces![capturedId]?.type
        : undefined;
      return {
        at: new Date().toISOString(),
        player,
        pieceId: id,
        kind: 'move',
        moverType: piece.type,
        from: { ...prev.position },
        to: { ...piece.position },
        captured: capturedId,
        capturedType,
        source: 'human',
        ok: true,
      };
    }
  }

  return null;
}
