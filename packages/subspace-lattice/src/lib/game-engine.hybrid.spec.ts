import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from './game-engine';
import { CellType, PlayerColor } from './interfaces';
import { resolveRulesConfig } from './rules/rules-config';

function oneSidedSectorEngine(
  sectorHoldPlies: number,
  sectorActivationPly: number,
): SubspaceLatticeEngine {
  const rules = resolveRulesConfig('hybrid', {
    sectorIntegrationRatio: 0.15,
    hubSensorRadius: 2,
    escortSensorRadius: 2,
    sectorHoldPlies,
    sectorActivationPly,
  });
  const setup = new SubspaceLatticeEngine({ rules });
  const state = setup.getStateCopy();
  // Keep Black mobile, but remove its relays so only White meets 15%.
  for (const [id, piece] of Object.entries(state.pieces)) {
    if (piece.owner !== PlayerColor.Black || id === 'b-ch') continue;
    const cell = state.cells.find(
      (candidate) =>
        candidate.coordinate.x === piece.position.x &&
        candidate.coordinate.y === piece.position.y,
    );
    if (cell) delete cell.pieceId;
    delete state.pieces[id];
  }
  return SubspaceLatticeEngine.fromState(state, rules);
}

describe('SubspaceLatticeEngine hybrid rules', () => {
  it('opening white sensor net includes hub radius and linked escorts', () => {
    const engine = new SubspaceLatticeEngine({ rulesVersion: 'hybrid' });
    const net = engine.getSensorNetSet(PlayerColor.White);
    expect(net.has('5,0')).toBe(true);
    expect(net.has('5,2')).toBe(true); // hub radius 3
    expect(net.has('4,0')).toBe(true);
    // Outside opening hub radius
    expect(net.has('1,0')).toBe(false);
  });

  it('Initiative Relay visibly reinforces only the first player', () => {
    const engine = new SubspaceLatticeEngine({
      rules: resolveRulesConfig('hybrid', { firstPlayerRelayCount: 1 }),
    });

    expect(engine.getPiece('w-e4')).toMatchObject({
      owner: PlayerColor.White,
      position: { x: 5, y: 3 },
    });
    expect(engine.getPiece('b-e4')).toBeUndefined();
    expect(
      engine
        .listLegalMoves(PlayerColor.White)
        .some((move) => move.pieceId === 'w-e4'),
    ).toBe(true);

    const twoRelays = new SubspaceLatticeEngine({
      rules: resolveRulesConfig('hybrid', { firstPlayerRelayCount: 2 }),
    });
    expect(twoRelays.getPiece('w-e4')?.position).toEqual({ x: 4, y: 2 });
    expect(twoRelays.getPiece('w-e5')?.position).toEqual({ x: 6, y: 2 });
  });

  it('unlinked escort does not radiate', () => {
    const engine = new SubspaceLatticeEngine({ rulesVersion: 'hybrid' });
    const state = structuredClone(engine.getState());
    // Move black escort far away and isolate it (remove other black pieces except hub+this)
    for (const id of Object.keys(state.pieces)) {
      if (id.startsWith('b-') && id !== 'b-ch' && id !== 'b-e1') {
        const p = state.pieces[id]!;
        const cell = state.cells.find(
          (c) =>
            c.coordinate.x === p.position.x && c.coordinate.y === p.position.y,
        );
        if (cell) cell.pieceId = undefined;
        delete state.pieces[id];
      }
    }
    const escort = state.pieces['b-e1']!;
    const old = state.cells.find(
      (c) =>
        c.coordinate.x === escort.position.x &&
        c.coordinate.y === escort.position.y,
    )!;
    old.pieceId = undefined;
    escort.position = { x: 0, y: 0 };
    const dest = state.cells.find(
      (c) => c.coordinate.x === 0 && c.coordinate.y === 0,
    )!;
    dest.pieceId = 'b-e1';

    const live = SubspaceLatticeEngine.fromState(state);
    const net = live.getSensorNetSet(PlayerColor.Black);
    // Hub still at 5,10 — escort at 0,0 is not linked
    expect(net.has('0,0')).toBe(false);
    expect(net.has('5,10')).toBe(true);
  });

  it('beam cannot leave or travel outside own sensor net', () => {
    const engine = new SubspaceLatticeEngine({ rulesVersion: 'hybrid' });
    const state = structuredClone(engine.getState());
    // Clear file x=4 except hub/escorts; place beam at 4,2 inside white net
    for (const id of ['w-e1', 'w-e3', 'w-i1']) {
      const p = state.pieces[id]!;
      const cell = state.cells.find(
        (c) =>
          c.coordinate.x === p.position.x && c.coordinate.y === p.position.y,
      )!;
      cell.pieceId = undefined;
      delete state.pieces[id];
    }
    const beam = state.pieces['w-b1']!;
    const old = state.cells.find(
      (c) =>
        c.coordinate.x === beam.position.x &&
        c.coordinate.y === beam.position.y,
    )!;
    old.pieceId = undefined;
    beam.position = { x: 4, y: 2 };
    const cell = state.cells.find(
      (c) => c.coordinate.x === 4 && c.coordinate.y === 2,
    )!;
    cell.pieceId = 'w-b1';

    const live = SubspaceLatticeEngine.fromState(state);
    const piece = live.getPiece('w-b1')!;
    // Stay inside net (hub covers y<=2 on this file)
    expect(live.canMovePiece(piece, { x: 4, y: 1 })).toBe(true);
    // Slide past net edge
    expect(live.canMovePiece(piece, { x: 4, y: 5 })).toBe(false);
  });

  it('infiltrator can warp to empty square outside enemy net', () => {
    const engine = new SubspaceLatticeEngine({ rulesVersion: 'hybrid' });
    const infil = engine.getPiece('w-i1')!;
    expect(engine.canMovePiece(infil, { x: 1, y: 5 })).toBe(true);
  });

  it('infiltrator cannot warp into enemy sensor net', () => {
    const engine = new SubspaceLatticeEngine({ rulesVersion: 'hybrid' });
    const infil = engine.getPiece('w-i1')!;
    // Black hub at 5,10 radiates to 5,8 etc.
    expect(engine.canMovePiece(infil, { x: 5, y: 10 })).toBe(false);
    expect(engine.canMovePiece(infil, { x: 5, y: 8 })).toBe(false);
  });

  it('detected piece is limited to one orthogonal step', () => {
    const engine = new SubspaceLatticeEngine({ rulesVersion: 'hybrid' });
    const state = structuredClone(engine.getState());
    // Place black infiltrator inside white net near hub
    const infil = state.pieces['b-i1']!;
    const old = state.cells.find(
      (c) =>
        c.coordinate.x === infil.position.x &&
        c.coordinate.y === infil.position.y,
    )!;
    old.pieceId = undefined;
    infil.position = { x: 5, y: 2 };
    const cell = state.cells.find(
      (c) => c.coordinate.x === 5 && c.coordinate.y === 2,
    )!;
    cell.pieceId = 'b-i1';
    state.currentPlayer = PlayerColor.Black;

    const live = SubspaceLatticeEngine.fromState(state);
    const piece = live.getPiece('b-i1')!;
    expect(live.isPieceDetected(piece)).toBe(true);
    // L-warp suppressed
    expect(live.canMovePiece(piece, { x: 7, y: 3 })).toBe(false);
    // Escape ortho OK
    expect(live.canMovePiece(piece, { x: 5, y: 3 })).toBe(true);
  });

  it('wins by sector integration when net covers enough of the board', () => {
    const engine = oneSidedSectorEngine(0, 0);
    expect(engine.hasSectorIntegration(PlayerColor.White)).toBe(true);

    const move = engine.listLegalMoves(PlayerColor.White)[0]!;
    expect(engine.movePiece(move.pieceId, move.to)).toBe(true);
    expect(engine.getState().winner).toBe(PlayerColor.White);
    expect(engine.getState().winnerReason).toBe('sector-integration');
  });

  it('Integration Hold delays sector win until coverage persists K plies', () => {
    const engine = oneSidedSectorEngine(3, 0);

    // White coverage starts above ratio; Black's isolated Hub is below it.
    expect(engine.hasSectorIntegration(PlayerColor.White)).toBe(true);
    expect(engine.hasSectorIntegration(PlayerColor.Black)).toBe(false);

    const playOne = (color: PlayerColor) => {
      const move = engine.listLegalMoves(color)[0]!;
      expect(engine.movePiece(move.pieceId, move.to)).toBe(true);
    };

    playOne(PlayerColor.White); // ply 1
    expect(engine.getState().winner).toBeUndefined();
    expect(
      engine.getState().sectorHoldProgress?.[PlayerColor.White],
    ).toBe(1);

    playOne(PlayerColor.Black); // ply 2
    expect(engine.getState().winner).toBeUndefined();

    playOne(PlayerColor.White); // ply 3 — White's uncontested hold is reached
    expect(engine.getState().winner).toBe(PlayerColor.White);
    expect(engine.getState().winnerReason).toBe('sector-integration');
  });

  it('does not award simultaneous activation coverage to the mover', () => {
    const engine = new SubspaceLatticeEngine({
      rules: resolveRulesConfig('hybrid', {
        sectorIntegrationRatio: 0.12,
        hubSensorRadius: 2,
        sectorHoldPlies: 1,
        sectorActivationPly: 2,
      }),
    });
    expect(engine.hasSectorIntegration(PlayerColor.White)).toBe(true);
    expect(engine.hasSectorIntegration(PlayerColor.Black)).toBe(true);

    const playOne = (color: PlayerColor) => {
      const move = engine.listLegalMoves(color)[0]!;
      expect(engine.movePiece(move.pieceId, move.to)).toBe(true);
    };

    playOne(PlayerColor.White); // ply 1: clock disarmed
    playOne(PlayerColor.Black); // ply 2: both ready as the clock activates
    expect(engine.getState().winner).toBeUndefined();
    expect(engine.getState().sectorHoldProgress).toMatchObject({
      [PlayerColor.White]: 1,
      [PlayerColor.Black]: 1,
    });

    playOne(PlayerColor.White); // still tied; White is not handed the win either
    expect(engine.getState().winner).toBeUndefined();
  });

  it('Late-game activation disarms the sector clock until the given ply', () => {
    const engine = oneSidedSectorEngine(0, 5);
    // Coverage is already ≥ ratio, but the clock is disarmed until ply 5.
    expect(engine.hasSectorIntegration(PlayerColor.White)).toBe(true);

    expect(engine.movePiece('w-ch', { x: 4, y: 1 })).toBe(true); // ply 1
    expect(engine.movePiece('b-ch', { x: 4, y: 10 })).toBe(true); // ply 2
    expect(engine.movePiece('w-ch', { x: 5, y: 0 })).toBe(true); // ply 3
    expect(engine.movePiece('b-ch', { x: 5, y: 10 })).toBe(true); // ply 4
    expect(engine.getState().winner).toBeUndefined();
    expect(engine.getState().plyCount).toBe(4);

    expect(engine.movePiece('w-ch', { x: 4, y: 1 })).toBe(true); // ply 5
    expect(engine.getState().winner).toBe(PlayerColor.White);
    expect(engine.getState().winnerReason).toBe('sector-integration');
  });

  it('Contested Space: overlapping net cells count for neither side', () => {
    const base = new SubspaceLatticeEngine({ rulesVersion: 'hybrid' });
    const state = structuredClone(base.getState());
    // Drag the black hub into white's opening net so the nets overlap.
    const hub = state.pieces['b-ch']!;
    const oldCell = state.cells.find(
      (c) =>
        c.coordinate.x === hub.position.x && c.coordinate.y === hub.position.y,
    )!;
    oldCell.pieceId = undefined;
    hub.position = { x: 4, y: 3 };
    const newCell = state.cells.find(
      (c) => c.coordinate.x === 4 && c.coordinate.y === 3,
    )!;
    newCell.pieceId = hub.id;

    const rules = resolveRulesConfig('hybrid');
    const legacy = SubspaceLatticeEngine.fromState(state, {
      ...rules,
      contestedCellsNeutral: false,
    });
    const neutral = SubspaceLatticeEngine.fromState(state, {
      ...rules,
      contestedCellsNeutral: true,
    });

    for (const color of [PlayerColor.White, PlayerColor.Black]) {
      expect(neutral.sectorControlRatio(color)).toBeLessThan(
        legacy.sectorControlRatio(color),
      );
    }
    // Legacy counting is unaffected by the flag on the other engine.
    expect(legacy.sectorControlRatio(PlayerColor.White)).toBeGreaterThan(0);
  });

  it('clone preserves custom rules knobs for search branching', () => {
    const engine = new SubspaceLatticeEngine({
      rules: {
        version: 'hybrid',
        boardSize: 11,
        sectorIntegrationRatio: 0.6,
        hubSensorRadius: 1,
        escortSensorRadius: 2,
        linkDistance: 3,
        infiltratorSpoolUp: false,
        sectorHoldPlies: 8,
        contestedCellsNeutral: true,
        sectorActivationPly: 0,
      },
    });
    const clone = engine.clone();
    expect(clone.getRules()).toEqual(engine.getRules());
    expect(clone.getRules().sectorHoldPlies).toBe(8);
    expect(clone.getRules().sectorIntegrationRatio).toBe(0.6);
  });

  it('classic still uses knight infiltrator and ignores sector win', () => {
    const engine = new SubspaceLatticeEngine({ rulesVersion: 'classic' });
    const infil = engine.getPiece('w-i1')!;
    expect(engine.canMovePiece(infil, { x: 1, y: 5 })).toBe(false);
    expect(engine.canMovePiece(infil, { x: 4, y: 2 })).toBe(true); // 3,0 → 4,2 L
    expect(engine.getCell({ x: 5, y: 5 })?.type).toBe(CellType.GravityWell);
  });
});

describe('SubspaceLatticeEngine hybrid-spool (Navigational Target Lock)', () => {
  it('announces spool then warps on the following turn', () => {
    const engine = new SubspaceLatticeEngine({ rulesVersion: 'hybrid-spool' });
    const infil = engine.getPiece('w-i1')!;
    const dest = { x: 1, y: 5 };
    expect(engine.canMovePiece(infil, dest)).toBe(true);
    expect(engine.movePiece('w-i1', dest)).toBe(true);
    expect(engine.getLastMoveInfo()?.spoolAnnounce).toBe(true);
    expect(engine.getPiece('w-i1')!.position).toEqual({ x: 3, y: 0 });
    expect(engine.getPiece('w-i1')!.spoolTarget).toEqual(dest);
    expect(engine.getState().currentPlayer).toBe(PlayerColor.Black);

    // Black burns a move
    const bMove = engine.listLegalMoves(PlayerColor.Black)[0]!;
    expect(engine.movePiece(bMove.pieceId, bMove.to)).toBe(true);

    // White execute
    expect(engine.getState().currentPlayer).toBe(PlayerColor.White);
    expect(engine.listLegalMoves(PlayerColor.White).filter((m) => m.pieceId === 'w-i1')).toEqual([
      expect.objectContaining({ pieceId: 'w-i1', to: dest }),
    ]);
    expect(engine.movePiece('w-i1', dest)).toBe(true);
    expect(engine.getLastMoveInfo()?.spoolAnnounce).toBeFalsy();
    expect(engine.getPiece('w-i1')!.position).toEqual(dest);
    expect(engine.getPiece('w-i1')!.spoolTarget).toBeUndefined();
  });

  it('failed execute consumes the turn when destination becomes illegal', () => {
    const engine = new SubspaceLatticeEngine({ rulesVersion: 'hybrid-spool' });
    // Spool toward black's back rank outside black net initially
    const dest = { x: 0, y: 8 };
    expect(engine.movePiece('w-i1', dest)).toBe(true);
    expect(engine.getPiece('w-i1')!.spoolTarget).toEqual(dest);

    // Expand black net over dest by moving hub/escorts — simpler: place a black piece's net via surgery
    // After white spool, it's black's turn. Move black hub toward dest so net covers (0,8).
    // Black hub at 5,10 with R=3 covers y=7..10 around x=5 — not (0,8).
    // Force enemy net by moving black escort chain... easiest: mutate sensor by placing enemy hub.
    // Instead: complete black turn with any move, then on white execute after we expand black net
    // by relocating black hub near dest.
    const bMove = engine.listLegalMoves(PlayerColor.Black)[0]!;
    engine.movePiece(bMove.pieceId, bMove.to);

    const live = engine.getState();
    const hub = live.pieces['b-ch']!;
    const hubCell = live.cells.find(
      (c) => c.coordinate.x === hub.position.x && c.coordinate.y === hub.position.y,
    )!;
    hubCell.pieceId = undefined;
    hub.position = { x: 0, y: 10 };
    const newCell = live.cells.find(
      (c) => c.coordinate.x === 0 && c.coordinate.y === 10,
    )!;
    newCell.pieceId = hub.id;
    // Clear other black pieces so only hub radiates
    for (const [id, p] of Object.entries(live.pieces)) {
      if (p.owner === PlayerColor.Black && id !== 'b-ch') {
        const cell = live.cells.find(
          (c) => c.coordinate.x === p.position.x && c.coordinate.y === p.position.y,
        );
        if (cell) cell.pieceId = undefined;
        delete live.pieces[id];
      }
    }
    const eng = SubspaceLatticeEngine.fromState(live);
    expect(eng.getPiece('w-i1')!.spoolTarget).toEqual(dest);
    // dest (0,8) is within hub radius 3 of (0,10)
    expect(eng.movePiece('w-i1', dest)).toBe(true);
    expect(eng.getLastMoveInfo()?.spoolFailed).toBe(true);
    expect(eng.getPiece('w-i1')!.position).toEqual({ x: 3, y: 0 });
    expect(eng.getPiece('w-i1')!.spoolTarget).toBeUndefined();
    expect(eng.getState().currentPlayer).toBe(PlayerColor.Black);
  });
});
