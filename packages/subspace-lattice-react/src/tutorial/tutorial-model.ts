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
import {
  buildClockFinishMission,
  buildStandardBattleMission,
} from './guided-missions';
import type { TutorialLesson, TutorialMove } from './tutorial-types';

export type { TutorialLesson, TutorialMove, TutorialStep } from './tutorial-types';


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

function drill(
  partial: Omit<TutorialLesson, 'steps'> & {
    playerMove: TutorialMove;
    aiMove?: TutorialMove;
    focusCells?: readonly Coordinate[];
    objective: string;
  },
): TutorialLesson {
  const { playerMove, aiMove, focusCells, objective, ...rest } = partial;
  return {
    ...rest,
    steps: [
      {
        why: partial.explanation,
        objective,
        playerMove,
        aiMove,
        focusCells,
      },
    ],
  };
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

export const TUTORIAL_DRILLS: readonly TutorialLesson[] = [
  drill({
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
  }),
  drill({
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
  }),
  drill({
    id: 'sensor-net',
    number: '03',
    title: 'Build the signal',
    concept: 'Escorts and the Sensor Net',
    explanation:
      'The colored area is your Sensor Net. Your Hub always broadcasts a wide field. Escorts add a short-range ring only while linked to the Hub through friendly ships no more than two squares apart—so a forward Escort can push coverage past the Hub’s own reach.',
    objective:
      'Advance the forward Escort one square. Watch the blue fringe grow ahead of it.',
    success:
      'That new row of blue came from the Escort, not the Hub. Stay linked and the relay keeps working; break the chain and a distant Escort stops extending the net.',
    rules: teachingRules,
    // Hub r=3 already covers any Escort sitting next to it. Use a short link
    // chain so this advance visibly expands coverage past the Hub blob.
    createState: () =>
      stateWith([
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
          id: 'w-e3',
          type: PieceType.Escort,
          owner: PlayerColor.White,
          x: 5,
          y: 3,
        },
        {
          id: 'b-ch',
          type: PieceType.CommandHub,
          owner: PlayerColor.Black,
          x: 5,
          y: 10,
        },
        {
          id: 'b-e3',
          type: PieceType.Escort,
          owner: PlayerColor.Black,
          x: 5,
          y: 9,
        },
      ]),
    playerMove: { pieceId: 'w-e3', to: { x: 5, y: 4 } },
    aiMove: { pieceId: 'b-e3', to: { x: 5, y: 8 } },
    focusCells: [
      { x: 5, y: 3 },
      { x: 5, y: 4 },
      { x: 5, y: 5 },
    ],
  }),
  drill({
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
  }),
  drill({
    id: 'beam',
    number: '05',
    title: 'Open a Beam lane',
    concept: 'Long-range fire inside friendly coverage',
    explanation:
      'Beams slide any distance in a straight horizontal or vertical line—but every square in the path must be clear and inside your own Sensor Net. Ships and the central Gravity Well block the shot. Think of a rook that can only travel inside the blue glow.',
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
  }),
  drill({
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
  }),
  drill({
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
  }),
  drill({
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
  }),
  drill({
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
  }),
  drill({
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
  }),

  // --- Expansion: how wins feel, Beam liberation, hub safety, seats ---
  {
    id: 'free-the-beam',
    number: '11',
    title: 'Free the Beam',
    concept: 'Why the rook feels trapped',
    explanation:
      'Your Beam is the long-range ship (rook-like). It can only travel inside your blue Sensor Net. Early on that glow is a small box around the Hub—so the Beam feels stuck until Escorts push the signal forward.',
    success:
      'That is the Beam’s whole job: escorts expand the net, then the Beam fires down the new lane. Never expect a Beam to roam the empty board like a chess rook.',
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
            id: 'w-b1',
            type: PieceType.Beam,
            owner: PlayerColor.White,
            x: 2,
            y: 0,
          },
          {
            id: 'w-e1',
            type: PieceType.Escort,
            owner: PlayerColor.White,
            x: 4,
            y: 1,
          },
          {
            id: 'w-e2',
            type: PieceType.Escort,
            owner: PlayerColor.White,
            x: 3,
            y: 2,
          },
          {
            id: 'b-ch',
            type: PieceType.CommandHub,
            owner: PlayerColor.Black,
            x: 9,
            y: 9,
          },
          {
            id: 'b-e1',
            type: PieceType.Escort,
            owner: PlayerColor.Black,
            x: 8,
            y: 8,
          },
          {
            id: 'b-prey',
            type: PieceType.Escort,
            owner: PlayerColor.Black,
            x: 2,
            y: 4,
          },
        ],
        PlayerColor.White,
        0,
        fleetTeachingRules,
      ),
    steps: [
      {
        why: 'The enemy Escort on the Beam’s file sits just outside your net. The Beam cannot reach it yet—the lane dies where the blue glow ends. Push a linked Escort forward to extend coverage beside the file (not onto it, or you block your own shot).',
        objective:
          'Advance the highlighted Escort to expand the Sensor Net beside the Beam’s lane.',
        success:
          'Net extended. Watch the blue glow reach the enemy Escort’s square.',
        playerMove: { pieceId: 'w-e2', to: { x: 3, y: 3 } },
        aiMove: { pieceId: 'b-e1', to: { x: 8, y: 7 } },
        focusCells: [
          { x: 2, y: 0 },
          { x: 2, y: 4 },
          { x: 3, y: 2 },
          { x: 3, y: 3 },
        ],
      },
      {
        why: 'Now every square from the Beam to the target sits inside your net and the path is clear. This is how Beams leave their “little box”: escorts first, then the shot.',
        objective:
          'Fire the Beam up the file and capture the enemy Escort.',
        playerMove: { pieceId: 'w-b1', to: { x: 2, y: 4 } },
        focusCells: [
          { x: 2, y: 0 },
          { x: 2, y: 1 },
          { x: 2, y: 2 },
          { x: 2, y: 3 },
          { x: 2, y: 4 },
        ],
      },
    ],
  },
  {
    id: 'hub-safety',
    number: '12',
    title: 'Do not hang the Hub',
    concept: 'Avoiding Surgical Strike against yourself',
    explanation:
      'Most losses for new captains are not clever traps—they are one-ply disasters. If an enemy ship can step onto your Command Hub next turn, you must capture that threat or move the Hub. Material bait elsewhere is how you walk into death.',
    success:
      'Hub secured. Before every “free” capture, ask: can they take my Hub on the reply? If yes, ignore the bait.',
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
            id: 'b-e1',
            type: PieceType.Escort,
            owner: PlayerColor.Black,
            x: 5,
            y: 1,
          },
          {
            id: 'w-e1',
            type: PieceType.Escort,
            owner: PlayerColor.White,
            x: 4,
            y: 1,
          },
          {
            id: 'w-e2',
            type: PieceType.Escort,
            owner: PlayerColor.White,
            x: 8,
            y: 2,
          },
          {
            id: 'b-b1',
            type: PieceType.Beam,
            owner: PlayerColor.Black,
            x: 8,
            y: 3,
          },
          {
            id: 'b-ch',
            type: PieceType.CommandHub,
            owner: PlayerColor.Black,
            x: 10,
            y: 10,
          },
        ],
        PlayerColor.White,
        0,
        fleetTeachingRules,
      ),
    steps: [
      {
        why: 'Black’s Escort sits on your Hub. Taking the distant Beam looks greedy and loses immediately. Capture the threat (or flee with the Hub)—never the bait.',
        objective:
          'Capture the Escort threatening your Command Hub. Do not take the hanging Beam.',
        playerMove: { pieceId: 'w-e1', to: { x: 5, y: 1 } },
        focusCells: [
          { x: 5, y: 0 },
          { x: 5, y: 1 },
          { x: 8, y: 3 },
        ],
      },
    ],
  },
  {
    id: 'surgical-strike',
    number: '13',
    title: 'Deliver Surgical Strike',
    concept: 'How most battles actually end',
    explanation:
      'Sector Integration is a late clock. The main win is Surgical Strike: land on the enemy Command Hub. It ends the battle the instant it happens—no hold, no percentage.',
    success:
      'Victory. Hunt the Hub, keep yours alive, and use the net as a weapon—not as a painting contest.',
    rules: fleetTeachingRules,
    createState: () =>
      stateWith(
        [
          {
            id: 'w-ch',
            type: PieceType.CommandHub,
            owner: PlayerColor.White,
            x: 0,
            y: 0,
          },
          {
            id: 'w-e1',
            type: PieceType.Escort,
            owner: PlayerColor.White,
            x: 5,
            y: 9,
          },
          {
            id: 'b-ch',
            type: PieceType.CommandHub,
            owner: PlayerColor.Black,
            x: 5,
            y: 10,
          },
        ],
        PlayerColor.White,
        0,
        fleetTeachingRules,
      ),
    steps: [
      {
        why: 'Their Hub is adjacent and undefended. One Escort step ends the match. This is the payoff every opening maneuver is aiming toward.',
        objective: 'Capture the enemy Command Hub with your Escort.',
        playerMove: { pieceId: 'w-e1', to: { x: 5, y: 10 } },
        focusCells: [
          { x: 5, y: 9 },
          { x: 5, y: 10 },
        ],
      },
    ],
  },
  {
    id: 'command-exercise',
    number: '14',
    title: 'Command exercise',
    concept: 'A short guided battle',
    explanation:
      'White moves first. Under fleet rules White also opens with an Initiative Relay Escort already advanced—tempo compensation for going first. You will expand the net, free a Beam, refuse a Hub hang, and finish with Surgical Strike. Each order explains why.',
    success:
      'Command exercise complete. You expanded coverage, liberated a Beam, protected the Hub, and struck theirs. That loop—net, safety, strike—is how real matches feel.',
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
            id: 'w-b1',
            type: PieceType.Beam,
            owner: PlayerColor.White,
            x: 2,
            y: 0,
          },
          {
            id: 'w-e1',
            type: PieceType.Escort,
            owner: PlayerColor.White,
            x: 4,
            y: 1,
          },
          {
            id: 'w-e2',
            type: PieceType.Escort,
            owner: PlayerColor.White,
            x: 3,
            y: 2,
          },
          {
            id: 'w-e3',
            type: PieceType.Escort,
            owner: PlayerColor.White,
            x: 5,
            y: 3,
          },
          {
            id: 'b-ch',
            type: PieceType.CommandHub,
            owner: PlayerColor.Black,
            x: 2,
            y: 4,
          },
          {
            id: 'b-e1',
            type: PieceType.Escort,
            owner: PlayerColor.Black,
            x: 8,
            y: 8,
          },
          {
            id: 'b-threat',
            type: PieceType.Escort,
            owner: PlayerColor.Black,
            x: 6,
            y: 1,
          },
        ],
        PlayerColor.White,
        0,
        fleetTeachingRules,
      ),
    steps: [
      {
        why: 'White’s forward Escort at midboard is the Initiative Relay—your opening foothold. First job: push coverage so the Beam can matter.',
        objective: 'Advance the relay Escort one step deeper into the sector.',
        success: 'Foothold kept. Next, open the Beam’s file.',
        playerMove: { pieceId: 'w-e3', to: { x: 5, y: 4 } },
        aiMove: { pieceId: 'b-e1', to: { x: 8, y: 7 } },
        focusCells: [
          { x: 5, y: 3 },
          { x: 5, y: 4 },
        ],
      },
      {
        why: 'Same lesson as Free the Beam: extend the net beside the file so the rook-like ship can leave its box. Their Hub sits on that file—just outside your glow for now.',
        objective: 'Advance the flanking Escort to extend Sensor Net along the Beam’s lane.',
        success: 'Lane lit. But Black just threatened your Hub—safety before the shot.',
        playerMove: { pieceId: 'w-e2', to: { x: 3, y: 3 } },
        aiMove: { pieceId: 'b-threat', to: { x: 5, y: 1 } },
        focusCells: [
          { x: 3, y: 2 },
          { x: 3, y: 3 },
          { x: 2, y: 4 },
        ],
      },
      {
        why: 'Black stepped onto your Hub’s doorstep. Ignore the Beam shot for one ply—survival first. This is the death-trap pattern from the Hub safety lesson.',
        objective: 'Capture the Escort threatening your Command Hub.',
        success: 'Hub safe. Now convert the prepared lane into Surgical Strike.',
        playerMove: { pieceId: 'w-e1', to: { x: 5, y: 1 } },
        aiMove: { pieceId: 'b-e1', to: { x: 8, y: 6 } },
        focusCells: [
          { x: 5, y: 0 },
          { x: 5, y: 1 },
        ],
      },
      {
        why: 'Net open, Hub safe, enemy Hub sitting on your Beam’s file. Fire. That is how White wins when the plan works.',
        objective: 'Fire the Beam and capture the enemy Command Hub.',
        playerMove: { pieceId: 'w-b1', to: { x: 2, y: 4 } },
        focusCells: [
          { x: 2, y: 0 },
          { x: 2, y: 4 },
        ],
      },
    ],
  },
  {
    id: 'black-at-helm',
    number: '15',
    title: 'Black at the helm',
    concept: 'Playing second seat',
    explanation:
      'Black answers White’s first move. You do not get the Initiative Relay foothold—White already has a forward Escort. Your job is the same: keep the Hub, grow the net, and punish hangs. This drill puts you in Black’s seat for the finishing blow.',
    success:
      'You can play either color. White has tempo and a forward Escort; Black answers and looks for Hub mistakes. Same win conditions either way.',
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
            id: 'b-ch',
            type: PieceType.CommandHub,
            owner: PlayerColor.Black,
            x: 5,
            y: 10,
          },
          {
            id: 'b-e1',
            type: PieceType.Escort,
            owner: PlayerColor.Black,
            x: 5,
            y: 1,
          },
          {
            id: 'w-e1',
            type: PieceType.Escort,
            owner: PlayerColor.White,
            x: 4,
            y: 2,
          },
        ],
        PlayerColor.Black,
        0,
        fleetTeachingRules,
      ),
    steps: [
      {
        why: 'White left their Hub hanging. As Black, you take Surgical Strike the same way—land on the crowned ship.',
        objective: 'Capture White’s Command Hub with your Escort.',
        seat: PlayerColor.Black,
        playerMove: { pieceId: 'b-e1', to: { x: 5, y: 0 } },
        focusCells: [
          { x: 5, y: 1 },
          { x: 5, y: 0 },
        ],
      },
    ],
  },
  {
    id: 'mission-short-strike',
    number: '16',
    title: 'Mission: Surgical Strike (short)',
    concept: 'Guided mission · highlight reel',
    presentation: 'walkthrough',
    explanation:
      'Guided mission 1 of 3. A short, fixed highlight reel—not a full match. Tap Play and watch each order. White grows the net, refuses a Hub hang, then Surgical Strike. Black shows the usual counterplay and death-trap temptation.',
    success:
      'Mission complete. White wins by Surgical Strike. Next: a chess-length battle (~50 plies), then a clock finish when Hubs survive.',
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
            id: 'w-b1',
            type: PieceType.Beam,
            owner: PlayerColor.White,
            x: 2,
            y: 0,
          },
          {
            id: 'w-e1',
            type: PieceType.Escort,
            owner: PlayerColor.White,
            x: 4,
            y: 1,
          },
          {
            id: 'w-e2',
            type: PieceType.Escort,
            owner: PlayerColor.White,
            x: 3,
            y: 2,
          },
          {
            id: 'w-e3',
            type: PieceType.Escort,
            owner: PlayerColor.White,
            x: 5,
            y: 3,
          },
          {
            id: 'b-ch',
            type: PieceType.CommandHub,
            owner: PlayerColor.Black,
            x: 2,
            y: 4,
          },
          {
            id: 'b-e1',
            type: PieceType.Escort,
            owner: PlayerColor.Black,
            x: 8,
            y: 8,
          },
          {
            id: 'b-threat',
            type: PieceType.Escort,
            owner: PlayerColor.Black,
            x: 6,
            y: 1,
          },
        ],
        PlayerColor.White,
        0,
        fleetTeachingRules,
      ),
    steps: [
      {
        why: 'White opens by pushing the Initiative Relay Escort. Going first already has a forward foothold; deepening it grows midboard coverage so later Beam fire has somewhere to live.',
        objective: 'White advances the relay Escort.',
        seat: PlayerColor.White,
        playerMove: { pieceId: 'w-e3', to: { x: 5, y: 4 } },
        focusCells: [
          { x: 5, y: 3 },
          { x: 5, y: 4 },
        ],
      },
      {
        why: 'Black does not yet contest the Beam’s file. A quiet side step keeps options open while White telegraphs net-building on the left.',
        objective: 'Black repositions away from the hot file.',
        seat: PlayerColor.Black,
        playerMove: { pieceId: 'b-e1', to: { x: 8, y: 7 } },
        focusCells: [
          { x: 8, y: 8 },
          { x: 8, y: 7 },
        ],
      },
      {
        why: 'White’s Beam is still boxed inside a small net. Sliding an Escort beside the file extends the blue glow toward Black’s Hub without sitting on the lane (which would block the shot).',
        objective: 'White extends the Sensor Net beside the Beam’s file.',
        seat: PlayerColor.White,
        playerMove: { pieceId: 'w-e2', to: { x: 3, y: 3 } },
        focusCells: [
          { x: 3, y: 2 },
          { x: 3, y: 3 },
          { x: 2, y: 0 },
          { x: 2, y: 4 },
        ],
      },
      {
        why: 'Black reaches for a classic beginner trap: step next to White’s Hub. If White greedily stares at the Beam shot and ignores this, Black takes Surgical Strike next.',
        objective: 'Black threatens White’s Command Hub.',
        seat: PlayerColor.Black,
        playerMove: { pieceId: 'b-threat', to: { x: 5, y: 1 } },
        focusCells: [
          { x: 6, y: 1 },
          { x: 5, y: 1 },
          { x: 5, y: 0 },
        ],
      },
      {
        why: 'White refuses the hang. The prepared Beam shot can wait one ply—Hub safety always comes first. Capture the threat.',
        objective: 'White captures the Hub threat.',
        seat: PlayerColor.White,
        playerMove: { pieceId: 'w-e1', to: { x: 5, y: 1 } },
        focusCells: [
          { x: 4, y: 1 },
          { x: 5, y: 1 },
          { x: 5, y: 0 },
        ],
      },
      {
        why: 'Black’s tactical shot failed. With no immediate recapture, Black shuffles—tempo lost, Hub still sitting on White’s Beam file.',
        objective: 'Black marks time after the failed trap.',
        seat: PlayerColor.Black,
        playerMove: { pieceId: 'b-e1', to: { x: 8, y: 6 } },
        focusCells: [
          { x: 8, y: 7 },
          { x: 8, y: 6 },
        ],
      },
      {
        why: 'Net open, Hub safe, enemy Hub on the Beam’s file. White converts preparation into Surgical Strike—the usual way fleet games end when the plan works.',
        objective: 'White’s Beam captures the enemy Command Hub — game over.',
        seat: PlayerColor.White,
        playerMove: { pieceId: 'w-b1', to: { x: 2, y: 4 } },
        focusCells: [
          { x: 2, y: 0 },
          { x: 2, y: 1 },
          { x: 2, y: 2 },
          { x: 2, y: 3 },
          { x: 2, y: 4 },
        ],
      },
    ],
  },
] as const satisfies readonly TutorialLesson[];

/** Full academy curriculum including guided missions 16–18. */
export const TUTORIAL_LESSONS: readonly TutorialLesson[] = [
  ...TUTORIAL_DRILLS,
  buildStandardBattleMission(),
  buildClockFinishMission(),
];

export function createTutorialEngine(
  lesson: TutorialLesson,
): SubspaceLatticeEngine {
  return SubspaceLatticeEngine.fromState(lesson.createState(), lesson.rules);
}

export function isWalkthroughLesson(lesson: TutorialLesson): boolean {
  return lesson.presentation === 'walkthrough';
}
