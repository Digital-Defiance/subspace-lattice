import {
  CellType,
  type Coordinate,
  type GameState,
  PieceType,
  PlayerColor,
  type RulesConfig,
  SubspaceLatticeEngine,
  resolveRulesConfig,
} from '@subspace-lattice/core';

export interface TutorialMove {
  pieceId: string;
  to: Coordinate;
}

export interface TutorialLesson {
  id: string;
  number: string;
  title: string;
  concept: string;
  explanation: string;
  objective: string;
  success: string;
  rules: RulesConfig;
  createState: () => GameState;
  playerMove: TutorialMove;
  aiMove?: TutorialMove;
  focusCells?: readonly Coordinate[];
  /** When false, Objective HUD shows live clock (fleet lessons). Default paused. */
  hudPaused?: boolean;
}

interface PieceSpec {
  id: string;
  type: PieceType;
  owner: PlayerColor;
  x: number;
  y: number;
}

const teachingRules = resolveRulesConfig('hybrid', {
  // Core lessons should not end accidentally while demonstrating movement.
  sectorIntegrationRatio: 0.45,
  sectorActivationPly: 999,
});

/** Fleet soft-ship knobs with the sector clock disarmed for teaching. */
const fleetTeachingRules = resolveRulesConfig('hybrid-fleet', {
  sectorIntegrationRatio: 0.45,
  sectorActivationPly: 999,
});

/** Fleet defaults with the real activation ply (soft-ship 100) for the clock lesson. */
const clockTeachingRules = resolveRulesConfig('hybrid-fleet', {
  sectorIntegrationRatio: 0.45,
});

function stateWith(
  pieces: PieceSpec[],
  currentPlayer = PlayerColor.White,
  plyCount = 0,
  rules: RulesConfig = teachingRules,
): GameState {
  const engine = new SubspaceLatticeEngine({ rules });
  const state = engine.getStateCopy();

  for (const cell of state.cells) delete cell.pieceId;
  state.pieces = {};
  state.currentPlayer = currentPlayer;
  state.plyCount = plyCount;
  delete state.winner;
  delete state.winnerReason;
  delete state.sectorHoldProgress;

  for (const spec of pieces) {
    const piece = {
      id: spec.id,
      type: spec.type,
      owner: spec.owner,
      position: { x: spec.x, y: spec.y },
    };
    state.pieces[piece.id] = piece;
    const cell = state.cells.find(
      (candidate) =>
        candidate.coordinate.x === spec.x &&
        candidate.coordinate.y === spec.y,
    );
    if (!cell || cell.type === CellType.GravityWell) {
      throw new Error(`Invalid tutorial position for ${spec.id}`);
    }
    cell.pieceId = piece.id;
  }

  return state;
}

function initialState(): GameState {
  return new SubspaceLatticeEngine({ rules: teachingRules }).getStateCopy();
}

const hubs: PieceSpec[] = [
  {
    id: 'w-ch',
    type: PieceType.CommandHub,
    owner: PlayerColor.White,
    x: 1,
    y: 1,
  },
  {
    id: 'b-ch',
    type: PieceType.CommandHub,
    owner: PlayerColor.Black,
    x: 9,
    y: 9,
  },
];

export const TUTORIAL_LESSONS: readonly TutorialLesson[] = [
  {
    id: 'first-orders',
    number: '01',
    title: 'Give your first order',
    concept: 'Selecting and moving',
    explanation:
      'The battle takes place on a grid of squares. White moves, then Black moves. You command the light fleet. Select a ship, then select the square where it should go.',
    objective:
      'Select the highlighted Escort in front of your Hub, then move it one square forward.',
    success:
      'Order confirmed. Escorts move one square up, down, left, or right. The opposing fleet now takes its turn.',
    rules: teachingRules,
    createState: initialState,
    playerMove: { pieceId: 'w-e3', to: { x: 5, y: 2 } },
    aiMove: { pieceId: 'b-e3', to: { x: 5, y: 8 } },
  },
  {
    id: 'command-hub',
    number: '02',
    title: 'Protect the Command Hub',
    concept: 'The primary objective',
    explanation:
      'The crowned ship is your Command Hub: fleet command and signal source in one. It may move one neighboring square in any direction. If the enemy captures it, the battle ends immediately.',
    objective:
      'Move your Command Hub diagonally to the highlighted square.',
    success:
      'The Hub can reposition, but every other ship depends on it. Surgical Strike—capturing the enemy Hub—is the main path to victory.',
    rules: teachingRules,
    createState: initialState,
    playerMove: { pieceId: 'w-ch', to: { x: 4, y: 1 } },
    aiMove: { pieceId: 'b-ch', to: { x: 4, y: 9 } },
    focusCells: [{ x: 5, y: 0 }],
  },
  {
    id: 'sensor-net',
    number: '03',
    title: 'Build the signal',
    concept: 'Escorts and the Sensor Net',
    explanation:
      'The colored area is your Sensor Net. Your Hub always broadcasts. An Escort adds its own short-range coverage only while connected to the Hub through friendly ships no more than two squares apart.',
    objective:
      'Advance the linked Escort. Watch your blue Sensor Net move with it.',
    success:
      'The Escort stayed linked, so it still relays your signal. A separated Escort can move, but it stops extending the net until the chain reconnects.',
    rules: teachingRules,
    createState: initialState,
    playerMove: { pieceId: 'w-e3', to: { x: 5, y: 2 } },
    aiMove: { pieceId: 'b-e3', to: { x: 5, y: 8 } },
  },
  {
    id: 'target-lock',
    number: '04',
    title: 'Survive Target Lock',
    concept: 'Enemy coverage suppresses special movement',
    explanation:
      'Your Infiltrator is inside the red enemy Sensor Net. That means it is Target Locked: its warp system is suppressed, and it may move only one square up, down, left, or right.',
    objective:
      'Move the locked Infiltrator one square left, toward the edge of the red net.',
    success:
      'Target Lock turns every ship into a simple one-step mover. Projecting your net over an enemy can be as powerful as capturing it.',
    rules: teachingRules,
    createState: () =>
      stateWith([
        ...hubs,
        {
          id: 'w-i1',
          type: PieceType.Infiltrator,
          owner: PlayerColor.White,
          x: 7,
          y: 7,
        },
      ]),
    playerMove: { pieceId: 'w-i1', to: { x: 6, y: 7 } },
    focusCells: [{ x: 7, y: 7 }],
  },
  {
    id: 'beam',
    number: '05',
    title: 'Open a Beam lane',
    concept: 'Long-range fire inside friendly coverage',
    explanation:
      'Beams slide any distance in a straight horizontal or vertical line—but every square in the path must be clear and inside your own Sensor Net. Ships and the central Gravity Well block the shot.',
    objective:
      'Fire the Beam along the highlighted lane and capture the enemy Escort.',
    success:
      'Beam fire converts signal coverage into reach. Expand the net first, then use its clear lanes to strike from a distance.',
    rules: teachingRules,
    createState: () =>
      stateWith([
        ...hubs,
        {
          id: 'w-b1',
          type: PieceType.Beam,
          owner: PlayerColor.White,
          x: 1,
          y: 2,
        },
        {
          id: 'b-e1',
          type: PieceType.Escort,
          owner: PlayerColor.Black,
          x: 1,
          y: 4,
        },
      ]),
    playerMove: { pieceId: 'w-b1', to: { x: 1, y: 4 } },
    focusCells: [
      { x: 1, y: 2 },
      { x: 1, y: 3 },
      { x: 1, y: 4 },
    ],
  },
  {
    id: 'infiltrator',
    number: '06',
    title: 'Warp through the gap',
    concept: 'Infiltrators attack where the enemy cannot see',
    explanation:
      'An Infiltrator may warp to any open square outside the enemy Sensor Net. Distance and intervening ships do not matter. It cannot warp into red coverage, and Target Lock disables the warp entirely.',
    objective:
      'Warp the Infiltrator to the highlighted gap beyond the center.',
    success:
      'Infiltrators punish holes in the signal picture. They are most dangerous outside enemy coverage and most vulnerable once discovered.',
    rules: teachingRules,
    createState: () =>
      stateWith([
        ...hubs,
        {
          id: 'w-i1',
          type: PieceType.Infiltrator,
          owner: PlayerColor.White,
          x: 2,
          y: 1,
        },
      ]),
    playerMove: { pieceId: 'w-i1', to: { x: 2, y: 7 } },
    focusCells: [{ x: 5, y: 5 }],
  },
  {
    id: 'capture',
    number: '07',
    title: 'Remove an enemy ship',
    concept: 'Captures and occupied squares',
    explanation:
      'A square may hold only one ship. Move onto an enemy ship’s square to capture and remove it. You may never move onto one of your own ships, and no ship may enter the Gravity Well.',
    objective:
      'Move your Escort onto the highlighted enemy Escort to capture it.',
    success:
      'Enemy ship removed. Captures open lanes, break relay chains, and can expose the Command Hub. Capturing the Hub itself ends the battle immediately.',
    rules: teachingRules,
    createState: () =>
      stateWith([
        ...hubs,
        {
          id: 'w-e1',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 3,
          y: 1,
        },
        {
          id: 'b-e1',
          type: PieceType.Escort,
          owner: PlayerColor.Black,
          x: 4,
          y: 1,
        },
      ]),
    playerMove: { pieceId: 'w-e1', to: { x: 4, y: 1 } },
    focusCells: [
      { x: 3, y: 1 },
      { x: 4, y: 1 },
    ],
  },
  {
    id: 'repair-link',
    number: '08',
    title: 'Repair a broken relay',
    concept: 'Recovering the signal chain',
    explanation:
      'The distant Escort is more than two squares from the connected fleet, so it is dark: it projects no Sensor Net. A relay chain may pass through several friendly ships as long as every gap is two squares or less.',
    objective:
      'Move the isolated Escort one square toward the chain to reconnect it.',
    success:
      'Signal restored. The Escort’s blue coverage is active again. Breaking an enemy relay can collapse distant coverage without capturing every ship in the chain.',
    rules: teachingRules,
    createState: () =>
      stateWith([
        ...hubs,
        {
          id: 'w-e1',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 3,
          y: 1,
        },
        {
          id: 'w-e2',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 5,
          y: 1,
        },
        {
          id: 'w-e3',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 8,
          y: 1,
        },
      ]),
    playerMove: { pieceId: 'w-e3', to: { x: 7, y: 1 } },
    focusCells: [
      { x: 3, y: 1 },
      { x: 5, y: 1 },
      { x: 8, y: 1 },
    ],
  },
  {
    id: 'contested-space',
    number: '09',
    title: 'Contest the lattice',
    concept: 'Overlapping nets cancel for scoring',
    explanation:
      'Under fleet rules, a square covered by both Sensor Nets is Contested Space: it counts for neither fleet’s Sector Integration coverage. Pushing your blue net into red territory stalls their clock—and can stall yours. Watch the coverage bars as you move.',
    objective:
      'Advance the highlighted Escort into the overlap zone to deepen the contest.',
    success:
      'Contested cells (purple on the board) deny both sides credit. Use that to break an enemy hold without capturing every ship in their chain.',
    rules: fleetTeachingRules,
    createState: () =>
      stateWith(
        [
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
            y: 1,
          },
          {
            id: 'w-e2',
            type: PieceType.Escort,
            owner: PlayerColor.White,
            x: 5,
            y: 3,
          },
          {
            id: 'w-e3',
            type: PieceType.Escort,
            owner: PlayerColor.White,
            x: 4,
            y: 3,
          },
          {
            id: 'w-e4',
            type: PieceType.Escort,
            owner: PlayerColor.White,
            x: 6,
            y: 3,
          },
          {
            id: 'b-ch',
            type: PieceType.CommandHub,
            owner: PlayerColor.Black,
            x: 5,
            y: 6,
          },
          {
            id: 'b-e1',
            type: PieceType.Escort,
            owner: PlayerColor.Black,
            x: 5,
            y: 7,
          },
          {
            id: 'b-e2',
            type: PieceType.Escort,
            owner: PlayerColor.Black,
            x: 4,
            y: 6,
          },
          {
            id: 'b-e3',
            type: PieceType.Escort,
            owner: PlayerColor.Black,
            x: 6,
            y: 6,
          },
        ],
        PlayerColor.White,
        0,
        fleetTeachingRules,
      ),
    playerMove: { pieceId: 'w-e2', to: { x: 5, y: 4 } },
    focusCells: [
      { x: 5, y: 3 },
      { x: 5, y: 4 },
    ],
  },
  {
    id: 'sector-clock',
    number: '10',
    title: 'The sector clock',
    concept: 'Activation and Integration Hold',
    explanation:
      'Under hybrid-fleet, Sector Integration does not win from move one. The clock arms after many plies (soft-ship: 100). Once armed, coverage at or above 45% must hold for one full ply—Contested Space can break a streak. The training board is already past activation so the HUD reads ACTIVE.',
    objective:
      'Advance the highlighted Escort while the sector clock is armed. Watch coverage and hold on the HUD.',
    success:
      'When only one fleet keeps coverage above the marker long enough, Sector Integration ends the battle. Until then, Surgical Strike and breaking the enemy’s hold remain the sharper tools.',
    rules: clockTeachingRules,
    hudPaused: false,
    createState: () => {
      const state = stateWith(
        [
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
            y: 1,
          },
          {
            id: 'w-e2',
            type: PieceType.Escort,
            owner: PlayerColor.White,
            x: 5,
            y: 3,
          },
          {
            id: 'w-e3',
            type: PieceType.Escort,
            owner: PlayerColor.White,
            x: 4,
            y: 3,
          },
          {
            id: 'w-e4',
            type: PieceType.Escort,
            owner: PlayerColor.White,
            x: 6,
            y: 3,
          },
          {
            id: 'b-ch',
            type: PieceType.CommandHub,
            owner: PlayerColor.Black,
            x: 5,
            y: 6,
          },
          {
            id: 'b-e1',
            type: PieceType.Escort,
            owner: PlayerColor.Black,
            x: 5,
            y: 7,
          },
          {
            id: 'b-e2',
            type: PieceType.Escort,
            owner: PlayerColor.Black,
            x: 4,
            y: 6,
          },
          {
            id: 'b-e3',
            type: PieceType.Escort,
            owner: PlayerColor.Black,
            x: 6,
            y: 6,
          },
        ],
        PlayerColor.White,
        105,
        clockTeachingRules,
      );
      state.sectorHoldProgress = {
        [PlayerColor.White]: 0,
        [PlayerColor.Black]: 0,
      };
      return state;
    },
    playerMove: { pieceId: 'w-e4', to: { x: 6, y: 4 } },
    focusCells: [
      { x: 6, y: 3 },
      { x: 6, y: 4 },
    ],
  },
] as const;

export function createTutorialEngine(
  lesson: TutorialLesson,
): SubspaceLatticeEngine {
  return SubspaceLatticeEngine.fromState(lesson.createState(), lesson.rules);
}
