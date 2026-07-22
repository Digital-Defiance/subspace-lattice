import { Coordinate } from '../interfaces/coordinate';
import { GameState } from '../interfaces/gameState';
import { SubspaceLatticeEngine } from '../game-engine';
import { CellType } from '../interfaces/cellType';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { Agent } from '../ai/agent';

export interface PuzzleExpectedMove {
  pieceId: string;
  to: Coordinate;
}

export interface Puzzle {
  id: string;
  description: string;
  state: GameState;
  /** Any of these moves is accepted as solving the puzzle. */
  expectedMoves: PuzzleExpectedMove[];
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

export const CLASSIC_PUZZLES: Puzzle[] = [
  hubMateInOne(),
  hangingHubToBeam(),
  forcedRecapturePreference(),
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

export const ALL_PUZZLES: Puzzle[] = [...CLASSIC_PUZZLES, ...HYBRID_PUZZLES];

export function moveMatchesExpected(
  pieceId: string,
  to: Coordinate,
  expected: PuzzleExpectedMove[],
): boolean {
  return expected.some(
    (e) => e.pieceId === pieceId && e.to.x === to.x && e.to.y === to.y,
  );
}

export function evaluatePuzzle(
  puzzle: Puzzle,
  agent: Agent,
): { passed: boolean; chosen: { pieceId: string; to: Coordinate } | null } {
  const engine = SubspaceLatticeEngine.fromState(puzzle.state);
  const chosen = agent.chooseMove(engine);
  if (!chosen) return { passed: false, chosen: null };
  return {
    passed: moveMatchesExpected(
      chosen.pieceId,
      chosen.to,
      puzzle.expectedMoves,
    ),
    chosen: { pieceId: chosen.pieceId, to: chosen.to },
  };
}
