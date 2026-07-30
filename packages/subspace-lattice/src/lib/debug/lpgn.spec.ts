import { describe, expect, it } from 'vitest';
import { PieceType, PlayerColor } from '../interfaces';
import { resolveRulesConfig } from '../rules/rules-config';
import {
  buildLpgnFilename,
  coordToLpgnSquare,
  diffStatesToLpgnEntry,
  formatLpgn,
  formatLpgnGameLogLines,
  formatLpgnPlyToken,
} from './lpgn';

describe('LPGN', () => {
  it('maps engine coords to a1–k11', () => {
    expect(coordToLpgnSquare({ x: 0, y: 0 })).toBe('a1');
    expect(coordToLpgnSquare({ x: 5, y: 5 })).toBe('f6');
    expect(coordToLpgnSquare({ x: 10, y: 10 })).toBe('k11');
  });

  it('formats piece moves, EMP, and spool tokens', () => {
    expect(
      formatLpgnPlyToken({
        at: '',
        player: PlayerColor.White,
        pieceId: 'w-p',
        kind: 'move',
        moverType: PieceType.Escort,
        from: { x: 4, y: 4 },
        to: { x: 4, y: 5 },
        source: 'human',
        ok: true,
      }),
    ).toBe('Pe5e6');

    expect(
      formatLpgnPlyToken({
        at: '',
        player: PlayerColor.White,
        pieceId: 'emp',
        kind: 'emp',
        from: { x: 5, y: 0 },
        to: { x: 5, y: 0 },
        source: 'human',
        ok: true,
      }),
    ).toBe('EMP@f1');

    expect(
      formatLpgnPlyToken({
        at: '',
        player: PlayerColor.White,
        pieceId: 'w-n',
        kind: 'spool-announce',
        moverType: PieceType.Infiltrator,
        from: { x: 2, y: 1 },
        to: { x: 5, y: 4 },
        source: 'human',
        ok: true,
      }),
    ).toBe('N@c2->f5');
  });

  it('emits headers and numbered body', () => {
    const rules = resolveRulesConfig('hybrid-fleet');
    const text = formatLpgn({
      event: 'Pass & Play',
      site: 'offline',
      date: '2026.07.29',
      white: 'Alex',
      black: 'Blake',
      mode: 'pass-and-play',
      rules,
      gameState: {
        boardSize: 11,
        cells: [],
        pieces: {},
        currentPlayer: PlayerColor.White,
        winner: PlayerColor.White,
        winnerReason: 'hub-capture',
        rulesVersion: 'hybrid-fleet',
        plyCount: 2,
      },
      moves: [
        {
          at: '',
          player: PlayerColor.White,
          pieceId: 'a',
          kind: 'move',
          moverType: PieceType.Escort,
          from: { x: 4, y: 4 },
          to: { x: 4, y: 5 },
          source: 'human',
          ok: true,
        },
        {
          at: '',
          player: PlayerColor.Black,
          pieceId: 'b',
          kind: 'move',
          moverType: PieceType.Escort,
          from: { x: 4, y: 9 },
          to: { x: 4, y: 8 },
          source: 'human',
          ok: true,
        },
      ],
    });
    expect(text).toContain('[LPGN "0.1"]');
    expect(text).toContain('[Result "1-0"]');
    expect(text).toContain('[Termination "hub-capture"]');
    expect(text).toContain('1. Pe5e6 Pe10e9 1-0');
  });

  it('diffs EMP activation across states', () => {
    const before = {
      boardSize: 11,
      cells: [],
      pieces: {},
      currentPlayer: PlayerColor.White,
      plyCount: 4,
    };
    const after = {
      ...before,
      plyCount: 5,
      currentPlayer: PlayerColor.Black,
      empActive: {
        origin: { x: 5, y: 0 },
        radius: 3,
        firedBy: PlayerColor.White,
        targetSide: PlayerColor.Black,
        pliesRemaining: 1,
      },
    };
    const entry = diffStatesToLpgnEntry(before, after);
    expect(entry?.kind).toBe('emp');
    expect(formatLpgnPlyToken(entry!)).toBe('EMP@f1');
  });

  it('formats scrollable game-log LPGN lines', () => {
    expect(
      formatLpgnGameLogLines([
        {
          at: '',
          player: PlayerColor.White,
          pieceId: 'w-p',
          kind: 'move',
          moverType: PieceType.Escort,
          from: { x: 4, y: 4 },
          to: { x: 4, y: 5 },
          source: 'human',
          ok: true,
        },
        {
          at: '',
          player: PlayerColor.Black,
          pieceId: 'b-n',
          kind: 'move',
          moverType: PieceType.Infiltrator,
          from: { x: 3, y: 7 },
          to: { x: 4, y: 5 },
          source: 'human',
          ok: true,
        },
      ]),
    ).toEqual(['1. Pe5e6', '1... Nd8e6']);
  });

  it('builds .lpgn filenames', () => {
    expect(buildLpgnFilename('pass-and-play', '2026-07-29T12:00:00.000Z')).toBe(
      'lattice-pass-and-play-2026-07-29-12-00-00.lpgn',
    );
  });
});
