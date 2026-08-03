/**
 * Hub bulldozer / Rolling Storm — measure, don't assume.
 * Hub radius 3 ≈ moving exclusion + coverage blob under hybrid-fleet.
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
    [PlayerColor.White]: 5,
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

describe('Hub bulldozer (Rolling Storm) — measured', () => {
  it('Hub sensor radius is 3 on hybrid-fleet (7×7 Chebyshev disk)', () => {
    expect(rules.hubSensorRadius).toBe(3);
    const engine = withPieces([
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 0 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 0, y: 10 },
    ]);
    const net = engine.getSensorNetSet(PlayerColor.White);
    // Corner of disk from (5,0): (2,0) and (5,3) in; (5,4) out; (1,0) out.
    expect(net.has('5,0')).toBe(true);
    expect(net.has('5,3')).toBe(true);
    expect(net.has('2,0')).toBe(true);
    expect(net.has('5,4')).toBe(false);
    expect(net.has('1,0')).toBe(false);
  });

  it('marching the Hub forward grows White net size and sector ratio', () => {
    const engine = withPieces([
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 1 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 0, y: 10 },
    ]);
    const beforeSize = engine.getSensorNetSet(PlayerColor.White).size;
    const beforeSector = engine.sectorControlRatio(PlayerColor.White);
    expect(engine.movePiece('w-ch', { x: 5, y: 2 })).toBe(true);
    const afterSize = engine.getSensorNetSet(PlayerColor.White).size;
    const afterSector = engine.sectorControlRatio(PlayerColor.White);
    // Toward board center from the edge — more eligible cells enter the disk.
    expect(afterSize).toBeGreaterThan(beforeSize);
    expect(afterSector).toBeGreaterThan(beforeSector);
  });

  it('Hub march paints new exclusion: enemy Infiltrator loses a former warp square', () => {
    const engine = withPieces(
      [
        { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 1 },
        { id: 'b-i1', type: PieceType.Infiltrator, owner: PlayerColor.Black, x: 8, y: 8 },
        { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 0, y: 10 },
      ],
      40,
      PlayerColor.Black,
    );
    // (5,4) is outside Hub at (5,1) (r=3 → y≤4 actually: |4-1|=3, IN). Use (5,5) well — illegal.
    // (8,4): from Hub (5,1) chebyshev max(3,3)=3 — ON the rim, in net. Use (8,5).
    const i = engine.getPiece('b-i1')!;
    expect(engine.getSensorNetSet(PlayerColor.White).has('8,5')).toBe(false);
    expect(engine.canMovePiece(i, { x: 8, y: 5 })).toBe(true);

    // White marches Hub toward the wing.
    engine.getState().currentPlayer = PlayerColor.White;
    expect(engine.movePiece('w-ch', { x: 6, y: 2 })).toBe(true);
    engine.getState().currentPlayer = PlayerColor.Black;
    // (8,5) from Hub (6,2): max(2,3)=3 — now inside White net → warp illegal.
    expect(engine.getSensorNetSet(PlayerColor.White).has('8,5')).toBe(true);
    expect(engine.canMovePiece(engine.getPiece('b-i1')!, { x: 8, y: 5 })).toBe(
      false,
    );
  });

  it('Hub march Target-Locks a fringe Infiltrator outside the old disk', () => {
    const engine = withPieces([
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 2 },
      { id: 'b-i1', type: PieceType.Infiltrator, owner: PlayerColor.Black, x: 8, y: 6 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 0, y: 10 },
    ]);
    // (8,6) from (5,2): max(3,4)=4 > 3 — outside.
    expect(engine.isPieceDetected(engine.getPiece('b-i1')!)).toBe(false);
    expect(engine.movePiece('w-ch', { x: 6, y: 3 })).toBe(true);
    // (8,6) from (6,3): max(2,3)=3 — now locked.
    expect(engine.isPieceDetected(engine.getPiece('b-i1')!)).toBe(true);
  });

  it('Hub walk resets EMP charge when not in Terminal; charges when both Hubs are lone', () => {
    // Fat fleets: Hub step clears midgame charge.
    const fat = withPieces([
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 1 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 5, y: 2 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 0, y: 10 },
      { id: 'b-e1', type: PieceType.Escort, owner: PlayerColor.Black, x: 0, y: 9 },
    ]);
    fat.getState().empCharge = {
      [PlayerColor.White]: 5,
      [PlayerColor.Black]: 0,
    };
    expect(fat.isTerminalOverclock(PlayerColor.White)).toBe(false);
    expect(fat.movePiece('w-ch', { x: 5, y: 0 })).toBe(true);
    expect(fat.getEmpCharge(PlayerColor.White)).toBe(0);

    // Lone Hubs: Terminal Overclock — Hub steps *add* charge (bulldozer ≠ free).
    const lone = withPieces([
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 5, y: 1 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 0, y: 10 },
    ]);
    lone.getState().empCharge = {
      [PlayerColor.White]: 5,
      [PlayerColor.Black]: 0,
    };
    expect(lone.isTerminalOverclock(PlayerColor.White)).toBe(true);
    expect(lone.movePiece('w-ch', { x: 5, y: 2 })).toBe(true);
    expect(lone.getEmpCharge(PlayerColor.White)).toBe(6);
  });

  it('Hub that marches onto an enemy Escort capture square can be taken next', () => {
    const engine = withPieces([
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 4, y: 4 },
      { id: 'b-e1', type: PieceType.Escort, owner: PlayerColor.Black, x: 4, y: 6 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 9, y: 9 },
    ]);
    expect(engine.movePiece('w-ch', { x: 4, y: 5 })).toBe(true);
    engine.getState().currentPlayer = PlayerColor.Black;
    expect(engine.canMovePiece(engine.getPiece('b-e1')!, { x: 4, y: 5 })).toBe(
      true,
    );
    expect(engine.movePiece('b-e1', { x: 4, y: 5 })).toBe(true);
    expect(engine.getState().winner).toBe(PlayerColor.Black);
    expect(engine.getState().winnerReason).toBe('hub-capture');
  });

  it('lone Hub king-step grows sector; dark Escort tip does not; linked rim tip does', () => {
    const hubMarch = withPieces([
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 2, y: 2 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 10, y: 10 },
    ]);
    const hubBefore = hubMarch.sectorControlRatio(PlayerColor.White);
    expect(hubMarch.movePiece('w-ch', { x: 3, y: 3 })).toBe(true);
    const hubDelta =
      hubMarch.sectorControlRatio(PlayerColor.White) - hubBefore;
    expect(hubDelta).toBeGreaterThan(0);

    // Unlinked Escort beyond linkDistance paints nothing.
    const dark = withPieces([
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 2, y: 2 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 2, y: 5 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 10, y: 10 },
    ]);
    const darkBefore = dark.sectorControlRatio(PlayerColor.White);
    expect(dark.movePiece('w-e1', { x: 2, y: 6 })).toBe(true);
    expect(dark.sectorControlRatio(PlayerColor.White) - darkBefore).toBe(0);

    // Linked chain to the rim: tip step outward grows coverage.
    const fringe = withPieces([
      { id: 'w-ch', type: PieceType.CommandHub, owner: PlayerColor.White, x: 2, y: 2 },
      { id: 'w-e1', type: PieceType.Escort, owner: PlayerColor.White, x: 2, y: 3 },
      { id: 'w-e2', type: PieceType.Escort, owner: PlayerColor.White, x: 2, y: 4 },
      { id: 'w-e3', type: PieceType.Escort, owner: PlayerColor.White, x: 2, y: 5 },
      { id: 'b-ch', type: PieceType.CommandHub, owner: PlayerColor.Black, x: 10, y: 10 },
    ]);
    const fringeBefore = fringe.sectorControlRatio(PlayerColor.White);
    expect(fringe.movePiece('w-e3', { x: 2, y: 6 })).toBe(true);
    const fringeDelta =
      fringe.sectorControlRatio(PlayerColor.White) - fringeBefore;
    expect(fringeDelta).toBeGreaterThan(0);
    expect(hubDelta).toBeGreaterThan(fringeDelta);
  });
});
