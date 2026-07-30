import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from '../game-engine';
import { PieceType, PlayerColor } from '../interfaces';
import {
  moveLosesMaterialOnReply,
  moveLeavesHubHanging,
} from './tactical';
import { HeuristicAi, createSequenceRng } from './heuristic-ai';
import { requirePieceAgentMove } from './agent';

describe('material safety', () => {
  it('flags hanging a Beam on an empty square', () => {
    const engine = new SubspaceLatticeEngine();
    const state = structuredClone(engine.getState());
    // White Beam on e2 (5,1); Black Escort on e4 (5,3) can step to e3? Escorts move 1.
    // Put Black Escort at e3 (5,2) and White Beam moves to e3 capturing... 
    // Simpler: White Beam at a1-ish moves onto a square attacked by Black escort.
    const beam = Object.values(state.pieces).find(
      (p) => p.owner === PlayerColor.White && p.type === PieceType.Beam,
    )!;
    const blackEscort = Object.values(state.pieces).find(
      (p) => p.owner === PlayerColor.Black && p.type === PieceType.Escort,
    )!;
    // Clear path: place black escort at (beam.x, beam.y+2), white beam slides to (beam.x, beam.y+1)
    // so escort can capture down onto it.
    const from = { ...beam.position };
    const mid = { x: from.x, y: from.y + 1 };
    const escortCell = state.cells.find(
      (c) =>
        c.coordinate.x === blackEscort.position.x &&
        c.coordinate.y === blackEscort.position.y,
    )!;
    escortCell.pieceId = undefined;
    blackEscort.position = { x: from.x, y: from.y + 2 };
    const destCell = state.cells.find(
      (c) =>
        c.coordinate.x === blackEscort.position.x &&
        c.coordinate.y === blackEscort.position.y,
    )!;
    destCell.pieceId = blackEscort.id;

    const live = SubspaceLatticeEngine.fromState(state);
    // Ensure mid is empty and beam can move there
    expect(live.getPieceAt(mid)).toBeUndefined();
    const move = { pieceId: beam.id, to: mid };
    expect(live.canMovePiece(live.getPiece(beam.id)!, mid)).toBe(true);
    expect(moveLosesMaterialOnReply(live, move)).toBe(true);
  });

  it('allows capturing equal-or-better material even if recaptured', () => {
    const engine = new SubspaceLatticeEngine();
    const state = structuredClone(engine.getState());
    state.currentPlayer = PlayerColor.White;
    // White Escort takes Black Escort that is protected — equal trade OK.
    const wEscort = Object.values(state.pieces).find(
      (p) => p.owner === PlayerColor.White && p.type === PieceType.Escort,
    )!;
    const bEscort = Object.values(state.pieces).find(
      (p) => p.owner === PlayerColor.Black && p.type === PieceType.Escort,
    )!;
    const protector = Object.values(state.pieces).find(
      (p) =>
        p.owner === PlayerColor.Black &&
        p.type === PieceType.Escort &&
        p.id !== bEscort.id,
    )!;

    // Place victim at (5,2), white escort at (5,1), protector at (5,3)
    for (const p of [wEscort, bEscort, protector]) {
      const cell = state.cells.find(
        (c) =>
          c.coordinate.x === p.position.x && c.coordinate.y === p.position.y,
      );
      if (cell) cell.pieceId = undefined;
    }
    wEscort.position = { x: 5, y: 1 };
    bEscort.position = { x: 5, y: 2 };
    protector.position = { x: 5, y: 3 };
    for (const p of [wEscort, bEscort, protector]) {
      const cell = state.cells.find(
        (c) =>
          c.coordinate.x === p.position.x && c.coordinate.y === p.position.y,
      )!;
      cell.pieceId = p.id;
    }

    const live = SubspaceLatticeEngine.fromState(state);
    const move = { pieceId: wEscort.id, to: { x: 5, y: 2 } };
    expect(live.getPieceAt(move.to)?.type).toBe(PieceType.Escort);
    expect(moveLosesMaterialOnReply(live, move)).toBe(false);
    expect(moveLeavesHubHanging(live, move)).toBe(false);
  });

  it('heuristic still captures a hanging Command Hub', () => {
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
    const choice = requirePieceAgentMove(ai.chooseMove(live));
    expect(choice.to).toEqual({ x: 5, y: 0 });
  });
});
