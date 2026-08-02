/**
 * Thinking puzzles — 1–5 graded plies, solution not highlighted.
 * Distinct from `/drills` (obvious intro before game 1).
 */
import {
  CellType,
  PieceType,
  PlayerColor,
  SubspaceLatticeEngine,
  resolveRulesConfig,
  type Coordinate,
  type GameState,
  type RulesConfig,
} from '@subspace-lattice/core';
import type { TutorialLesson, TutorialStep } from './tutorial-types';

const fleetRules = resolveRulesConfig('hybrid-fleet', {
  sectorIntegrationRatio: 0.45,
  sectorActivationPly: 999,
});

const terminalRules = resolveRulesConfig('hybrid-fleet', {
  empRadius: 3,
  empChargeTarget: 15,
  terminalOverclock: true,
  terminalRequiresBothLone: true,
  terminalSharedPhaseClock: true,
  terminalPhaseEntryKomi: 0,
  terminalEmpChargeTarget: 3,
  sectorActivationPly: 10_000,
  firstPlayerRelayCount: 0,
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
  rules: RulesConfig,
  plyCount: number,
  extras?: (state: GameState) => void,
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
      throw new Error(`Invalid puzzle cell ${spec.id} @ ${spec.x},${spec.y}`);
    }
    cell.pieceId = spec.id;
  }
  extras?.(state);
  return state;
}

function puzzle(opts: {
  id: string;
  number: string;
  title: string;
  concept: string;
  explanation: string;
  success: string;
  rules?: RulesConfig;
  pieces: PieceSpec[];
  steps: readonly TutorialStep[];
  plyCount?: number;
  extras?: (state: GameState) => void;
}): TutorialLesson {
  const rules = opts.rules ?? fleetRules;
  return {
    id: opts.id,
    number: opts.number,
    title: opts.title,
    concept: opts.concept,
    explanation: opts.explanation,
    success: opts.success,
    rules,
    presentation: 'puzzle',
    createState: () =>
      stateWith(opts.pieces, rules, opts.plyCount ?? 30, opts.extras),
    steps: opts.steps,
  };
}

function move(
  pieceId: string,
  to: Coordinate,
  rest: Omit<TutorialStep, 'playerMove' | 'why' | 'objective'> & {
    why?: string;
    objective: string;
  },
): TutorialStep {
  return {
    why: rest.why ?? rest.objective,
    objective: rest.objective,
    playerMove: { pieceId, to },
    alternateMoves: rest.alternateMoves,
    aiMove: rest.aiMove,
    focusCells: rest.focusCells,
    success: rest.success,
    seat: rest.seat,
  };
}

export const FLEET_PUZZLES: readonly TutorialLesson[] = [
  puzzle({
    id: 'puzzle-refuse-bait',
    number: '01',
    title: 'Refuse the bait',
    concept: '1 move · Hub safety',
    explanation:
      'Something looks free. Something else ends the game on the reply. Find the only idea that keeps you alive.',
    success:
      'Hub secured. Before every “free” capture, ask: can they take my Hub next?',
    pieces: [
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 0 },
      { id: 'b-e1', type: PieceType.Escort, owner: PlayerColor.Black, x: 5, y: 1 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 4, y: 1 },
      { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 8, y: 2 },
      { id: 'b-b1', type: PieceType.Beam, owner: PlayerColor.Black, x: 8, y: 3 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 10, y: 10 },
    ],
    steps: [
      move('w-e1', { x: 5, y: 1 }, {
        objective: 'Stop the immediate Surgical Strike threat.',
        alternateMoves: [
          { pieceId: 'w-ch', to: { x: 5, y: 1 } },
          { pieceId: 'w-ch', to: { x: 4, y: 0 } },
          { pieceId: 'w-ch', to: { x: 6, y: 0 } },
        ],
        // Soft theatre — Hub file + bait, not the solution square alone.
        focusCells: [
          { x: 5, y: 0 },
          { x: 8, y: 3 },
        ],
      }),
    ],
  }),

  puzzle({
    id: 'puzzle-find-strike',
    number: '02',
    title: 'Find Surgical Strike',
    concept: '1 move · finish',
    explanation:
      'The board is noisy. One order ends it. Ignore the side fights.',
    success: 'Surgical Strike. When the Hub is hanging, take it.',
    pieces: [
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 0, y: 0 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 3, y: 3 },
      { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 9 },
      { id: 'b-e1', type: PieceType.Escort, owner: PlayerColor.Black, x: 3, y: 4 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 5, y: 10 },
    ],
    steps: [
      move('w-e2', { x: 5, y: 10 }, {
        objective: 'Win now.',
        focusCells: [
          { x: 3, y: 3 },
          { x: 5, y: 10 },
        ],
      }),
    ],
  }),

  puzzle({
    id: 'puzzle-warp-not-hub',
    number: '03',
    title: 'Warp with a purpose',
    concept: '1 move · Infiltrator',
    explanation:
      'Your Infiltrator can appear on almost any square outside the enemy Sensor Net. The Hub looks like glory. One Escort is also “free” — until you notice red coverage. Find the capture that is actually legal.',
    success:
      'Escort taken outside their net. Warping onto a Hub (or any ship) inside enemy coverage is illegal — Target Lock is not the only way Infiltrators get blocked.',
    pieces: [
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 0, y: 0 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 1, y: 0 },
      { id: 'w-i1', type: PieceType.Infiltrator, owner: PlayerColor.White, x: 4, y: 4 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 5, y: 10 },
      // Inside Black hub net (Chebyshev ≤3) — looks juicy, illegal warp.
      { id: 'b-e1', type: PieceType.Escort, owner: PlayerColor.Black, x: 5, y: 8 },
      // Outside Black net — the real prize.
      { id: 'b-e2', type: PieceType.Escort, owner: PlayerColor.Black, x: 4, y: 5 },
    ],
    steps: [
      move('w-i1', { x: 4, y: 5 }, {
        objective: 'Warp to a legal capture — not into red coverage.',
        focusCells: [
          { x: 4, y: 4 },
          { x: 5, y: 10 },
          { x: 5, y: 8 },
        ],
      }),
    ],
  }),

  puzzle({
    id: 'puzzle-secure-then-claim',
    number: '04',
    title: 'Secure, then claim',
    concept: '2 moves · discipline',
    explanation:
      'First remove the death threat. After Black’s reply, the “free” piece is finally free.',
    success:
      'Threat first, loot second. That order of operations wins more games than greed.',
    pieces: [
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 0 },
      { id: 'b-e1', type: PieceType.Escort, owner: PlayerColor.Black, x: 5, y: 1 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 4, y: 1 },
      { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 8, y: 2 },
      { id: 'b-b1', type: PieceType.Beam, owner: PlayerColor.Black, x: 8, y: 3 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 10, y: 10 },
    ],
    steps: [
      move('w-e1', { x: 5, y: 1 }, {
        objective: 'Ply 1 — kill the Hub threat.',
        success: 'Threat gone.',
        aiMove: { pieceId: 'b-ch', to: { x: 9, y: 10 } },
        focusCells: [
          { x: 5, y: 0 },
          { x: 8, y: 3 },
        ],
      }),
      move('w-e2', { x: 8, y: 3 }, {
        objective: 'Ply 2 — now take the hanging Beam.',
        focusCells: [
          { x: 8, y: 2 },
          { x: 8, y: 3 },
        ],
      }),
    ],
  }),

  puzzle({
    id: 'puzzle-clear-the-lane',
    number: '05',
    title: 'Clear the lane',
    concept: '2 moves · Beam finish',
    explanation:
      'Surgical Strike is two Beam orders away. An Escort sits on the file — eat it with the Beam, then finish. Coverage comes from the flanks so the file stays empty.',
    success:
      'Beam clears, Beam finishes. Keep friendlies off the shooting file.',
    pieces: [
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 4, y: 0 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 4, y: 1 },
      { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 4, y: 2 },
      // Flank net — not on file 4 between Beam and Hub.
      { id: 'w-e3', type: PieceType.Escort, owner: PlayerColor.White, x: 3, y: 4 },
      { id: 'w-e4', type: PieceType.Escort, owner: PlayerColor.White, x: 3, y: 5 },
      { id: 'w-e5', type: PieceType.Escort, owner: PlayerColor.White, x: 3, y: 6 },
      { id: 'w-e6', type: PieceType.Escort, owner: PlayerColor.White, x: 3, y: 7 },
      { id: 'w-e7', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 6 },
      { id: 'w-e8', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 7 },
      { id: 'w-b1', type: PieceType.Beam, owner: PlayerColor.White, x: 4, y: 3 },
      { id: 'b-e1', type: PieceType.Escort, owner: PlayerColor.Black, x: 4, y: 4 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 4, y: 8 },
      { id: 'b-e2', type: PieceType.Escort, owner: PlayerColor.Black, x: 9, y: 9 },
    ],
    steps: [
      move('w-b1', { x: 4, y: 4 }, {
        objective: 'Ply 1 — Beam-capture the blocker.',
        success: 'File open.',
        aiMove: { pieceId: 'b-e2', to: { x: 9, y: 8 } },
        focusCells: [
          { x: 4, y: 3 },
          { x: 4, y: 8 },
        ],
      }),
      move('w-b1', { x: 4, y: 8 }, {
        objective: 'Ply 2 — Surgical Strike down the file.',
        focusCells: [
          { x: 4, y: 4 },
          { x: 4, y: 8 },
        ],
      }),
    ],
  }),

  puzzle({
    id: 'puzzle-into-blast',
    number: '06',
    title: 'Step into the blast',
    concept: '2 moves · Terminal',
    explanation:
      'EMP is armed. Black is one Chebyshev step outside your radius. Fire now and you fuse yourself for nothing. Fix the geometry, then Lockout.',
    success:
      'In range, then fire. Terminal Overclock punishes impatience harder than any midgame mistake.',
    rules: terminalRules,
    plyCount: 40,
    extras: (state) => {
      state.terminalPhaseArmed = true;
      state.terminalPhaseArmedAtPly = 40;
      state.empCharge = {
        [PlayerColor.White]: 3,
        [PlayerColor.Black]: 0,
      };
    },
    pieces: [
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 4, y: 4 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 4, y: 8 },
    ],
    steps: [
      move('w-ch', { x: 4, y: 5 }, {
        objective: 'Ply 1 — enter blast range (do not fire yet).',
        success: 'Black is inside the disk.',
        aiMove: { pieceId: 'b-ch', to: { x: 5, y: 8 } },
        alternateMoves: [
          { pieceId: 'w-ch', to: { x: 3, y: 5 } },
          { pieceId: 'w-ch', to: { x: 4, y: 5 } },
        ],
        focusCells: [
          { x: 4, y: 4 },
          { x: 4, y: 8 },
        ],
      }),
      {
        why: 'Now geometry says Lockout.',
        objective: 'Ply 2 — Fire Command Overload.',
        playerMove: { type: 'emp' },
        focusCells: [
          { x: 4, y: 5 },
          { x: 5, y: 8 },
        ],
      },
    ],
  }),

  puzzle({
    id: 'puzzle-net-then-beam',
    number: '07',
    title: 'Grow the lane, then strike',
    concept: '3 moves · Beam prep',
    explanation:
      'Your Beam cannot shoot through uncovered space — and it cannot shoot through your own ships. Extend coverage from the flank, Beam-clear the blocker, then finish. Stay outside their net when you land the clear, or Target Lock will stall the Beam.',
    success:
      'Flank net, Beam clear, Beam finish — and never leave the Beam Target Locked mid-strike.',
    pieces: [
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 2, y: 0 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 2, y: 1 },
      { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 2, y: 2 },
      { id: 'w-e3', type: PieceType.Escort, owner: PlayerColor.White, x: 1, y: 3 },
      // Flank chain deep enough to cover file through y=10; file 2 stays empty.
      { id: 'w-e5', type: PieceType.Escort, owner: PlayerColor.White, x: 1, y: 6 },
      { id: 'w-e6', type: PieceType.Escort, owner: PlayerColor.White, x: 1, y: 8 },
      { id: 'w-e7', type: PieceType.Escort, owner: PlayerColor.White, x: 3, y: 6 },
      { id: 'w-e8', type: PieceType.Escort, owner: PlayerColor.White, x: 3, y: 8 },
      { id: 'w-e9', type: PieceType.Escort, owner: PlayerColor.White, x: 1, y: 9 },
      { id: 'w-e10', type: PieceType.Escort, owner: PlayerColor.White, x: 3, y: 9 },
      { id: 'w-b1', type: PieceType.Beam, owner: PlayerColor.White, x: 2, y: 3 },
      { id: 'b-e1', type: PieceType.Escort, owner: PlayerColor.Black, x: 2, y: 5 },
      // Hub far enough that (2,5) is outside Black net (radius 3).
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 2, y: 10 },
      { id: 'b-e2', type: PieceType.Escort, owner: PlayerColor.Black, x: 9, y: 9 },
    ],
    steps: [
      move('w-e3', { x: 1, y: 4 }, {
        objective: 'Ply 1 — flank-cover the gap on the Beam file (don’t sit on it).',
        success: 'Gap covered.',
        aiMove: { pieceId: 'b-e2', to: { x: 9, y: 8 } },
        focusCells: [
          { x: 2, y: 3 },
          { x: 2, y: 10 },
        ],
      }),
      move('w-b1', { x: 2, y: 5 }, {
        objective: 'Ply 2 — Beam-capture the blocker (land outside their net).',
        success: 'Lane clear.',
        aiMove: { pieceId: 'b-e2', to: { x: 9, y: 7 } },
        focusCells: [
          { x: 2, y: 3 },
          { x: 2, y: 10 },
        ],
      }),
      move('w-b1', { x: 2, y: 10 }, {
        objective: 'Ply 3 — Surgical Strike down the covered file.',
        focusCells: [
          { x: 2, y: 5 },
          { x: 2, y: 10 },
        ],
      }),
    ],
  }),
];

export const FLEET_PUZZLE_PACK = {
  id: 'puzzles',
  title: 'Puzzles',
  kicker: 'Think · 1–5 moves',
  lessons: FLEET_PUZZLES,
  progressKey: 'subspace-lattice:fleet-puzzle-progress',
  homeHref: '/play',
  completeHref: '/play',
  completeLabel: 'Back to the command deck',
} as const;
