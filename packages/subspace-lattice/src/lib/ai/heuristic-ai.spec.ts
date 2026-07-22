import { describe, expect, it } from 'vitest';
import { createSequenceRng, HeuristicAi } from './heuristic-ai';
import { SubspaceLatticeEngine } from '../game-engine';
import { PieceType, PlayerColor } from '../interfaces';

describe('HeuristicAi', () => {
  it('returns a legal move on the opening position for black', () => {
    const engine = new SubspaceLatticeEngine();
    const whiteMove = engine.listLegalMoves(PlayerColor.White)[0]!;
    expect(engine.movePiece(whiteMove.pieceId, whiteMove.to)).toBe(true);

    const ai = new HeuristicAi(createSequenceRng([0]));
    const choice = ai.chooseMove(engine);
    expect(choice).not.toBeNull();
    const legal = engine.listLegalMoves(PlayerColor.Black);
    expect(
      legal.some(
        (m) =>
          m.pieceId === choice!.pieceId &&
          m.to.x === choice!.to.x &&
          m.to.y === choice!.to.y,
      ),
    ).toBe(true);
    expect(engine.movePiece(choice!.pieceId, choice!.to)).toBe(true);
  });

  it('prefers capturing the command hub when available', () => {
    const engine = new SubspaceLatticeEngine();
    const state = structuredClone(engine.getState());
    state.currentPlayer = PlayerColor.Black;
    const escort = state.pieces['b-e3']!;
    const old = state.cells.find(
      (c) =>
        c.coordinate.x === escort.position.x &&
        c.coordinate.y === escort.position.y,
    )!;
    old.pieceId = undefined;
    escort.position = { x: 5, y: 1 };
    const cell = state.cells.find(
      (c) => c.coordinate.x === 5 && c.coordinate.y === 1,
    )!;
    cell.pieceId = 'b-e3';

    const live = SubspaceLatticeEngine.fromState(state);
    const ai = new HeuristicAi(createSequenceRng([0]));
    const choice = ai.chooseMove(live);
    expect(choice).not.toBeNull();
    expect(choice!.to).toEqual({ x: 5, y: 0 });
    expect(live.getPieceAt(choice!.to)?.type).toBe(PieceType.CommandHub);
  });

  it('returns null when the side has no moves', () => {
    const engine = new SubspaceLatticeEngine();
    const state = structuredClone(engine.getState());
    for (const id of Object.keys(state.pieces)) {
      if (id.startsWith('b-')) {
        const piece = state.pieces[id]!;
        const cell = state.cells.find(
          (c) =>
            c.coordinate.x === piece.position.x &&
            c.coordinate.y === piece.position.y,
        );
        if (cell) cell.pieceId = undefined;
        delete state.pieces[id];
      }
    }
    state.currentPlayer = PlayerColor.Black;
    const live = SubspaceLatticeEngine.fromState(state);
    const ai = new HeuristicAi();
    expect(ai.chooseMove(live)).toBeNull();
  });
});
