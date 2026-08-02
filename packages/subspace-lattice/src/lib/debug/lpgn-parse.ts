/**
 * LPGN 0.2 reader — headers + ply tokens. Does not apply moves (see lpgn-replay).
 */
import { PieceType } from '../interfaces/pieceType';
import type { Coordinate } from '../interfaces/coordinate';
import {
  type HeavyWingPreset,
  type RulesConfig,
  isHeavyWingPreset,
  resolveFleetLobbyRules,
  resolveRulesConfig,
} from '../rules/rules-config';
import type { RulesVersion } from '../interfaces/rulesVersion';

export type LpgnHeaders = Record<string, string>;

export type LpgnParsedPieceMove = {
  kind: 'move';
  letter: string;
  moverType: PieceType;
  from: Coordinate;
  to: Coordinate;
  capture: boolean;
  raw: string;
};

export type LpgnParsedEmp = {
  kind: 'emp' | 'terminal-emp';
  origin: Coordinate;
  radius?: number;
  raw: string;
};

export type LpgnParsedSpool = {
  kind: 'spool-announce' | 'spool-failed';
  from: Coordinate;
  to?: Coordinate;
  raw: string;
};

export type LpgnParsedPly =
  | LpgnParsedPieceMove
  | LpgnParsedEmp
  | LpgnParsedSpool;

export interface ParsedLpgn {
  headers: LpgnHeaders;
  plies: LpgnParsedPly[];
  result: string;
}

const LETTER_TO_TYPE: Record<string, PieceType> = {
  K: PieceType.CommandHub,
  Q: PieceType.Carrier,
  R: PieceType.Beam,
  B: PieceType.Refractor,
  N: PieceType.Infiltrator,
  P: PieceType.Escort,
};

/** Rank 1–11 after a file letter a–k. */
const SQUARE = '([a-k])(1[01]|[1-9])';

export function lpgnSquareToCoord(square: string): Coordinate {
  const m = square.match(/^([a-k])(1[01]|[1-9])$/i);
  if (!m) throw new Error(`Invalid LPGN square: ${square}`);
  return {
    x: m[1]!.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0),
    y: Number(m[2]) - 1,
  };
}

export function parseLpgnHeaders(text: string): LpgnHeaders {
  const headers: LpgnHeaders = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\[(\w+)\s+"(.*)"\]\s*$/);
    if (!m) continue;
    headers[m[1]!] = m[2]!.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return headers;
}

/** Strip PGN-style `{…}` comments and result tokens from the move body. */
function moveBody(text: string): string {
  const blank = text.search(/\n\s*\n/);
  let body = blank >= 0 ? text.slice(blank) : text;
  body = body.replace(/\[[^\]]*\]/g, ' ');
  body = body.replace(/\{[^}]*\}/g, ' ');
  body = body.replace(/\b(?:1-0|0-1|\*)\b/g, ' ');
  body = body.replace(/\d+\.(\.\.)?/g, ' ');
  return body.replace(/\s+/g, ' ').trim();
}

const PIECE_MOVE = new RegExp(
  `^([KQRBNP])${SQUARE}(x?)${SQUARE}$`,
  'i',
);
const EMP = /^((?:TEMP|EMP))@([a-k](?:1[01]|[1-9]))(?:\/r(\d+))?$/i;
const SPOOL_ANN = new RegExp(`^N@${SQUARE}->${SQUARE}$`, 'i');
const SPOOL_FAIL = new RegExp(`^N@${SQUARE}--$`, 'i');

export function parseLpgnPlyToken(raw: string): LpgnParsedPly {
  const token = raw.trim();
  let m = token.match(EMP);
  if (m) {
    return {
      kind: m[1]!.toUpperCase() === 'TEMP' ? 'terminal-emp' : 'emp',
      origin: lpgnSquareToCoord(m[2]!),
      radius: m[3] ? Number(m[3]) : undefined,
      raw: token,
    };
  }
  m = token.match(SPOOL_ANN);
  if (m) {
    return {
      kind: 'spool-announce',
      from: lpgnSquareToCoord(`${m[1]}${m[2]}`),
      to: lpgnSquareToCoord(`${m[3]}${m[4]}`),
      raw: token,
    };
  }
  m = token.match(SPOOL_FAIL);
  if (m) {
    return {
      kind: 'spool-failed',
      from: lpgnSquareToCoord(`${m[1]}${m[2]}`),
      raw: token,
    };
  }
  m = token.match(PIECE_MOVE);
  if (m) {
    const letter = m[1]!.toUpperCase();
    const moverType = LETTER_TO_TYPE[letter];
    if (!moverType) throw new Error(`Unknown piece letter in ${token}`);
    return {
      kind: 'move',
      letter,
      moverType,
      from: lpgnSquareToCoord(`${m[2]}${m[3]}`),
      to: lpgnSquareToCoord(`${m[5]}${m[6]}`),
      capture: m[4] === 'x' || m[4] === 'X',
      raw: token,
    };
  }
  throw new Error(`Unrecognized LPGN ply token: ${token}`);
}

export function parseLpgn(text: string): ParsedLpgn {
  const headers = parseLpgnHeaders(text);
  const body = moveBody(text);
  const tokens = body ? body.split(' ').filter(Boolean) : [];
  const plies = tokens.map(parseLpgnPlyToken);
  const result = headers.Result ?? '*';
  return { headers, plies, result };
}

function intHeader(headers: LpgnHeaders, key: string): number | undefined {
  const v = headers[key];
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function bool01(headers: LpgnHeaders, key: string): boolean | undefined {
  const v = headers[key];
  if (v == null) return undefined;
  if (v === '1' || v.toLowerCase() === 'true') return true;
  if (v === '0' || v.toLowerCase() === 'false') return false;
  return undefined;
}

/** Rebuild RulesConfig from LPGN tags (fleet lobby + Terminal extras). */
export function rulesFromLpgnHeaders(headers: LpgnHeaders): RulesConfig {
  const version = (headers.Rules ?? 'hybrid-fleet') as RulesVersion;
  const heavyWing: HeavyWingPreset = isHeavyWingPreset(headers.HeavyWing)
    ? headers.HeavyWing
    : 'standard';

  const lobby = resolveFleetLobbyRules({
    heavyWingPreset: heavyWing,
    sectorActivationPly: intHeader(headers, 'SectorClock'),
    empRadius: intHeader(headers, 'EmpRadius'),
    empChargeTarget: intHeader(headers, 'EmpCharge'),
    empBlackoutPlies: intHeader(headers, 'EmpBlackout'),
    infiltratorSpoolUp: bool01(headers, 'InfiltratorSpool'),
    infiltratorActivationPly: intHeader(headers, 'InfiltratorUnlock'),
    terminalEmpRadiusGrowthInterval: intHeader(
      headers,
      'TerminalGrowth',
    ) as RulesConfig['terminalEmpRadiusGrowthInterval'] | undefined,
  });

  // resolveFleetLobbyRules already merges hybrid-fleet; overlay Terminal tags
  // that are not lobby knobs when present.
  const base =
    version === 'hybrid-fleet' || version === 'hybrid' || version === 'hybrid-spool'
      ? lobby
      : resolveRulesConfig(version);

  return {
    ...base,
    version: base.version,
    terminalOverclock:
      bool01(headers, 'TerminalOverclock') ?? base.terminalOverclock,
    terminalRequiresBothLone:
      bool01(headers, 'TerminalBothLone') ?? base.terminalRequiresBothLone,
    terminalSharedPhaseClock:
      bool01(headers, 'TerminalSharedClock') ?? base.terminalSharedPhaseClock,
    terminalEmpChargeTarget:
      intHeader(headers, 'TerminalEmpCharge') ?? base.terminalEmpChargeTarget,
    terminalEmpRadius:
      intHeader(headers, 'TerminalEmpRadius') ?? base.terminalEmpRadius,
    terminalEmpRadiusMax:
      intHeader(headers, 'TerminalRadiusMax') ?? base.terminalEmpRadiusMax,
  };
}
