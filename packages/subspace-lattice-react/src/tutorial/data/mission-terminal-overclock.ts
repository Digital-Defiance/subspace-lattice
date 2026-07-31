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
 * Mission 5 — Terminal Overclock highlight reel (advanced manual / academy).
 *
 * Premise: Black’s lone Hub cowardly kites outside White’s blast. White’s Hub
 * moves charge EMP (Terminal). Shared radiation grows +1 every 3 plies (tight
 * teaching interval; shipping default is 5). When r expands from 3→4, the
 * kite fails — fire for Lockout (own drives fuse).
 */
export const terminalOverclockRules: RulesConfig = resolveRulesConfig(
  'hybrid-fleet',
  {
    empRadius: 3,
    empChargeTarget: 15,
    terminalOverclock: true,
    terminalRequiresBothLone: true,
    terminalSharedPhaseClock: true,
    terminalPhaseEntryKomi: 0,
    terminalEmpChargeTarget: 3,
    terminalEmpRadiusGrowthInterval: 3,
    terminalEmpRadiusMax: 10,
    sectorActivationPly: 10_000,
    firstPlayerRelayCount: 0,
  },
);

export function createTerminalOverclockState(): GameState {
  const engine = new SubspaceLatticeEngine({ rules: terminalOverclockRules });
  const state = engine.getStateCopy();
  for (const c of state.cells) delete c.pieceId;
  state.pieces = {};
  state.currentPlayer = PlayerColor.White;
  state.plyCount = 40;
  state.empCharge = {
    [PlayerColor.White]: 0,
    [PlayerColor.Black]: 0,
  };
  delete state.winner;
  delete state.winnerReason;
  delete state.empActive;
  delete state.terminalPhaseArmed;
  delete state.terminalPhaseArmedAtPly;

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

  // Dist 4: outside base Terminal blast r=3. Black can kite; White must wait
  // for thermal runaway (this reel teaches the growth finish).
  place('w-ch', PieceType.CommandHub, PlayerColor.White, 2, 2);
  place('b-ch', PieceType.CommandHub, PlayerColor.Black, 2, 6);

  return state;
}

export const terminalOverclockSteps: readonly TutorialStep[] = [
  {
    why:
      'Both fleets are lone Hubs — Terminal Overclock is live. Blast starts at ' +
      'r=3; Black sits at Chebyshev 4, safely outside. White’s Hub moves to ' +
      'charge EMP (no escorts left to charge for you).',
    objective: 'Charge Terminal EMP (Hub move)',
    playerMove: { pieceId: 'w-ch', to: { x: 1, y: 2 } },
    focusCells: [
      { x: 2, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 6 },
    ],
  },
  {
    why:
      'Black refuses contact — the coward slides sideways, still outside the ' +
      'r=3 blast. Radiation age ticks; sensors already read the spike.',
    objective: 'Black kites outside r=3',
    seat: PlayerColor.Black,
    playerMove: { pieceId: 'b-ch', to: { x: 1, y: 6 } },
    focusCells: [
      { x: 1, y: 2 },
      { x: 2, y: 6 },
      { x: 1, y: 6 },
    ],
  },
  {
    why:
      'Another Hub step banks charge. After this ply shared age reaches 3: ' +
      'thermal runaway expands the blast from r=3 to r=4. Black is now at the ' +
      'edge of the shockwave — the static kite is dying.',
    objective: 'Charge as radiation blooms to r=4',
    playerMove: { pieceId: 'w-ch', to: { x: 0, y: 2 } },
    focusCells: [
      { x: 1, y: 2 },
      { x: 0, y: 2 },
      { x: 1, y: 6 },
    ],
  },
  {
    why:
      'Black still plays the old geometry — shuffles but stays at distance 4, ' +
      'as if r=3 were forever. The ambient field has already outgrown that lie.',
    objective: 'Black’s empty kite at the new edge',
    seat: PlayerColor.Black,
    playerMove: { pieceId: 'b-ch', to: { x: 2, y: 6 } },
    focusCells: [
      { x: 0, y: 2 },
      { x: 1, y: 6 },
      { x: 2, y: 6 },
    ],
  },
  {
    why:
      'Third Hub move arms Terminal EMP (3/3). Blast is r=4; Black remains at ' +
      'distance 4 — inside the grown radius. Firing earlier at r=3 would have missed.',
    objective: 'Arm EMP inside the expanded blast',
    playerMove: { pieceId: 'w-ch', to: { x: 1, y: 2 } },
    focusCells: [
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 6 },
    ],
  },
  {
    why:
      'One last coward step. Nowhere left that r=4 does not reach from White’s Hub.',
    objective: 'Black’s last empty kite',
    seat: PlayerColor.Black,
    playerMove: { pieceId: 'b-ch', to: { x: 3, y: 6 } },
    focusCells: [
      { x: 1, y: 2 },
      { x: 2, y: 6 },
      { x: 3, y: 6 },
    ],
  },
  {
    why:
      'Fire Terminal Overclock. Enemy Hub sits in the expanded blast; engines ' +
      'seize for zero replies. White’s own drives fuse — Lockout still awards ' +
      'the firer. There was nowhere left to hide.',
    objective: 'Fire Terminal EMP — Lockout',
    success:
      'White wins by Lockout. Terminal fire fused White’s Hub; Black had zero ' +
      'replies inside the grown blast (winnerReason=no-moves).',
    playerMove: { type: 'emp' },
    focusCells: [
      { x: 1, y: 2 },
      { x: 3, y: 6 },
    ],
  },
];
