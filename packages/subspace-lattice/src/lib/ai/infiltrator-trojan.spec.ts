/**
 * Infiltrator Trojan / fringe theories — engine proofs for Atlas playbook.
 * Shipping hybrid-fleet: two Infiltrators per side (not a full ring).
 */
import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from '../game-engine';
import { CellType } from '../interfaces/cellType';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { resolveRulesConfig } from '../rules/rules-config';

const rules = resolveRulesConfig('hybrid-fleet', {
  sectorActivationPly: 999,
});

/** Build engine after placements on a fresh bare state. */
function withPieces(
  places: Array<{
    id: string;
    type: PieceType;
    owner: PlayerColor;
    x: number;
    y: number;
  }>,
  plyCount = 40,
  current: PlayerColor = PlayerColor.White,
): SubspaceLatticeEngine {
  const engine0 = new SubspaceLatticeEngine({ rules });
  const state = engine0.getStateCopy();
  for (const c of state.cells) delete c.pieceId;
  state.pieces = {};
  state.currentPlayer = current;
  state.plyCount = plyCount;
  delete state.winner;
  delete state.winnerReason;
  delete state.empActive;
  state.empCharge = {
    [PlayerColor.White]: 0,
    [PlayerColor.Black]: 0,
  };
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
      throw new Error(`bad cell ${p.x},${p.y}`);
    }
    cell.pieceId = p.id;
  }
  return SubspaceLatticeEngine.fromState(state, rules);
}

/**
 * Linked White screen on the right file:
 * Hub (5,0) — e1 (5,2) — e2 (6,2) — tip e3 (6,3).
 * Black I at (6,5) sits just outside tip glow; tip→(6,4) activates and is
 * ortho-adjacent for the Trojan capture.
 */
const fringeScreen = [
  { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 0 },
  { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 2 },
  { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 6, y: 2 },
  { id: 'w-e3', type: PieceType.Escort, owner: PlayerColor.White, x: 6, y: 3 },
  { id: 'b-i1', type: PieceType.Infiltrator, owner: PlayerColor.Black, x: 6, y: 5 },
  { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 0, y: 10 },
] as const;

describe('Infiltrator roster + Trojan fringe theories', () => {
  it('hybrid-fleet opening fields exactly two Infiltrators per side', () => {
    const engine = new SubspaceLatticeEngine({
      rules: resolveRulesConfig('hybrid-fleet'),
    });
    const infil = Object.values(engine.getState().pieces).filter(
      (p) => p.type === PieceType.Infiltrator,
    );
    expect(infil.filter((p) => p.owner === PlayerColor.White)).toHaveLength(2);
    expect(infil.filter((p) => p.owner === PlayerColor.Black)).toHaveLength(2);
  });

  it('cannot warp onto a Hub (or any square) inside enemy Sensor Net', () => {
    const engine = withPieces([...fringeScreen], 40, PlayerColor.Black);
    const i = engine.getPiece('b-i1')!;
    expect(engine.isPieceDetected(i)).toBe(false);
    expect(engine.canMovePiece(i, { x: 5, y: 0 })).toBe(false);
    expect(engine.canMovePiece(i, { x: 6, y: 3 })).toBe(false);
  });

  it('Trojan: expand net onto a fringe Infiltrator → Target Lock crawl (Escort-like)', () => {
    const engine = withPieces([...fringeScreen]);
    const before = engine.getPiece('b-i1')!;
    expect(engine.isPieceDetected(before)).toBe(false);
    expect(engine.canMovePiece(before, { x: 10, y: 8 })).toBe(true);

    expect(engine.movePiece('w-e3', { x: 6, y: 4 })).toBe(true);
    engine.getState().currentPlayer = PlayerColor.Black;

    const locked = engine.getPiece('b-i1')!;
    expect(engine.isPieceDetected(locked)).toBe(true);
    expect(engine.canMovePiece(locked, { x: 10, y: 8 })).toBe(false);
    // Ortho crawl — including onto the Escort that just painted them.
    expect(engine.canMovePiece(locked, { x: 6, y: 4 })).toBe(true);
    expect(engine.canMovePiece(locked, { x: 6, y: 6 })).toBe(true);
    expect(engine.canMovePiece(locked, { x: 5, y: 5 })).toBe(false); // well
    expect(engine.canMovePiece(locked, { x: 7, y: 5 })).toBe(true);
    // Not a full king: diagonal blocked while Target Locked.
    expect(engine.canMovePiece(locked, { x: 5, y: 4 })).toBe(false);
  });

  it('Trojan payoff: activated Infiltrator takes the expanding Escort', () => {
    const engine = withPieces([...fringeScreen]);
    expect(engine.movePiece('w-e3', { x: 6, y: 4 })).toBe(true);
    engine.getState().currentPlayer = PlayerColor.Black;
    expect(engine.movePiece('b-i1', { x: 6, y: 4 })).toBe(true);
    expect(engine.getPiece('w-e3')).toBeUndefined();
    expect(engine.getPiece('b-i1')?.position).toEqual({ x: 6, y: 4 });
  });

  it('refuse-expand: parked Infiltrator stays harmless to the Hub square', () => {
    const engine = withPieces([...fringeScreen], 40, PlayerColor.Black);
    expect(engine.canMovePiece(engine.getPiece('b-i1')!, { x: 5, y: 0 })).toBe(
      false,
    );
    expect(engine.isPieceDetected(engine.getPiece('b-i1')!)).toBe(false);
  });

  it('Trapdoor polarity: shrinking the net restores warp (does not strand them)', () => {
    const engine = withPieces([
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 0 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 2 },
      { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 6, y: 2 },
      { id: 'w-e3', type: PieceType.Escort, owner: PlayerColor.White, x: 6, y: 4 },
      { id: 'b-i1', type: PieceType.Infiltrator, owner: PlayerColor.Black, x: 6, y: 5 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 0, y: 10 },
    ]);
    expect(engine.isPieceDetected(engine.getPiece('b-i1')!)).toBe(true);
    expect(engine.movePiece('w-e3', { x: 6, y: 3 })).toBe(true);
    engine.getState().currentPlayer = PlayerColor.Black;
    const freed = engine.getPiece('b-i1')!;
    expect(engine.isPieceDetected(freed)).toBe(false);
    expect(engine.canMovePiece(freed, { x: 10, y: 8 })).toBe(true);
  });

  it('quarantine pair (2 Infiltrators): both natural fringe expands activate a crawler', () => {
    const engine = withPieces([
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 0 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 2 },
      { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 6, y: 2 },
      { id: 'w-e3', type: PieceType.Escort, owner: PlayerColor.White, x: 6, y: 3 },
      { id: 'w-e4', type: PieceType.Escort, owner: PlayerColor.White, x: 3, y: 2 },
      { id: 'b-i1', type: PieceType.Infiltrator, owner: PlayerColor.Black, x: 6, y: 5 },
      { id: 'b-i2', type: PieceType.Infiltrator, owner: PlayerColor.Black, x: 2, y: 4 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 0, y: 10 },
    ]);
    expect(engine.isPieceDetected(engine.getPiece('b-i1')!)).toBe(false);
    expect(engine.isPieceDetected(engine.getPiece('b-i2')!)).toBe(false);

    const filePaint = engine.clone();
    expect(filePaint.movePiece('w-e3', { x: 6, y: 4 })).toBe(true);
    expect(filePaint.isPieceDetected(filePaint.getPiece('b-i1')!)).toBe(true);

    const wingPaint = engine.clone();
    expect(wingPaint.movePiece('w-e4', { x: 3, y: 3 })).toBe(true);
    expect(wingPaint.isPieceDetected(wingPaint.getPiece('b-i2')!)).toBe(true);
  });
});
