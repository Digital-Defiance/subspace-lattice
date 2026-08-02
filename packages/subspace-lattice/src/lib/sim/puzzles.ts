import { Coordinate } from '../interfaces/coordinate';
import { GameState } from '../interfaces/gameState';
import { SubspaceLatticeEngine } from '../game-engine';
import { CellType } from '../interfaces/cellType';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { Agent, isEmpAgentMove } from '../ai/agent';
import type { RulesConfig } from '../rules/rules-config';
import {
  terminalCloseForBlast,
  terminalLockoutInRange,
  terminalMissOutOfRange,
} from './terminal-goldens';

export interface PuzzleExpectedMove {
  pieceId: string;
  to: Coordinate;
}

export interface Puzzle {
  id: string;
  description: string;
  state: GameState;
  /** Optional rules when state alone does not recover Terminal/EMP knobs. */
  rules?: RulesConfig;
  /** Any of these moves is accepted as solving the puzzle. */
  expectedMoves: PuzzleExpectedMove[];
  /** When true, firing EMP is the solving action. */
  expectedEmp?: boolean;
  /** When true, any non-EMP legal move that reduces Chebyshev to enemy Hub passes. */
  expectHubCloser?: boolean;
}

function emptyBoard(boardSize: number): GameState {
  const cells = [];
  for (let x = 0; x < boardSize; x++) {
    for (let y = 0; y < boardSize; y++) {
      cells.push({
        coordinate: { x, y },
        type: CellType.Empty,
      });
    }
  }
  const center = Math.floor(boardSize / 2);
  const centerCell = cells.find(
    (c) => c.coordinate.x === center && c.coordinate.y === center,
  );
  if (centerCell) centerCell.type = CellType.GravityWell;

  return {
    boardSize,
    cells,
    pieces: {},
    currentPlayer: PlayerColor.White,
    rulesVersion: 'classic',
  };
}

function place(
  state: GameState,
  id: string,
  type: PieceType,
  owner: PlayerColor,
  x: number,
  y: number,
): void {
  state.pieces[id] = { id, type, owner, position: { x, y } };
  const cell = state.cells.find(
    (c) => c.coordinate.x === x && c.coordinate.y === y,
  );
  if (cell) cell.pieceId = id;
}

/** Hub adjacent to white escort — capture is mate-in-1. */
function hubMateInOne(): Puzzle {
  const state = emptyBoard(11);
  place(state, 'w-e1', PieceType.Escort, PlayerColor.White, 5, 9);
  place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 5, 10);
  place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 0, 0);
  return {
    id: 'hub-mate-in-1',
    description: 'White escort captures black command hub',
    state,
    expectedMoves: [{ pieceId: 'w-e1', to: { x: 5, y: 10 } }],
  };
}

/** Black hub hanging to white beam on open file (avoids center gravity well). */
function hangingHubToBeam(): Puzzle {
  const state = emptyBoard(11);
  place(state, 'w-b1', PieceType.Beam, PlayerColor.White, 4, 0);
  place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 4, 10);
  place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 0, 0);
  return {
    id: 'hanging-hub-beam',
    description: 'White beam captures undefended black hub on file',
    state,
    expectedMoves: [{ pieceId: 'w-b1', to: { x: 4, y: 10 } }],
  };
}

/** Prefer recapture of escort that just took a beam (material). */
function forcedRecapturePreference(): Puzzle {
  const state = emptyBoard(11);
  // Black escort on 4,1 can be taken by white escort on 4,0 or 5,1
  place(state, 'w-e1', PieceType.Escort, PlayerColor.White, 4, 0);
  place(state, 'w-e2', PieceType.Escort, PlayerColor.White, 5, 1);
  place(state, 'b-e1', PieceType.Escort, PlayerColor.Black, 4, 1);
  place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 0, 0);
  place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 10, 10);
  // Also a quiet advance available so capture is a choice
  place(state, 'w-e3', PieceType.Escort, PlayerColor.White, 8, 0);
  return {
    id: 'prefer-recapture',
    description: 'White should capture the adjacent black escort',
    state,
    expectedMoves: [
      { pieceId: 'w-e1', to: { x: 4, y: 1 } },
      { pieceId: 'w-e2', to: { x: 4, y: 1 } },
    ],
  };
}

/**
 * Black escort threatens White hub; a Beam capture elsewhere is bait.
 * Any move that leaves the hub hanging fails — capture the threat or flee.
 */
function avoidHangingHubMate(): Puzzle {
  const state = emptyBoard(11);
  place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 5, 0);
  place(state, 'b-e1', PieceType.Escort, PlayerColor.Black, 5, 1);
  place(state, 'w-e1', PieceType.Escort, PlayerColor.White, 4, 1);
  // Material bait: escort can take a Beam (higher heuristic score than Escort).
  place(state, 'w-e2', PieceType.Escort, PlayerColor.White, 8, 2);
  place(state, 'b-b1', PieceType.Beam, PlayerColor.Black, 8, 3);
  place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 10, 10);
  return {
    id: 'avoid-hanging-hub-mate',
    description:
      'White must not take the hanging Beam — resolve the hub threat first',
    state,
    expectedMoves: [
      { pieceId: 'w-e1', to: { x: 5, y: 1 } },
      { pieceId: 'w-ch', to: { x: 5, y: 1 } },
      { pieceId: 'w-ch', to: { x: 4, y: 0 } },
      { pieceId: 'w-ch', to: { x: 6, y: 0 } },
    ],
  };
}

export const CLASSIC_PUZZLES: Puzzle[] = [
  hubMateInOne(),
  hangingHubToBeam(),
  forcedRecapturePreference(),
  avoidHangingHubMate(),
];

/** Infiltrator must not warp onto enemy hub (inside enemy net). */
function hybridAvoidEnemyNet(): Puzzle {
  const state = emptyBoard(11);
  state.rulesVersion = 'hybrid';
  place(state, 'w-i1', PieceType.Infiltrator, PlayerColor.White, 4, 4);
  place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 0, 0);
  place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 5, 10);
  place(state, 'b-e1', PieceType.Escort, PlayerColor.Black, 4, 5);
  return {
    id: 'hybrid-prefer-capture-outside-net',
    description:
      'White infiltrator should capture escort outside enemy net, not warp onto hub',
    state,
    expectedMoves: [{ pieceId: 'w-i1', to: { x: 4, y: 5 } }],
  };
}

export const HYBRID_PUZZLES: Puzzle[] = [hybridAvoidEnemyNet()];

/** Fleet / Terminal content-factory pack (AI regression + yarn sim). */
function fleetFromGolden(
  id: string,
  description: string,
  golden: {
    state: GameState;
    rules: RulesConfig;
  },
  opts: {
    expectedEmp?: boolean;
    expectHubCloser?: boolean;
    expectedMoves?: PuzzleExpectedMove[];
  },
): Puzzle {
  const state = structuredClone(golden.state);
  state.rulesVersion = 'hybrid-fleet';
  return {
    id,
    description,
    state,
    rules: golden.rules,
    expectedMoves: opts.expectedMoves ?? [],
    expectedEmp: opts.expectedEmp,
    expectHubCloser: opts.expectHubCloser,
  };
}

export const FLEET_PUZZLES: Puzzle[] = [
  fleetFromGolden(
    'fleet-terminal-lockout-fire',
    'Armed Terminal EMP in range — fire for Lockout',
    terminalLockoutInRange(),
    { expectedEmp: true },
  ),
  fleetFromGolden(
    'fleet-terminal-refuse-miss',
    'Armed Terminal EMP out of range — do not fire; close instead',
    terminalMissOutOfRange(),
    { expectHubCloser: true },
  ),
  fleetFromGolden(
    'fleet-terminal-close-for-blast',
    'Charging Terminal — reduce Chebyshev distance toward enemy Hub',
    terminalCloseForBlast(),
    { expectHubCloser: true },
  ),
  hubMateInOne(),
];

export const ALL_PUZZLES: Puzzle[] = [
  ...CLASSIC_PUZZLES,
  ...HYBRID_PUZZLES,
  ...FLEET_PUZZLES,
];

export function moveMatchesExpected(
  pieceId: string,
  to: Coordinate,
  expected: PuzzleExpectedMove[],
): boolean {
  return expected.some(
    (e) => e.pieceId === pieceId && e.to.x === to.x && e.to.y === to.y,
  );
}

function chebyshev(
  a: Coordinate,
  b: Coordinate,
): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function evaluatePuzzle(
  puzzle: Puzzle,
  agent: Agent,
): {
  passed: boolean;
  chosen: { pieceId: string; to: Coordinate } | { type: 'emp' } | null;
} {
  const engine = SubspaceLatticeEngine.fromState(puzzle.state, puzzle.rules);
  const chosen = agent.chooseMove(engine);
  if (!chosen) return { passed: false, chosen: null };

  if (puzzle.expectedEmp) {
    return {
      passed: isEmpAgentMove(chosen),
      chosen: isEmpAgentMove(chosen)
        ? { type: 'emp' }
        : { pieceId: chosen.pieceId, to: chosen.to },
    };
  }

  if (isEmpAgentMove(chosen)) {
    return { passed: false, chosen: { type: 'emp' } };
  }

  if (puzzle.expectHubCloser) {
    const piece = engine.getPiece(chosen.pieceId);
    const enemyHub = Object.values(engine.getState().pieces).find(
      (p) =>
        p.owner !== engine.getState().currentPlayer &&
        p.type === PieceType.CommandHub,
    );
    if (!piece || !enemyHub) {
      return {
        passed: false,
        chosen: { pieceId: chosen.pieceId, to: chosen.to },
      };
    }
    const before = chebyshev(piece.position, enemyHub.position);
    const after = chebyshev(chosen.to, enemyHub.position);
    return {
      passed: after < before,
      chosen: { pieceId: chosen.pieceId, to: chosen.to },
    };
  }

  return {
    passed: moveMatchesExpected(
      chosen.pieceId,
      chosen.to,
      puzzle.expectedMoves,
    ),
    chosen: { pieceId: chosen.pieceId, to: chosen.to },
  };
}
