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
 * Short Atlas-derived highlight reels for Academy Ep.12
 * (Overture · Trojan · Rolling Storm). Positions match fleet drills /
 * playbook goldens — not one continuous game.
 */

const midRules: RulesConfig = resolveRulesConfig('hybrid-fleet', {
  sectorActivationPly: 999,
  firstPlayerRelayCount: 1,
});

function bareState(
  pieces: Array<{
    id: string;
    type: PieceType;
    owner: PlayerColor;
    x: number;
    y: number;
  }>,
  plyCount: number,
  rules: RulesConfig = midRules,
): GameState {
  const engine = new SubspaceLatticeEngine({ rules });
  const state = engine.getStateCopy();
  for (const c of state.cells) delete c.pieceId;
  state.pieces = {};
  state.currentPlayer = PlayerColor.White;
  state.plyCount = plyCount;
  delete state.winner;
  delete state.winnerReason;
  delete state.empActive;
  delete state.sectorHoldProgress;
  state.empCharge = {
    [PlayerColor.White]: 0,
    [PlayerColor.Black]: 0,
  };
  for (const p of pieces) {
    state.pieces[p.id] = {
      id: p.id,
      type: p.type,
      owner: p.owner,
      position: { x: p.x, y: p.y },
    };
    const cell = state.cells.find(
      (c) => c.coordinate.x === p.x && c.coordinate.y === p.y,
    );
    if (!cell || cell.type === CellType.GravityWell) {
      throw new Error(`bad cell ${p.x},${p.y}`);
    }
    cell.pieceId = p.id;
  }
  return state;
}

/** Chapter A — principal Infiltrator Overture (Deep-leaf / playbook). */
export const overtureRules = resolveRulesConfig('hybrid-fleet');

export function createOvertureState(): GameState {
  return new SubspaceLatticeEngine({ rules: overtureRules }).getStateCopy();
}

export const overtureSteps: readonly TutorialStep[] = [
  {
    why: 'Deep-leaf principal try: right-wing Infiltrator into the central hop (5,4).',
    objective: 'White opens with right Infiltrator → (5,4)',
    playerMove: { pieceId: 'w-i2', to: { x: 5, y: 4 } },
    focusCells: [
      { x: 7, y: 0 },
      { x: 5, y: 4 },
    ],
  },
  {
    why: 'Knight-war main line: Black’s best Infiltrator answer into (6,7). Beam and Escort replies are close equals in the band.',
    objective: 'Black answers Infiltrator → (6,7)',
    seat: PlayerColor.Black,
    playerMove: { pieceId: 'b-i2', to: { x: 6, y: 7 } },
    focusCells: [
      { x: 7, y: 10 },
      { x: 6, y: 7 },
    ],
  },
];

/** Trap: hanging on (4,6) lets Black capture on that square. */
export function createOvertureTrapState(): GameState {
  return new SubspaceLatticeEngine({ rules: overtureRules }).getStateCopy();
}

export const overtureTrapSteps: readonly TutorialStep[] = [
  {
    why: 'Demoted try: landing on (4,6) hangs to a Black Infiltrator capture.',
    objective: 'White hops onto the hanging square (4,6)',
    playerMove: { pieceId: 'w-i2', to: { x: 4, y: 6 } },
    focusCells: [
      { x: 7, y: 0 },
      { x: 4, y: 6 },
    ],
  },
  {
    why: 'Black folds onto (4,6) and removes the hung Infiltrator.',
    objective: 'Black captures on (4,6)',
    seat: PlayerColor.Black,
    playerMove: { pieceId: 'b-i1', to: { x: 4, y: 6 } },
    focusCells: [
      { x: 3, y: 10 },
      { x: 4, y: 6 },
    ],
  },
];

const fringeScreen = [
  {
    id: 'w-ch',
    type: PieceType.CommandHub,
    owner: PlayerColor.White,
    x: 5,
    y: 0,
  },
  {
    id: 'w-e1',
    type: PieceType.Escort,
    owner: PlayerColor.White,
    x: 5,
    y: 2,
  },
  {
    id: 'w-e2',
    type: PieceType.Escort,
    owner: PlayerColor.White,
    x: 6,
    y: 2,
  },
  {
    id: 'w-e3',
    type: PieceType.Escort,
    owner: PlayerColor.White,
    x: 6,
    y: 3,
  },
  {
    id: 'b-i1',
    type: PieceType.Infiltrator,
    owner: PlayerColor.Black,
    x: 6,
    y: 5,
  },
  {
    id: 'b-ch',
    type: PieceType.CommandHub,
    owner: PlayerColor.Black,
    x: 0,
    y: 10,
  },
] as const;

/** Chapter B — refuse the fringe Trojan (drill-refuse-fringe-infiltrator). */
export const refuseFringeRules = midRules;

export function createRefuseFringeState(): GameState {
  return bareState([...fringeScreen], 24);
}

export const refuseFringeSteps: readonly TutorialStep[] = [
  {
    why: 'Black’s Infiltrator sits just outside the tip. Expand sideways — do not paint the file.',
    objective: 'Tip Escort steps to (7,3)',
    playerMove: { pieceId: 'w-e3', to: { x: 7, y: 3 } },
    focusCells: [
      { x: 6, y: 3 },
      { x: 7, y: 3 },
      { x: 6, y: 5 },
    ],
  },
];

/** Fail reel: tip expands onto the parasite and loses the Escort. */
export function createTrojanPayoffState(): GameState {
  return bareState([...fringeScreen], 24);
}

export const trojanPayoffSteps: readonly TutorialStep[] = [
  {
    why: 'Tip steps onto the Infiltrator’s file — Target Lock activates the crawl.',
    objective: 'Tip Escort advances to (6,4)',
    playerMove: { pieceId: 'w-e3', to: { x: 6, y: 4 } },
    focusCells: [
      { x: 6, y: 3 },
      { x: 6, y: 4 },
      { x: 6, y: 5 },
    ],
  },
  {
    why: 'Activated Infiltrator takes the tip that painted them.',
    objective: 'Black Infiltrator captures on (6,4)',
    seat: PlayerColor.Black,
    playerMove: { pieceId: 'b-i1', to: { x: 6, y: 4 } },
    focusCells: [
      { x: 6, y: 5 },
      { x: 6, y: 4 },
    ],
  },
];

/** Chapter C — Rolling Storm (drill-rolling-storm). */
export const rollingStormRules = midRules;

export function createRollingStormState(): GameState {
  return bareState(
    [
      {
        id: 'w-ch',
        type: PieceType.CommandHub,
        owner: PlayerColor.White,
        x: 2,
        y: 2,
      },
      {
        id: 'w-e1',
        type: PieceType.Escort,
        owner: PlayerColor.White,
        x: 2,
        y: 5,
      },
      {
        id: 'b-ch',
        type: PieceType.CommandHub,
        owner: PlayerColor.Black,
        x: 10,
        y: 10,
      },
    ],
    40,
  );
}

export const rollingStormSteps: readonly TutorialStep[] = [
  {
    why: 'Dark tip paints nothing. One Hub king-step moves the r=3 Sensor disk.',
    objective: 'Command Hub steps to (3,3)',
    playerMove: { pieceId: 'w-ch', to: { x: 3, y: 3 } },
    focusCells: [
      { x: 2, y: 2 },
      { x: 3, y: 3 },
      { x: 2, y: 5 },
    ],
  },
];

/** Twin fail mode: Hub bait grab (drill-hold-the-hub correct line for contrast). */
export function createHoldTheHubState(): GameState {
  return bareState(
    [
      {
        id: 'w-ch',
        type: PieceType.CommandHub,
        owner: PlayerColor.White,
        x: 4,
        y: 4,
      },
      {
        id: 'w-e1',
        type: PieceType.Escort,
        owner: PlayerColor.White,
        x: 4,
        y: 6,
      },
      {
        id: 'b-e1',
        type: PieceType.Escort,
        owner: PlayerColor.Black,
        x: 4,
        y: 5,
      },
      {
        id: 'b-ch',
        type: PieceType.CommandHub,
        owner: PlayerColor.Black,
        x: 9,
        y: 9,
      },
    ],
    40,
  );
}

export const holdTheHubSteps: readonly TutorialStep[] = [
  {
    why: 'Hub could snatch — leave it. Escort does the capture; charge and Strike race stay clean.',
    objective: 'Escort captures on (4,5)',
    playerMove: { pieceId: 'w-e1', to: { x: 4, y: 5 } },
    focusCells: [
      { x: 4, y: 6 },
      { x: 4, y: 5 },
      { x: 4, y: 4 },
    ],
  },
];
