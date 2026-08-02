import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from '../game-engine';
import { CellType } from '../interfaces/cellType';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { resolveRulesConfig } from '../rules/rules-config';
import { evaluatePosition } from './evaluate';

const rules = resolveRulesConfig('hybrid-fleet');

function bareBoard(): SubspaceLatticeEngine {
  const engine = new SubspaceLatticeEngine({ rules });
  const state = engine.getStateCopy();
  for (const c of state.cells) delete c.pieceId;
  state.pieces = {};
  state.currentPlayer = PlayerColor.Black;
  state.plyCount = 60;
  delete state.winner;
  delete state.winnerReason;
  delete state.empActive;
  state.empCharge = {
    [PlayerColor.White]: 0,
    [PlayerColor.Black]: 0,
  };

  const place = (
    id: string,
    type: PieceType,
    owner: PlayerColor,
    x: number,
    y: number,
  ) => {
    state.pieces[id] = { id, type, owner, position: { x, y } };
    const cell = state.cells.find(
      (c) => c.coordinate.x === x && c.coordinate.y === y,
    );
    if (!cell || cell.type === CellType.GravityWell) {
      throw new Error(`bad cell ${x},${y}`);
    }
    cell.pieceId = id;
  };

  // Black Hub at (5,9); White Escort adjacent able to capture; Black Escort
  // can step in the way / Hub can step aside.
  place('b-ch', PieceType.CommandHub, PlayerColor.Black, 5, 9);
  place('w-ch', PieceType.CommandHub, PlayerColor.White, 5, 1);
  place('w-e1', PieceType.Escort, PlayerColor.White, 5, 8);
  place('b-e1', PieceType.Escort, PlayerColor.Black, 3, 9);

  return SubspaceLatticeEngine.fromState(state, rules);
}

describe('evaluate hub defense', () => {
  it('scores a hanging own Hub far worse than a safe Hub', () => {
    const hanging = bareBoard();
    expect(
      hanging.canMovePiece(hanging.getPiece('w-e1')!, { x: 5, y: 9 }),
    ).toBe(true);

    const safeState = hanging.getStateCopy();
    // Move White Escort away so Hub is no longer en prise.
    const escort = safeState.pieces['w-e1']!;
    const from = safeState.cells.find(
      (c) => c.coordinate.x === 5 && c.coordinate.y === 8,
    )!;
    const to = safeState.cells.find(
      (c) => c.coordinate.x === 8 && c.coordinate.y === 5,
    )!;
    delete from.pieceId;
    escort.position = { x: 8, y: 5 };
    to.pieceId = 'w-e1';
    const safe = SubspaceLatticeEngine.fromState(safeState, rules);

    const hangScore = evaluatePosition(hanging, PlayerColor.Black);
    const safeScore = evaluatePosition(safe, PlayerColor.Black);
    expect(safeScore - hangScore).toBeGreaterThan(5000);
  });

  it('penalizes enemy Infiltrator closing on our Hub before en-prise', () => {
    const far = bareBoard();
    const closeState = far.getStateCopy();
    // Relocate White Escort far; place Infiltrator approaching Hub.
    const escort = closeState.pieces['w-e1']!;
    const from = closeState.cells.find(
      (c) =>
        c.coordinate.x === escort.position.x &&
        c.coordinate.y === escort.position.y,
    )!;
    delete from.pieceId;
    delete closeState.pieces['w-e1'];

    closeState.pieces['w-i1'] = {
      id: 'w-i1',
      type: PieceType.Infiltrator,
      owner: PlayerColor.White,
      position: { x: 5, y: 6 },
    };
    const cell = closeState.cells.find(
      (c) => c.coordinate.x === 5 && c.coordinate.y === 6,
    )!;
    cell.pieceId = 'w-i1';

    const close = SubspaceLatticeEngine.fromState(closeState, rules);
    // Far: only White Hub on board for pressure (Escort removed).
    const farScore = evaluatePosition(far, PlayerColor.Black);
    // Rebuild far without the adjacent Escort for a fair geometric compare.
    const onlyFarState = far.getStateCopy();
    const e = onlyFarState.pieces['w-e1']!;
    const eCell = onlyFarState.cells.find(
      (c) =>
        c.coordinate.x === e.position.x && c.coordinate.y === e.position.y,
    )!;
    delete eCell.pieceId;
    delete onlyFarState.pieces['w-e1'];
    const onlyFar = SubspaceLatticeEngine.fromState(onlyFarState, rules);

    const closeScore = evaluatePosition(close, PlayerColor.Black);
    const baseline = evaluatePosition(onlyFar, PlayerColor.Black);
    expect(baseline - closeScore).toBeGreaterThan(20);
    expect(farScore).toBeTypeOf('number');
  });
});
