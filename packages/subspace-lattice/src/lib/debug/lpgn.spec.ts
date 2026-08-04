import { describe, expect, it } from 'vitest';
import { PieceType, PlayerColor } from '../interfaces';
import { resolveRulesConfig } from '../rules/rules-config';
import {
  buildLpgnFilename,
  coordToLpgnSquare,
  describeWinnerReason,
  diffStatesToLpgnEntry,
  formatLpgn,
  formatLpgnGameLogLines,
  formatLpgnPlyToken,
  lpgnResult,
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
        empRadius: 3,
      }),
    ).toBe('EMP@f1/r3');

    expect(
      formatLpgnPlyToken({
        at: '',
        player: PlayerColor.White,
        pieceId: 'emp',
        kind: 'terminal-emp',
        from: { x: 2, y: 1 },
        to: { x: 2, y: 1 },
        source: 'human',
        ok: true,
        empRadius: 4,
      }),
    ).toBe('TEMP@c2/r4');

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

  it('emits Terminal Overclock headers on hybrid-fleet', () => {
    const rules = resolveRulesConfig('hybrid-fleet');
    const text = formatLpgn({
      event: 'Pass & Play',
      site: 'offline',
      date: '2026.07.30',
      white: 'Alex',
      black: 'Blake',
      mode: 'pass-and-play',
      rules,
      gameState: {
        boardSize: 11,
        cells: [],
        pieces: {},
        currentPlayer: PlayerColor.White,
        rulesVersion: 'hybrid-fleet',
        plyCount: 0,
      },
      moves: [],
    });
    expect(text).toContain('[LPGN "0.2"]');
    expect(text).toContain('[TerminalOverclock "1"]');
    expect(text).toContain('[TerminalBothLone "1"]');
    expect(text).toContain('[TerminalSharedClock "1"]');
    expect(text).toContain('[TerminalEmpCharge "10"]');
    expect(text).toContain('[TerminalGrowth "5"]');
    expect(text).toContain('[TerminalRadiusMax "10"]');
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
    expect(text).toContain('[LPGN "0.2"]');
    expect(text).toContain('[Result "1-0"]');
    expect(text).toContain('[Termination "hub-capture"]');
    expect(text).toContain('1. Pe5e6 Pe10e9 1-0');
  });

  it('exports ai-resigned Termination for Grandmaster resignation', () => {
    const rules = resolveRulesConfig('hybrid-fleet');
    const text = formatLpgn({
      event: 'Local AI',
      site: 'offline',
      date: '2026.08.03',
      white: 'You',
      black: 'Lattice AI (normal)',
      mode: 'local-ai',
      rules,
      gameState: {
        boardSize: 11,
        cells: [],
        pieces: {},
        currentPlayer: PlayerColor.Black,
        winner: PlayerColor.White,
        winnerReason: 'ai-resigned',
        rulesVersion: 'hybrid-fleet',
        plyCount: 40,
      },
      moves: [],
    });
    expect(text).toContain('[Result "1-0"]');
    expect(text).toContain('[Termination "ai-resigned"]');
    expect(lpgnResult(PlayerColor.White, 'ai-resigned')).toEqual({
      result: '1-0',
      termination: 'ai-resigned',
    });
    expect(describeWinnerReason('ai-resigned')).toContain('forced loss');
    expect(describeWinnerReason('resign')).toContain('resign');
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
    expect(entry?.empRadius).toBe(3);
    expect(formatLpgnPlyToken(entry!)).toBe('EMP@f1/r3');
  });

  it('diffs Terminal EMP when firer Hub is fused', () => {
    const before = {
      boardSize: 11,
      cells: [],
      pieces: {
        'w-ch': {
          id: 'w-ch',
          type: PieceType.CommandHub,
          owner: PlayerColor.White,
          position: { x: 2, y: 1 },
        },
        'b-ch': {
          id: 'b-ch',
          type: PieceType.CommandHub,
          owner: PlayerColor.Black,
          position: { x: 2, y: 7 },
        },
      },
      currentPlayer: PlayerColor.White,
      plyCount: 10,
      terminalPhaseArmed: true,
    };
    const after = {
      ...before,
      plyCount: 11,
      currentPlayer: PlayerColor.Black,
      pieces: {
        'w-ch': {
          ...before.pieces['w-ch'],
          enginesFused: true,
        },
        'b-ch': before.pieces['b-ch'],
      },
      empActive: {
        origin: { x: 2, y: 1 },
        radius: 4,
        firedBy: PlayerColor.White,
        targetSide: PlayerColor.Black,
        pliesRemaining: 1,
      },
    };
    const entry = diffStatesToLpgnEntry(before, after);
    expect(entry?.kind).toBe('terminal-emp');
    expect(formatLpgnPlyToken(entry!)).toBe('TEMP@c2/r4');
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
