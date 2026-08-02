/**
 * Apply parsed LPGN plies on a live engine (starting setup from headers).
 */
import { SubspaceLatticeEngine } from '../game-engine';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import type { GameState } from '../interfaces/gameState';
import type { Coordinate } from '../interfaces/coordinate';
import { coordToLpgnSquare } from './lpgn';
import {
  parseLpgn,
  rulesFromLpgnHeaders,
  type LpgnParsedPly,
  type ParsedLpgn,
} from './lpgn-parse';
import { yieldToMain } from '../ai/cooperative-yield';

export interface LpgnReplayPly {
  index: number;
  token: string;
  parsed: LpgnParsedPly;
  player: PlayerColor;
  /** State before the ply is applied. */
  before: GameState;
  /** State after the ply is applied. */
  after: GameState;
  captureType?: PieceType;
}

export interface LpgnReplayResult {
  parsed: ParsedLpgn;
  engine: SubspaceLatticeEngine;
  plies: LpgnReplayPly[];
  /** Position before any ply. */
  initial: GameState;
}

function sameCoord(a: Coordinate, b: Coordinate): boolean {
  return a.x === b.x && a.y === b.y;
}

function applyParsedPly(
  engine: SubspaceLatticeEngine,
  ply: LpgnParsedPly,
): { ok: boolean; captureType?: PieceType } {
  if (ply.kind === 'emp' || ply.kind === 'terminal-emp') {
    const hub = Object.values(engine.getState().pieces).find(
      (p) =>
        p.owner === engine.getState().currentPlayer &&
        p.type === PieceType.CommandHub,
    );
    if (!hub || !sameCoord(hub.position, ply.origin)) {
      return { ok: false };
    }
    return { ok: engine.fireEmp() };
  }

  if (ply.kind === 'spool-announce' || ply.kind === 'spool-failed') {
    const piece = Object.values(engine.getState().pieces).find(
      (p) =>
        p.owner === engine.getState().currentPlayer &&
        p.type === PieceType.Infiltrator &&
        sameCoord(p.position, ply.from),
    );
    if (!piece) return { ok: false };
    const to = ply.to ?? ply.from;
    const ok = engine.movePiece(piece.id, to);
    return { ok };
  }

  if (ply.kind !== 'move') return { ok: false };

  const piece = Object.values(engine.getState().pieces).find(
    (p) =>
      p.owner === engine.getState().currentPlayer &&
      p.type === ply.moverType &&
      sameCoord(p.position, ply.from),
  );
  if (!piece) return { ok: false };
  const target = engine.getPieceAt(ply.to);
  const captureType = target?.type;
  const ok = engine.movePiece(piece.id, ply.to);
  return { ok, captureType };
}

function describePlyOrigin(ply: LpgnParsedPly): string {
  switch (ply.kind) {
    case 'move':
      return coordToLpgnSquare(ply.from);
    case 'emp':
    case 'terminal-emp':
      return coordToLpgnSquare(ply.origin);
    case 'spool-announce':
    case 'spool-failed':
      return coordToLpgnSquare(ply.from);
  }
}

export function replayLpgn(text: string): LpgnReplayResult {
  const parsed = parseLpgn(text);
  const rules = rulesFromLpgnHeaders(parsed.headers);
  const engine = new SubspaceLatticeEngine({ rules });
  const initial = engine.getStateCopy();
  const plies: LpgnReplayPly[] = [];

  for (let i = 0; i < parsed.plies.length; i++) {
    const parsedPly = parsed.plies[i]!;
    const before = engine.getStateCopy();
    const player = before.currentPlayer;
    const { ok, captureType } = applyParsedPly(engine, parsedPly);
    if (!ok) {
      const seat = player === PlayerColor.White ? 'White' : 'Black';
      throw new Error(
        `LPGN replay failed at ply ${i + 1} (${seat} ${parsedPly.raw}): ` +
          `illegal or unmatched from ${describePlyOrigin(parsedPly)}`,
      );
    }
    plies.push({
      index: i,
      token: parsedPly.raw,
      parsed: parsedPly,
      player,
      before,
      after: engine.getStateCopy(),
      captureType,
    });
  }

  return { parsed, engine, plies, initial };
}

export interface ReplayLpgnProgress {
  phase: 'replay';
  current: number;
  total: number;
  percent: number;
  message: string;
  token?: string;
}

export type ReplayLpgnOptions = {
  onProgress?: (p: ReplayLpgnProgress) => void;
  signal?: AbortSignal;
  /** Yield every N plies (default 1). Use 0 for tight CLI batches. */
  yieldEvery?: number;
};

/**
 * Same as `replayLpgn`, but yields so the UI can show true replay progress.
 */
export async function replayLpgnAsync(
  text: string,
  options: ReplayLpgnOptions = {},
): Promise<LpgnReplayResult> {
  const yieldEvery = options.yieldEvery ?? 1;
  const parsed = parseLpgn(text);
  const rules = rulesFromLpgnHeaders(parsed.headers);
  const engine = new SubspaceLatticeEngine({ rules });
  const initial = engine.getStateCopy();
  const plies: LpgnReplayPly[] = [];
  const total = Math.max(1, parsed.plies.length);

  options.onProgress?.({
    phase: 'replay',
    current: 0,
    total,
    percent: 0,
    message: `Replaying 0/${parsed.plies.length} plies…`,
  });
  await yieldToMain();

  for (let i = 0; i < parsed.plies.length; i++) {
    if (options.signal?.aborted) {
      const err = new Error('Replay aborted');
      err.name = 'AbortError';
      throw err;
    }
    const parsedPly = parsed.plies[i]!;
    const before = engine.getStateCopy();
    const player = before.currentPlayer;
    const { ok, captureType } = applyParsedPly(engine, parsedPly);
    if (!ok) {
      const seat = player === PlayerColor.White ? 'White' : 'Black';
      throw new Error(
        `LPGN replay failed at ply ${i + 1} (${seat} ${parsedPly.raw}): ` +
          `illegal or unmatched from ${describePlyOrigin(parsedPly)}`,
      );
    }
    plies.push({
      index: i,
      token: parsedPly.raw,
      parsed: parsedPly,
      player,
      before,
      after: engine.getStateCopy(),
      captureType,
    });

    const current = i + 1;
    options.onProgress?.({
      phase: 'replay',
      current,
      total,
      percent: Math.round((100 * current) / total),
      message: `Replaying ${current}/${parsed.plies.length} (${parsedPly.raw})…`,
      token: parsedPly.raw,
    });
    if (yieldEvery > 0 && current % yieldEvery === 0) {
      await yieldToMain();
    }
  }

  return { parsed, engine, plies, initial };
}
