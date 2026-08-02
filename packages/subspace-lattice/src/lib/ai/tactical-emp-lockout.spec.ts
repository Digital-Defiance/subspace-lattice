import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from '../game-engine';
import { PlayerColor } from '../interfaces';
import {
  engineFromGolden,
  terminalLockoutInRange,
  TERMINAL_GOLDEN_RULES,
} from '../sim/terminal-goldens';
import { CellType } from '../interfaces/cellType';
import { PieceType } from '../interfaces/pieceType';
import {
  filterMovesAvoidingHubMate,
  moveLeavesEmpLockout,
} from './tactical';

describe('EMP Lockout reply filter', () => {
  it('does not flag our own winning Lockout EMP', () => {
    const live = engineFromGolden(terminalLockoutInRange());
    expect(moveLeavesEmpLockout(live, { type: 'emp' })).toBe(false);
  });

  it('flags hub shuffles that leave opponent an immediate Lockout EMP', () => {
    // Mirror of terminal-lockout-in-range with sides flipped: Black is armed
    // and in range; White to move can step out or stay in the blast.
    const engine = new SubspaceLatticeEngine({ rules: TERMINAL_GOLDEN_RULES });
    const state = engine.getStateCopy();
    for (const c of state.cells) delete c.pieceId;
    state.pieces = {};
    state.currentPlayer = PlayerColor.White;
    state.plyCount = 40;
    state.terminalPhaseArmed = true;
    state.terminalPhaseArmedAtPly = 40;
    state.empCharge = {
      [PlayerColor.White]: 0,
      [PlayerColor.Black]: 3,
    };
    delete state.winner;
    delete state.winnerReason;
    delete state.empActive;

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
    // Black Hub at (4,7), White Hub at (4,4): Chebyshev 3 = in radius 3.
    // Step to (4,3) → dist 4 (escape). Step to (3,4) → dist 3 (still locked).
    // Avoid (5,5) Gravity Well.
    place('w-ch', PieceType.CommandHub, PlayerColor.White, 4, 4);
    place('b-ch', PieceType.CommandHub, PlayerColor.Black, 4, 7);

    const live = SubspaceLatticeEngine.fromState(state, TERMINAL_GOLDEN_RULES);
    const stay = { pieceId: 'w-ch', to: { x: 3, y: 4 } };
    const escape = { pieceId: 'w-ch', to: { x: 4, y: 3 } };
    expect(live.canMovePiece(live.getPiece('w-ch')!, stay.to)).toBe(true);
    expect(live.canMovePiece(live.getPiece('w-ch')!, escape.to)).toBe(true);
    expect(moveLeavesEmpLockout(live, stay)).toBe(true);
    expect(moveLeavesEmpLockout(live, escape)).toBe(false);

    const filtered = filterMovesAvoidingHubMate(live, [stay, escape]);
    expect(filtered).toEqual([escape]);
  });
});
