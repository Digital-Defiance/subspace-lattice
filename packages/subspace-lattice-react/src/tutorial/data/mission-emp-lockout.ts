import {
  CellType,
  PieceType,
  PlayerColor,
  SubspaceLatticeEngine,
  resolveRulesConfig,
  type GameState,
  type RulesConfig,
} from '@subspace-lattice/core';
import type { TutorialStep } from '../tutorial-types';

/**
 * Short Lockout highlight reel for the advanced manual / Academy Ep.11.
 *
 * White's Hub is parked and EMP is already armed. Black still has one Escort
 * outside the blast — capture that escape hatch, let Black shuffle in vain,
 * then fire Command Overload for Lockout.
 */
export const empLockoutRules: RulesConfig = resolveRulesConfig('hybrid-fleet', {
  empRadius: 2,
  empChargeTarget: 15,
  empBlackoutPlies: 1,
  sectorActivationPly: 10_000,
  firstPlayerRelayCount: 0,
});

export function createEmpLockoutState(): GameState {
  const engine = new SubspaceLatticeEngine({ rules: empLockoutRules });
  const state = engine.getStateCopy();
  for (const c of state.cells) delete c.pieceId;
  state.pieces = {};
  state.currentPlayer = PlayerColor.White;
  state.plyCount = 60;
  state.empCharge = {
    [PlayerColor.White]: 15,
    [PlayerColor.Black]: 0,
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

  // White Hub parked at (4,4); blast r=2 covers the nearby Black ships.
  place('w-ch', PieceType.CommandHub, PlayerColor.White, 4, 4);
  place('w-e1', PieceType.Escort, PlayerColor.White, 8, 7);
  place('b-ch', PieceType.CommandHub, PlayerColor.Black, 4, 5);
  place('b-e1', PieceType.Escort, PlayerColor.Black, 5, 4);
  // Escape hatch outside the blast (Chebyshev 4 from White Hub).
  place('b-e2', PieceType.Escort, PlayerColor.Black, 8, 8);

  return state;
}

export const empLockoutSteps: readonly TutorialStep[] = [
  {
    why: 'EMP is armed, but Black still has an Escort outside the blast. Capture that escape hatch first — keep the Hub parked so charge stays armed.',
    objective: 'Remove the Escort outside the blast',
    playerMove: { pieceId: 'w-e1', to: { x: 8, y: 8 } },
    focusCells: [
      { x: 4, y: 4 },
      { x: 8, y: 7 },
      { x: 8, y: 8 },
    ],
  },
  {
    why: "Black's Hub shuffles but stays inside White's blast radius. The remaining Escort is already in the blast — nowhere left outside.",
    objective: 'Black has no escape',
    seat: PlayerColor.Black,
    playerMove: { pieceId: 'b-ch', to: { x: 3, y: 5 } },
    focusCells: [
      { x: 4, y: 4 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ],
  },
  {
    why: 'Spend the whole turn on Command Overload. Every remaining Black ship sits in the blast — enemy engines seize, zero legal replies, Lockout. Your own fleet is never affected.',
    objective: 'Fire EMP to Lockout',
    success: 'Black has zero legal replies. Lockout (winnerReason=no-moves).',
    playerMove: { type: 'emp' },
    focusCells: [
      { x: 4, y: 4 },
      { x: 3, y: 5 },
      { x: 5, y: 4 },
    ],
  },
];
