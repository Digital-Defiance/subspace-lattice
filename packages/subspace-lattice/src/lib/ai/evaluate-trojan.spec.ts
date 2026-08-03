/**
 * Leaf / prior: refuse expanding onto a fringe Infiltrator (Trojan).
 */
import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from '../game-engine';
import { CellType } from '../interfaces/cellType';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { resolveRulesConfig } from '../rules/rules-config';
import { evaluatePosition } from './evaluate';
import { HeuristicAi } from './heuristic-ai';
import { createSeededRng } from './rng';

const rules = resolveRulesConfig('hybrid-fleet', {
  sectorActivationPly: 999,
});

function withPieces(
  places: Array<{
    id: string;
    type: PieceType;
    owner: PlayerColor;
    x: number;
    y: number;
  }>,
  plyCount = 20,
): SubspaceLatticeEngine {
  const engine0 = new SubspaceLatticeEngine({ rules });
  const state = engine0.getStateCopy();
  for (const c of state.cells) delete c.pieceId;
  state.pieces = {};
  state.currentPlayer = PlayerColor.White;
  state.plyCount = plyCount;
  delete state.winner;
  delete state.winnerReason;
  for (const p of places) {
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
      throw new Error(`bad ${p.x},${p.y}`);
    }
    cell.pieceId = p.id;
  }
  return SubspaceLatticeEngine.fromState(state, rules);
}

/** Same geometry as infiltrator-trojan fringe screen. */
const fringe = [
  { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 0 },
  { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 2 },
  { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 6, y: 2 },
  { id: 'w-e3', type: PieceType.Escort, owner: PlayerColor.White, x: 6, y: 3 },
  { id: 'b-i1', type: PieceType.Infiltrator, owner: PlayerColor.Black, x: 6, y: 5 },
  { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 0, y: 10 },
] as const;

describe('Trojan leaf / prior', () => {
  it('evaluatePosition prefers safe lateral tip over expand-onto-Infiltrator', () => {
    const base = withPieces([...fringe]);
    const trojan = base.clone();
    expect(trojan.movePiece('w-e3', { x: 6, y: 4 })).toBe(true);
    const safe = base.clone();
    expect(safe.movePiece('w-e3', { x: 7, y: 3 })).toBe(true);

    const trojanScore = evaluatePosition(trojan, PlayerColor.White);
    const safeScore = evaluatePosition(safe, PlayerColor.White);
    expect(safeScore).toBeGreaterThan(trojanScore);
  });

  it('heuristic prior prefers not landing ortho on a parked Infiltrator', () => {
    const engine = withPieces([...fringe]);
    const ai = new HeuristicAi(createSeededRng(1));
    // Use chooseMove — should not pick w-e3→(6,4) when (7,3) exists.
    const move = ai.chooseMove(engine);
    expect(move).toBeTruthy();
    if (!move || !('pieceId' in move)) return;
    const isTrojan =
      move.pieceId === 'w-e3' && move.to.x === 6 && move.to.y === 4;
    expect(isTrojan).toBe(false);
  });
});
