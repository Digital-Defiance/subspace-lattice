import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from './game-engine';
import { CellType } from './interfaces/cellType';
import { PieceType } from './interfaces/pieceType';
import { PlayerColor } from './interfaces/playerColor';
import { resolveRulesConfig } from './rules/rules-config';

describe('Command Overload (EMP)', () => {
  const empRules = resolveRulesConfig('hybrid-fleet', {
    empRadius: 2,
    empChargeTarget: 3,
    sectorActivationPly: 10_000,
  });

  it('charges on non-Hub moves and resets when the Hub moves', () => {
    const engine = new SubspaceLatticeEngine({ rules: empRules });
    expect(engine.getEmpCharge(PlayerColor.White)).toBe(0);

    const escort = engine.listLegalMoves(PlayerColor.White).find(
      (m) => m.pieceId === 'w-e3',
    )!;
    expect(engine.movePiece(escort.pieceId, escort.to)).toBe(true);
    expect(engine.getEmpCharge(PlayerColor.White)).toBe(1);

    const bMove = engine.listLegalMoves(PlayerColor.Black)[0]!;
    expect(engine.movePiece(bMove.pieceId, bMove.to)).toBe(true);

    const escort2 = engine.listLegalMoves(PlayerColor.White).find(
      (m) => m.pieceId.startsWith('w-e'),
    )!;
    expect(engine.movePiece(escort2.pieceId, escort2.to)).toBe(true);
    expect(engine.getEmpCharge(PlayerColor.White)).toBe(2);

    const black2 = engine.listLegalMoves(PlayerColor.Black)[0]!;
    engine.movePiece(black2.pieceId, black2.to);

    const hubMove = engine.listLegalMoves(PlayerColor.White).find(
      (m) => m.pieceId === 'w-ch',
    )!;
    expect(engine.movePiece(hubMove.pieceId, hubMove.to)).toBe(true);
    expect(engine.getEmpCharge(PlayerColor.White)).toBe(0);
  });

  it('fires EMP and awards Lockout when the enemy fleet is fully disabled', () => {
    const rules = resolveRulesConfig('hybrid-fleet', {
      empRadius: 1,
      empChargeTarget: 1,
      terminalEmpChargeTarget: 1,
      sectorActivationPly: 10_000,
      firstPlayerRelayCount: 0,
    });
    const engine = new SubspaceLatticeEngine({ rules });
    const state = engine.getStateCopy();
    for (const c of state.cells) delete c.pieceId;
    state.pieces = {};
    state.currentPlayer = PlayerColor.White;
    state.plyCount = 40;
    state.empCharge = {
      [PlayerColor.White]: 1,
      [PlayerColor.Black]: 0,
    };
    delete state.winner;
    delete state.winnerReason;
    delete state.empActive;

    const place = (
      id: string,
      type: PieceType,
      owner: PlayerColor,
      x: number,
      y: number,
    ) => {
      state.pieces[id] = { id, type, owner, position: { x, y } };
      const cell = state.cells.find(
        (c) => c.coordinate.x === x && c.coordinate.y === y,
      );
      if (!cell || cell.type === CellType.GravityWell) {
        throw new Error(`bad cell ${x},${y}`);
      }
      cell.pieceId = id;
    };

    place('w-ch', PieceType.CommandHub, PlayerColor.White, 2, 2);
    place('b-ch', PieceType.CommandHub, PlayerColor.Black, 2, 3);
    place('b-e1', PieceType.Escort, PlayerColor.Black, 3, 2);

    const live = SubspaceLatticeEngine.fromState(state, rules);
    expect(live.canFireEmp(PlayerColor.White)).toBe(true);
    expect(live.fireEmp()).toBe(true);
    expect(live.getLastMoveInfo()?.empFired).toBe(true);
    expect(live.getState().winner).toBe(PlayerColor.White);
    expect(live.getState().winnerReason).toBe('no-moves');
  });

  it('seizes only enemy engines in radius, for one reply ply', () => {
    const rules = resolveRulesConfig('hybrid-fleet', {
      empRadius: 1,
      empChargeTarget: 1,
      empBlackoutPlies: 1,
      sectorActivationPly: 10_000,
      firstPlayerRelayCount: 0,
    });
    const engine = new SubspaceLatticeEngine({ rules });
    const state = engine.getStateCopy();
    for (const c of state.cells) delete c.pieceId;
    state.pieces = {};
    state.currentPlayer = PlayerColor.White;
    state.plyCount = 40;
    state.empCharge = { [PlayerColor.White]: 1, [PlayerColor.Black]: 0 };

    const place = (
      id: string,
      type: PieceType,
      owner: PlayerColor,
      x: number,
      y: number,
    ) => {
      state.pieces[id] = { id, type, owner, position: { x, y } };
      const cell = state.cells.find(
        (c) => c.coordinate.x === x && c.coordinate.y === y,
      )!;
      cell.pieceId = id;
    };

    place('w-ch', PieceType.CommandHub, PlayerColor.White, 2, 2);
    place('w-e1', PieceType.Escort, PlayerColor.White, 3, 2); // friendly in radius
    place('b-ch', PieceType.CommandHub, PlayerColor.Black, 2, 3);
    place('b-e1', PieceType.Escort, PlayerColor.Black, 9, 9); // outside

    const live = SubspaceLatticeEngine.fromState(state, rules);
    expect(live.fireEmp()).toBe(true);
    expect(live.getState().winner).toBeUndefined();
    expect(live.getState().empActive?.targetSide).toBe(PlayerColor.Black);
    // Firing fleet is never in its own blast — no immunity special case needed.
    expect(live.isEmpDisabled(live.getPiece('w-ch')!)).toBe(false);
    expect(live.isEmpDisabled(live.getPiece('w-e1')!)).toBe(false);
    expect(live.isEmpDisabled(live.getPiece('b-ch')!)).toBe(true);
    expect(live.isEmpDisabled(live.getPiece('b-e1')!)).toBe(false);

    const escape = live.listLegalMoves(PlayerColor.Black);
    expect(escape.every((m) => m.pieceId === 'b-e1')).toBe(true);
    expect(live.movePiece(escape[0]!.pieceId, escape[0]!.to)).toBe(true);
    expect(live.getState().empActive).toBeUndefined();
    expect(live.isEmpDisabled(live.getPiece('b-ch')!)).toBe(false);
  });

  it('empBlackoutPlies extends the freeze across multiple enemy replies', () => {
    const rules = resolveRulesConfig('hybrid-fleet', {
      empRadius: 1,
      empChargeTarget: 1,
      empBlackoutPlies: 2,
      sectorActivationPly: 10_000,
      firstPlayerRelayCount: 0,
    });
    const engine = new SubspaceLatticeEngine({ rules });
    const state = engine.getStateCopy();
    for (const c of state.cells) delete c.pieceId;
    state.pieces = {};
    state.currentPlayer = PlayerColor.White;
    state.plyCount = 40;
    state.empCharge = { [PlayerColor.White]: 1, [PlayerColor.Black]: 0 };

    const place = (
      id: string,
      type: PieceType,
      owner: PlayerColor,
      x: number,
      y: number,
    ) => {
      state.pieces[id] = { id, type, owner, position: { x, y } };
      const cell = state.cells.find(
        (c) => c.coordinate.x === x && c.coordinate.y === y,
      )!;
      cell.pieceId = id;
    };

    place('w-ch', PieceType.CommandHub, PlayerColor.White, 2, 2);
    place('w-e1', PieceType.Escort, PlayerColor.White, 8, 8);
    place('b-ch', PieceType.CommandHub, PlayerColor.Black, 2, 3);
    place('b-e1', PieceType.Escort, PlayerColor.Black, 9, 9);

    const live = SubspaceLatticeEngine.fromState(state, rules);
    expect(live.fireEmp()).toBe(true);
    expect(live.getState().empActive?.pliesRemaining).toBe(2);

    // Black burns one blackout ply with a ship outside the blast.
    const first = live.listLegalMoves(PlayerColor.Black)[0]!;
    expect(live.movePiece(first.pieceId, first.to)).toBe(true);
    expect(live.getState().empActive?.pliesRemaining).toBe(1);
    expect(live.isEmpDisabled(live.getPiece('b-ch')!)).toBe(true);

    // White's own move must not shorten its blast.
    const wm = live.listLegalMoves(PlayerColor.White)[0]!;
    expect(live.movePiece(wm.pieceId, wm.to)).toBe(true);
    expect(live.getState().empActive?.pliesRemaining).toBe(1);

    const second = live.listLegalMoves(PlayerColor.Black)[0]!;
    expect(live.movePiece(second.pieceId, second.to)).toBe(true);
    expect(live.getState().empActive).toBeUndefined();
  });
});

describe('resign', () => {
  it('awards the opponent with winnerReason resign', () => {
    const engine = new SubspaceLatticeEngine({
      rules: resolveRulesConfig('hybrid-fleet'),
    });
    expect(engine.resign(PlayerColor.White)).toBe(true);
    expect(engine.getState().winner).toBe(PlayerColor.Black);
    expect(engine.getState().winnerReason).toBe('resign');
    expect(engine.resign(PlayerColor.Black)).toBe(false);
  });

  it('supports ai-resigned winnerReason for Grandmaster resignation', () => {
    const engine = new SubspaceLatticeEngine({
      rules: resolveRulesConfig('hybrid-fleet'),
    });
    expect(engine.resign(PlayerColor.Black, 'ai-resigned')).toBe(true);
    expect(engine.getState().winner).toBe(PlayerColor.White);
    expect(engine.getState().winnerReason).toBe('ai-resigned');
  });
});
