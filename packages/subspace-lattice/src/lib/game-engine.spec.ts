import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from './game-engine';
import { CellType, PieceType, PlayerColor } from './interfaces';

describe('SubspaceLatticeEngine', () => {
  it('initializes an 11x11 board with both command hubs and a gravity well', () => {
    const engine = new SubspaceLatticeEngine();
    const state = engine.getState();
    expect(state.boardSize).toBe(11);
    expect(state.rulesVersion).toBe('classic');
    expect(state.currentPlayer).toBe(PlayerColor.White);
    expect(state.pieces['w-ch']?.type).toBe(PieceType.CommandHub);
    expect(state.pieces['w-ch']?.position).toEqual({ x: 5, y: 0 });
    expect(state.pieces['b-ch']?.type).toBe(PieceType.CommandHub);
    expect(engine.getCell({ x: 5, y: 5 })?.type).toBe(CellType.GravityWell);
  });

  it('centers the opening layout on a 9x9 boardSize override (lab)', () => {
    const engine = new SubspaceLatticeEngine({
      rulesVersion: 'hybrid-fleet',
      boardSize: 9,
    });
    const state = engine.getState();
    expect(state.boardSize).toBe(9);
    expect(state.pieces['w-ch']?.position).toEqual({ x: 4, y: 0 });
    expect(state.pieces['b-ch']?.position).toEqual({ x: 4, y: 8 });
    // Same 9-piece roster; wings at center±3 / ±2 — no back-rank stacks.
    expect(state.pieces['w-h1']?.position).toEqual({ x: 1, y: 0 });
    expect(state.pieces['w-h2']?.position).toEqual({ x: 7, y: 0 });
    expect(state.pieces['w-i1']?.position).toEqual({ x: 2, y: 0 });
    expect(state.pieces['w-i2']?.position).toEqual({ x: 6, y: 0 });
    expect(state.pieces['w-e1']?.position).toEqual({ x: 3, y: 0 });
    expect(state.pieces['w-e2']?.position).toEqual({ x: 5, y: 0 });
    expect(state.pieces['w-e4']?.position).toEqual({ x: 4, y: 2 });
    const backFiles = Object.values(state.pieces)
      .filter((p) => p.owner === PlayerColor.White && p.position.y === 0)
      .map((p) => p.position.x);
    expect(new Set(backFiles).size).toBe(backFiles.length);
    expect(engine.getCell({ x: 4, y: 4 })?.type).toBe(CellType.GravityWell);
    expect(engine.listLegalMoves(PlayerColor.White).length).toBeGreaterThan(0);
  });

  it('lists opening legal moves for white', () => {
    const engine = new SubspaceLatticeEngine();
    const moves = engine.listLegalMoves(PlayerColor.White);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.pieceId.startsWith('w-'))).toBe(true);
  });

  it('rejects moving the wrong side on white to move', () => {
    const engine = new SubspaceLatticeEngine();
    const blackEscort = engine.getPiece('b-e3')!;
    expect(
      engine.movePiece('b-e3', {
        x: blackEscort.position.x,
        y: blackEscort.position.y - 1,
      }),
    ).toBe(false);
  });

  it('moves an escort and switches turn', () => {
    const engine = new SubspaceLatticeEngine();
    const from = engine.getPiece('w-e3')!.position;
    const to = { x: from.x, y: from.y + 1 };
    expect(engine.movePiece('w-e3', to)).toBe(true);
    expect(engine.getPiece('w-e3')?.position).toEqual(to);
    expect(engine.getState().currentPlayer).toBe(PlayerColor.Black);
  });

  it('rejects illegal diagonal escort moves', () => {
    const engine = new SubspaceLatticeEngine();
    const from = engine.getPiece('w-e3')!.position;
    expect(engine.movePiece('w-e3', { x: from.x + 1, y: from.y + 1 })).toBe(
      false,
    );
  });

  it('captures a piece and removes it from the board', () => {
    const engine = new SubspaceLatticeEngine();
    // Place black escort in front of white escort via fromState surgery
    const state = structuredClone(engine.getState());
    const victimId = 'b-e3';
    const victim = state.pieces[victimId]!;
    const oldCell = state.cells.find(
      (c) =>
        c.coordinate.x === victim.position.x &&
        c.coordinate.y === victim.position.y,
    )!;
    oldCell.pieceId = undefined;
    victim.position = { x: 5, y: 2 };
    const newCell = state.cells.find(
      (c) => c.coordinate.x === 5 && c.coordinate.y === 2,
    )!;
    newCell.pieceId = victimId;
    const live = SubspaceLatticeEngine.fromState(state);
    expect(live.movePiece('w-e3', { x: 5, y: 2 })).toBe(true);
    expect(live.getPiece(victimId)).toBeUndefined();
  });

  it('wins by capturing the enemy command hub', () => {
    const engine = new SubspaceLatticeEngine();
    const state = structuredClone(engine.getState());
    // Put white escort adjacent to black hub
    const escort = state.pieces['w-e3']!;
    const old = state.cells.find(
      (c) =>
        c.coordinate.x === escort.position.x &&
        c.coordinate.y === escort.position.y,
    )!;
    old.pieceId = undefined;
    escort.position = { x: 5, y: 9 };
    const cell = state.cells.find(
      (c) => c.coordinate.x === 5 && c.coordinate.y === 9,
    )!;
    cell.pieceId = 'w-e3';
    const live = SubspaceLatticeEngine.fromState(state);
    expect(live.movePiece('w-e3', { x: 5, y: 10 })).toBe(true);
    expect(live.getState().winner).toBe(PlayerColor.White);
    expect(live.getPiece('b-ch')).toBeUndefined();
  });

  it('hydrates fromState without mutating the original snapshot', () => {
    const engine = new SubspaceLatticeEngine();
    const snapshot = structuredClone(engine.getState());
    const hydrated = SubspaceLatticeEngine.fromState(snapshot);
    hydrated.movePiece('w-e3', {
      x: 5,
      y: 2,
    });
    expect(snapshot.pieces['w-e3']?.position).toEqual({ x: 5, y: 1 });
  });
});
