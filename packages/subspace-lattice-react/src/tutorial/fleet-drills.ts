/**
 * Full-arc fleet intro drills — obvious, highlighted, before game 1.
 * Thinking positions live in fleet-puzzles.ts (`/puzzles`).
 *
 * Entry: `/drills` (lobby Local + Practice gate + landing).
 */
import {
  CellType,
  PieceType,
  PlayerColor,
  SubspaceLatticeEngine,
  resolveRulesConfig,
  terminalCloseForBlast,
  terminalLockoutInRange,
  terminalMissOutOfRange,
  type Coordinate,
  type GameState,
  type RulesConfig,
} from '@subspace-lattice/core';
import type { TutorialLesson, TutorialMove } from './tutorial-types';
import {
  terminalLockoutFireSteps,
  terminalRefuseMissSteps,
} from './data/mission-terminal-goldens';

/** Phase tags for nav grouping in the Tutorial shell. */
export type DrillPhase =
  | 'opening'
  | 'midgame'
  | 'sector'
  | 'strike'
  | 'terminal';

export type FleetDrillLesson = TutorialLesson & {
  phase: DrillPhase;
};

const fleetRules = resolveRulesConfig('hybrid-fleet', {
  sectorIntegrationRatio: 0.45,
  sectorActivationPly: 999,
});

const sectorArmedRules = resolveRulesConfig('hybrid-fleet', {
  sectorIntegrationRatio: 0.45,
  sectorActivationPly: 0,
  sectorHoldPlies: 1,
});

interface PieceSpec {
  id: string;
  type: PieceType;
  owner: PlayerColor;
  x: number;
  y: number;
}

function stateWith(
  pieces: PieceSpec[],
  rules: RulesConfig = fleetRules,
  plyCount = 20,
): GameState {
  const engine = new SubspaceLatticeEngine({ rules });
  const state = engine.getStateCopy();
  for (const cell of state.cells) delete cell.pieceId;
  state.pieces = {};
  state.currentPlayer = PlayerColor.White;
  state.plyCount = plyCount;
  delete state.winner;
  delete state.winnerReason;
  delete state.sectorHoldProgress;
  delete state.empActive;
  delete state.terminalPhaseArmed;
  delete state.terminalPhaseArmedAtPly;
  for (const spec of pieces) {
    state.pieces[spec.id] = {
      id: spec.id,
      type: spec.type,
      owner: spec.owner,
      position: { x: spec.x, y: spec.y },
    };
    const cell = state.cells.find(
      (c) => c.coordinate.x === spec.x && c.coordinate.y === spec.y,
    );
    if (!cell || cell.type === CellType.GravityWell) {
      throw new Error(`Invalid drill cell for ${spec.id} at ${spec.x},${spec.y}`);
    }
    cell.pieceId = spec.id;
  }
  return state;
}

function drill(opts: {
  id: string;
  number: string;
  phase: DrillPhase;
  title: string;
  concept: string;
  explanation: string;
  objective: string;
  success: string;
  rules?: RulesConfig;
  pieces: PieceSpec[];
  playerMove: TutorialMove;
  focusCells?: readonly Coordinate[];
  plyCount?: number;
}): FleetDrillLesson {
  const rules = opts.rules ?? fleetRules;
  return {
    id: opts.id,
    number: opts.number,
    phase: opts.phase,
    title: opts.title,
    concept: opts.concept,
    explanation: opts.explanation,
    success: opts.success,
    rules,
    createState: () => stateWith(opts.pieces, rules, opts.plyCount ?? 20),
    steps: [
      {
        why: opts.explanation,
        objective: opts.objective,
        playerMove: opts.playerMove,
        focusCells: opts.focusCells,
      },
    ],
  };
}

const openingDrills: FleetDrillLesson[] = [
  drill({
    id: 'drill-capture-escort',
    number: '01',
    phase: 'opening',
    title: 'Capture the Escort',
    concept: 'Opening · material',
    explanation:
      'Early fleet fights often clean a hanging Escort before it links and grows the enemy net. Land on its square.',
    objective: 'Capture the enemy Escort with your Escort.',
    success:
      'Escort removed. Captures break relays and open lanes toward the Hub.',
    pieces: [
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 2, y: 1 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 4, y: 3 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 9, y: 9 },
      { id: 'b-e1', type: PieceType.Escort, owner: PlayerColor.Black, x: 4, y: 4 },
    ],
    playerMove: { pieceId: 'w-e1', to: { x: 4, y: 4 } },
    focusCells: [
      { x: 4, y: 3 },
      { x: 4, y: 4 },
    ],
  }),
  drill({
    id: 'drill-expand-net-fringe',
    number: '02',
    phase: 'opening',
    title: 'Push the net fringe',
    concept: 'Opening · Sensor Net',
    explanation:
      'A linked Escort extends coverage past the Hub’s own blob. One forward step paints new sovereign space.',
    objective: 'Advance the forward Escort one square to expand the Sensor Net.',
    success:
      'Coverage grew. Stay linked (≤2 squares between friends) or distant Escorts go dark.',
    pieces: [
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 0 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 2 },
      { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 3 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 5, y: 10 },
      { id: 'b-e1', type: PieceType.Escort, owner: PlayerColor.Black, x: 5, y: 9 },
    ],
    playerMove: { pieceId: 'w-e2', to: { x: 5, y: 4 } },
    focusCells: [
      { x: 5, y: 3 },
      { x: 5, y: 4 },
      { x: 5, y: 5 },
    ],
  }),
];

const midgameDrills: FleetDrillLesson[] = [
  drill({
    id: 'drill-capture-refractor',
    number: '03',
    phase: 'midgame',
    title: 'Capture the Refractor',
    concept: 'Midgame · heavy pieces',
    explanation:
      'Heavy pieces are high value. Black’s Refractor sits adjacent — take it with your Escort before it slides through your net.',
    objective: 'Capture the enemy Refractor with your Escort.',
    success:
      'Refractor removed. Diagonal heavies only slide inside their Sensor Net; Target Lock reduces them to a crawl.',
    pieces: [
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 2, y: 1 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 4, y: 4 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 9, y: 9 },
      { id: 'b-r1', type: PieceType.Refractor, owner: PlayerColor.Black, x: 4, y: 5 },
    ],
    playerMove: { pieceId: 'w-e1', to: { x: 4, y: 5 } },
    focusCells: [
      { x: 4, y: 4 },
      { x: 4, y: 5 },
    ],
  }),
  drill({
    id: 'drill-free-beam-shot',
    number: '04',
    phase: 'midgame',
    title: 'Fire the Beam lane',
    concept: 'Midgame · Beam',
    explanation:
      'Beams need a clear orthogonal path through your Sensor Net. The lane is open — capture the Escort on the file.',
    objective: 'Capture the enemy Escort with your Beam.',
    success:
      'Beam strike landed. Clear the file, keep the Beam in the net, and Hub hunts get sharp fast.',
    pieces: [
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 2, y: 0 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 2, y: 1 },
      { id: 'w-b1', type: PieceType.Beam, owner: PlayerColor.White, x: 2, y: 2 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 9, y: 9 },
      { id: 'b-e1', type: PieceType.Escort, owner: PlayerColor.Black, x: 2, y: 3 },
    ],
    playerMove: { pieceId: 'w-b1', to: { x: 2, y: 3 } },
    focusCells: [
      { x: 2, y: 2 },
      { x: 2, y: 3 },
    ],
  }),
  /**
   * Volume II — Hub wandering fail mode. Hub can take the bait; Escort should.
   * Atlas: mid Hub move share ~5% under search when the prior holds.
   */
  drill({
    id: 'drill-hold-the-hub',
    number: '05',
    phase: 'midgame',
    title: 'Hold the Hub',
    concept: 'Midgame · Hub discipline',
    explanation:
      'Your Command Hub can snatch that Escort — and that is the trap. Midgame Hub walks reset Overload charge and stroll into Surgical Strike. Leave the Hub. Take with the Escort.',
    objective: 'Capture the enemy Escort with your Escort — do not move the Hub.',
    success:
      'Escort did the work. If your Hub is the most-moved piece midgame, you are probably losing the charge race and the Strike race.',
    plyCount: 40,
    pieces: [
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 4, y: 4 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 4, y: 6 },
      { id: 'b-e1', type: PieceType.Escort, owner: PlayerColor.Black, x: 4, y: 5 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 9, y: 9 },
    ],
    playerMove: { pieceId: 'w-e1', to: { x: 4, y: 5 } },
    focusCells: [
      { x: 4, y: 6 },
      { x: 4, y: 5 },
      { x: 4, y: 4 },
    ],
  }),
  /**
   * Volume II — Infiltrator Trojan. Tip expand onto parked I activates an
   * Escort-like crawler that takes the tip. Lateral expand is safe.
   */
  drill({
    id: 'drill-refuse-fringe-infiltrator',
    number: '06',
    phase: 'midgame',
    title: 'Refuse the fringe Infiltrator',
    concept: 'Midgame · Trojan',
    explanation:
      'Black’s Infiltrator sits just outside your tip. Step onto the file and you paint them — Target Lock turns them into an Escort-like crawler that eats the tip. Expand sideways instead; leave the parasite in the dark.',
    objective:
      'Advance the tip Escort one square sideways (not onto the Infiltrator’s file).',
    success:
      'Net grew without activating the Trojan. Infiltrators cannot warp into your glow — only you can invite them in.',
    plyCount: 24,
    pieces: [
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 0 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 2 },
      { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 6, y: 2 },
      { id: 'w-e3', type: PieceType.Escort, owner: PlayerColor.White, x: 6, y: 3 },
      { id: 'b-i1', type: PieceType.Infiltrator, owner: PlayerColor.Black, x: 6, y: 5 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 0, y: 10 },
    ],
    playerMove: { pieceId: 'w-e3', to: { x: 7, y: 3 } },
    focusCells: [
      { x: 6, y: 3 },
      { x: 7, y: 3 },
      { x: 6, y: 5 },
    ],
  }),
  /**
   * Volume II — Hub bulldozer / Rolling Storm. Hub r=3 disk grows sector
   * harder than a dark Escort tip. Twin of drill-hold-the-hub (fail mode).
   */
  drill({
    id: 'drill-rolling-storm',
    number: '07',
    phase: 'midgame',
    title: 'Rolling Storm',
    concept: 'Midgame · Hub bulldozer',
    explanation:
      'Your tip Escort is dark — too far to paint. Marching it does nothing for coverage. One Command Hub king-step moves the whole r=3 Sensor disk and grows exclusive sector. That is Rolling Storm: Hub as a deliberate sector tool, not a bait grab.',
    objective:
      'Advance the Command Hub one king-step diagonally (not the dark Escort).',
    success:
      'Coverage grew with the Hub disk. Dark Escorts paint nothing; linked rim tips grow less per step than a Hub king-step.',
    plyCount: 40,
    pieces: [
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 2, y: 2 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 2, y: 5 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 10, y: 10 },
    ],
    playerMove: { pieceId: 'w-ch', to: { x: 3, y: 3 } },
    focusCells: [
      { x: 2, y: 2 },
      { x: 3, y: 3 },
      { x: 2, y: 5 },
    ],
  }),
];

/**
 * Sector — reconnect a dark Escort so exclusive coverage crosses the
 * Integration marker (45%). Asserted in fleet-drills.spec.ts.
 */
const sectorDrills: FleetDrillLesson[] = [
  drill({
    id: 'drill-expand-net-45',
    number: '08',
    phase: 'sector',
    title: 'Hit the Integration marker',
    concept: 'Sector · 45% coverage',
    explanation:
      'Fleet Integration needs 45% exclusive Sensor Net. The tip Escort is dark (too far from the chain). Step it back into link range and coverage jumps over the marker — watch the HUD.',
    objective:
      'Reconnect the highlighted Escort so coverage reaches at least 45%.',
    success:
      'Coverage crossed 45%. With the clock armed, this is how Sector Integration becomes a real threat.',
    rules: sectorArmedRules,
    plyCount: 100,
    pieces: [
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 0 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 2 },
      { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 4 },
      { id: 'w-e3', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 6 },
      { id: 'w-e4', type: PieceType.Escort, owner: PlayerColor.White, x: 4, y: 6 },
      { id: 'w-e5', type: PieceType.Escort, owner: PlayerColor.White, x: 6, y: 6 },
      { id: 'w-e6', type: PieceType.Escort, owner: PlayerColor.White, x: 3, y: 6 },
      { id: 'w-e7', type: PieceType.Escort, owner: PlayerColor.White, x: 7, y: 6 },
      // Dark tip: chebyshev 3 from nearest linked escort at (5,6)/(3,6)/(7,6)
      { id: 'w-e8', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 9 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 0, y: 10 },
    ],
    playerMove: { pieceId: 'w-e8', to: { x: 5, y: 8 } },
    focusCells: [
      { x: 5, y: 9 },
      { x: 5, y: 8 },
      { x: 5, y: 6 },
    ],
  }),
  /**
   * Volume II — Integration Hold. Clock armed, already ≥45%, White hold
   * streak at 1 of 2 — one quiet Escort step that keeps the net closes it.
   */
  {
    id: 'drill-integration-hold',
    number: '09',
    phase: 'sector',
    title: 'Finish Integration Hold',
    concept: 'Sector · hold clock',
    explanation:
      'You are already over 45% exclusive coverage and the Integration Hold clock shows one ply banked. Do not wander the Hub — expand a wing Escort so the net stays painted and the hold completes.',
    success:
      'Sector Integration. Atlas searches finish here more often than Surgical Strike among equals — treat the hold as a real plan, not flavor.',
    rules: resolveRulesConfig('hybrid-fleet', {
      sectorIntegrationRatio: 0.45,
      sectorActivationPly: 0,
      sectorHoldPlies: 2,
    }),
    createState: () => {
      const state = stateWith(
        [
          { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 0 },
          { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 2 },
          { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 4 },
          { id: 'w-e3', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 6 },
          { id: 'w-e4', type: PieceType.Escort, owner: PlayerColor.White, x: 4, y: 6 },
          { id: 'w-e5', type: PieceType.Escort, owner: PlayerColor.White, x: 6, y: 6 },
          { id: 'w-e6', type: PieceType.Escort, owner: PlayerColor.White, x: 3, y: 6 },
          { id: 'w-e7', type: PieceType.Escort, owner: PlayerColor.White, x: 7, y: 6 },
          { id: 'w-e8', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 8 },
          { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 0, y: 10 },
        ],
        resolveRulesConfig('hybrid-fleet', {
          sectorIntegrationRatio: 0.45,
          sectorActivationPly: 0,
          sectorHoldPlies: 2,
        }),
        120,
      );
      state.sectorHoldProgress = { [PlayerColor.White]: 1 };
      return state;
    },
    steps: [
      {
        why: 'Hold streak is 1 of 2. Expand a wing Escort so coverage stays above 45% and the hold completes.',
        objective:
          'Advance the right-wing Escort one square — keep the net over the marker and finish Integration Hold.',
        playerMove: { pieceId: 'w-e7', to: { x: 8, y: 6 } },
        focusCells: [
          { x: 7, y: 6 },
          { x: 8, y: 6 },
        ],
      },
    ],
  },
];

const strikeDrills: FleetDrillLesson[] = [
  drill({
    id: 'drill-surgical-strike',
    number: '10',
    phase: 'strike',
    title: 'Deliver Surgical Strike',
    concept: 'Endgame · Hub capture',
    explanation:
      'Most fleet games end here: land on the enemy Command Hub. No hold, no percentage — the battle ends instantly.',
    objective: 'Capture the enemy Command Hub with your Escort.',
    success: 'Surgical Strike. Protect yours the same way you hunt theirs.',
    pieces: [
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 0, y: 0 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 9 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 5, y: 10 },
    ],
    playerMove: { pieceId: 'w-e1', to: { x: 5, y: 10 } },
    focusCells: [
      { x: 5, y: 9 },
      { x: 5, y: 10 },
    ],
  }),
];

const terminalDrills: FleetDrillLesson[] = [
  {
    id: 'drill-terminal-lockout-fire',
    number: '11',
    phase: 'terminal',
    title: 'Fire Terminal Lockout',
    concept: 'Terminal · Lockout',
    explanation:
      'Lone Hubs, EMP armed, Black inside your cyan blast. Magenta cells are where both discs overlap. Fire Command Overload for Lockout.',
    success:
      'Lockout. Magenta overlap meant mutual threat — you fired first. Immobility is defeat (winnerReason no-moves).',
    rules: terminalLockoutInRange().rules,
    createState: () => structuredClone(terminalLockoutInRange().state),
    steps: terminalLockoutFireSteps,
  },
  {
    id: 'drill-terminal-refuse-miss',
    number: '12',
    phase: 'terminal',
    title: 'Refuse the out-of-range EMP',
    concept: 'Terminal · miss fuse',
    explanation:
      'Charge is full but Black sits just outside the cyan blast disc. Fire now and you fuse yourself for nothing. Step one square closer so the disc covers their Hub — watch for magenta where both blasts overlap.',
    success:
      'Black is inside your disc. Magenta means both Hubs threaten each other. Next time you’d fire Lockout — not a miss.',
    rules: terminalMissOutOfRange().rules,
    createState: () => structuredClone(terminalMissOutOfRange().state),
    steps: terminalRefuseMissSteps,
  },
  {
    id: 'drill-terminal-close-for-blast',
    number: '13',
    phase: 'terminal',
    title: 'Close for the growing blast',
    concept: 'Terminal · charge',
    explanation:
      'Hub steps charge Terminal EMP. Black is one ring outside — step in to charge and pull them into the cyan disc at the same time.',
    success:
      'Closer and charging. The disc reaches them; keep Hub-stepping until charge is full, then Lockout.',
    rules: terminalCloseForBlast().rules,
    createState: () => structuredClone(terminalCloseForBlast().state),
    steps: [
      {
        why: 'Hub steps charge Terminal EMP. Cut Chebyshev distance until Black sits inside the blast.',
        objective: 'Move your Command Hub onto the file so the blast covers Black',
        playerMove: { pieceId: 'w-ch', to: { x: 4, y: 6 } },
        focusCells: [
          { x: 4, y: 5 },
          { x: 4, y: 6 },
          { x: 4, y: 9 },
        ],
      },
    ],
  },
];

export const FLEET_DRILLS: readonly FleetDrillLesson[] = [
  ...openingDrills,
  ...midgameDrills,
  ...sectorDrills,
  ...strikeDrills,
  ...terminalDrills,
];

export const DRILL_PHASE_LABEL: Record<DrillPhase, string> = {
  opening: 'Opening',
  midgame: 'Midgame',
  sector: 'Sector',
  strike: 'Strike',
  terminal: 'Terminal',
};

export const FLEET_DRILL_PACK = {
  id: 'fleet-arc',
  title: 'Fleet drills',
  kicker: 'Before game 1 · introduction',
  lessons: FLEET_DRILLS,
  progressKey: 'subspace-lattice:fleet-drill-progress',
  homeHref: '/play',
  completeHref: '/play?local=1&ai=fast',
  completeLabel: 'First local game · Fast AI',
} as const;

/** @deprecated Prefer FLEET_DRILLS / FLEET_DRILL_PACK. */
export const TERMINAL_DRILLS = terminalDrills;
export const TERMINAL_DRILL_PACK = FLEET_DRILL_PACK;
