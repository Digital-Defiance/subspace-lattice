import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from './game-engine';
import { CellType, PieceType, PlayerColor } from './interfaces';
import { resolveRulesConfig } from './rules/rules-config';

const fleetBase = () =>
  resolveRulesConfig('hybrid-fleet', {
    heavyUnitDraft: 'refractor-carrier',
    carrierRequiresHubAnchor: true,
  });

describe('heavy-unit draft (Refractor / Carrier)', () => {
  it('places Refractor + Carrier on wing files instead of Beams', () => {
    const engine = new SubspaceLatticeEngine({ rules: fleetBase() });
    const state = engine.getState();
    expect(state.pieces['w-h1']?.type).toBe(PieceType.Refractor);
    expect(state.pieces['w-h2']?.type).toBe(PieceType.Carrier);
    expect(state.pieces['w-h1']?.position).toEqual({ x: 2, y: 0 });
    expect(state.pieces['w-h2']?.position).toEqual({ x: 8, y: 0 });
    expect(state.pieces['b-h1']?.type).toBe(PieceType.Refractor);
    expect(state.pieces['b-h2']?.type).toBe(PieceType.Carrier);
  });

  it('honors custom heavyUnitFiles', () => {
    const engine = new SubspaceLatticeEngine({
      rules: resolveRulesConfig('hybrid-fleet', {
        heavyUnitDraft: 'refractor-pair',
        heavyUnitFiles: [1, 9],
      }),
    });
    expect(engine.getPiece('w-h1')?.position).toEqual({ x: 1, y: 0 });
    expect(engine.getPiece('w-h2')?.position).toEqual({ x: 9, y: 0 });
    expect(engine.getPiece('w-h1')?.type).toBe(PieceType.Refractor);
    expect(engine.getPiece('w-h2')?.type).toBe(PieceType.Refractor);
  });

  it('allows Refractor diagonal slide inside own Sensor Net', () => {
    const engine = new SubspaceLatticeEngine({
      rules: resolveRulesConfig('hybrid', {
        heavyUnitDraft: 'refractor-pair',
        heavyUnitFiles: [2, 8],
      }),
    });
    // Clear a diagonal corridor inside White's opening hub net: (2,0)→(3,1)→(4,2)
    // Escort at (4,0) and (5,1) leave (3,1)/(4,2) empty; hub radiates r=3.
    const refractor = engine.getPiece('w-h1')!;
    expect(refractor.type).toBe(PieceType.Refractor);
    expect(engine.isPieceDetected(refractor)).toBe(false);

    const legal = engine
      .listLegalMoves(PlayerColor.White)
      .filter((m) => m.pieceId === 'w-h1');
    // (3,1) is one diagonal step into the hub radiation square.
    expect(legal.some((m) => m.to.x === 3 && m.to.y === 1)).toBe(true);
  });

  it('blocks Refractor path through Gravity Well corners only if well is on path', () => {
    // Place Refractor at (4,4) aiming through (5,5) well to (6,6) — illegal.
    // Hub at (5,3) so (4,4)/(3,3) sit inside hub radiation.
    const engine = new SubspaceLatticeEngine({
      rules: resolveRulesConfig('hybrid', { heavyUnitDraft: 'refractor-pair' }),
    });
    const state = engine.getStateCopy();
    for (const p of Object.values(state.pieces)) {
      const cell = state.cells.find(
        (c) => c.coordinate.x === p.position.x && c.coordinate.y === p.position.y,
      );
      if (cell) cell.pieceId = undefined;
    }
    state.pieces = {
      'w-ch': {
        id: 'w-ch',
        type: PieceType.CommandHub,
        owner: PlayerColor.White,
        position: { x: 5, y: 3 },
      },
      'w-h1': {
        id: 'w-h1',
        type: PieceType.Refractor,
        owner: PlayerColor.White,
        position: { x: 4, y: 4 },
      },
      'b-ch': {
        id: 'b-ch',
        type: PieceType.CommandHub,
        owner: PlayerColor.Black,
        position: { x: 5, y: 10 },
      },
    };
    for (const p of Object.values(state.pieces)) {
      const cell = state.cells.find(
        (c) => c.coordinate.x === p.position.x && c.coordinate.y === p.position.y,
      );
      if (cell) cell.pieceId = p.id;
    }
    const well = state.cells.find(
      (c) => c.coordinate.x === 5 && c.coordinate.y === 5,
    )!;
    expect(well.type).toBe(CellType.GravityWell);

    const live = SubspaceLatticeEngine.fromState(
      state,
      resolveRulesConfig('hybrid', { heavyUnitDraft: 'refractor-pair' }),
    );
    const legal = live
      .listLegalMoves(PlayerColor.White)
      .filter((m) => m.pieceId === 'w-h1');
    expect(legal.some((m) => m.to.x === 6 && m.to.y === 6)).toBe(false);
    // Corner-bypass: (3,3)←(4,4) does not hit the well.
    expect(legal.some((m) => m.to.x === 3 && m.to.y === 3)).toBe(true);
  });

  it('Target-Locks Refractor/Carrier to one orthogonal step', () => {
    const engine = new SubspaceLatticeEngine({
      rules: resolveRulesConfig('hybrid', {
        heavyUnitDraft: 'refractor-carrier',
        carrierRequiresHubAnchor: false,
      }),
    });
    const state = engine.getStateCopy();
    // Park White Carrier inside Black's hub radiation.
    const carrier = state.pieces['w-h2']!;
    const fromCell = state.cells.find(
      (c) =>
        c.coordinate.x === carrier.position.x &&
        c.coordinate.y === carrier.position.y,
    )!;
    fromCell.pieceId = undefined;
    carrier.position = { x: 5, y: 9 };
    const toCell = state.cells.find(
      (c) => c.coordinate.x === 5 && c.coordinate.y === 9,
    )!;
    toCell.pieceId = carrier.id;

    const live = SubspaceLatticeEngine.fromState(
      state,
      resolveRulesConfig('hybrid', {
        heavyUnitDraft: 'refractor-carrier',
        carrierRequiresHubAnchor: false,
      }),
    );
    expect(live.isPieceDetected(live.getPiece('w-h2')!)).toBe(true);
    const legal = live
      .listLegalMoves(PlayerColor.White)
      .filter((m) => m.pieceId === 'w-h2');
    for (const m of legal) {
      const dx = Math.abs(m.to.x - 5);
      const dy = Math.abs(m.to.y - 9);
      expect((dx === 1 && dy === 0) || (dx === 0 && dy === 1)).toBe(true);
    }
  });

  it('Carrier hub-anchor depowers slides outside hub radiation', () => {
    const rules = resolveRulesConfig('hybrid', {
      heavyUnitDraft: 'carrier-beam',
      carrierRequiresHubAnchor: true,
      heavyUnitFiles: [0, 8],
    });
    const engine = new SubspaceLatticeEngine({ rules });
    // File 0 is Chebyshev 5 from hub at (5,0) — outside hub3.
    const carrier = engine.getPiece('w-h1')!;
    expect(carrier.type).toBe(PieceType.Carrier);
    expect(
      Math.max(
        Math.abs(carrier.position.x - 5),
        Math.abs(carrier.position.y - 0),
      ),
    ).toBeGreaterThan(3);

    const legal = engine
      .listLegalMoves(PlayerColor.White)
      .filter((m) => m.pieceId === 'w-h1');
    for (const m of legal) {
      const dx = Math.abs(m.to.x - carrier.position.x);
      const dy = Math.abs(m.to.y - carrier.position.y);
      expect(dx <= 1 && dy <= 1 && (dx > 0 || dy > 0)).toBe(true);
    }
  });
});
