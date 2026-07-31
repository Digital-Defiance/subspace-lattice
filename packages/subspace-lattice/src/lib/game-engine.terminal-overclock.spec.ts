import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from './game-engine';
import { CellType } from './interfaces/cellType';
import { PieceType } from './interfaces/pieceType';
import { PlayerColor } from './interfaces/playerColor';
import { resolveRulesConfig } from './rules/rules-config';
import type { GameState } from './interfaces/gameState';
import type { RulesConfig } from './rules/rules-config';

function bareBoard(rules: RulesConfig): GameState {
  const engine = new SubspaceLatticeEngine({ rules });
  const state = engine.getStateCopy();
  for (const c of state.cells) delete c.pieceId;
  state.pieces = {};
  state.currentPlayer = PlayerColor.White;
  state.plyCount = 40;
  state.empCharge = {
    [PlayerColor.White]: 0,
    [PlayerColor.Black]: 0,
  };
  delete state.winner;
  delete state.winnerReason;
  delete state.empActive;
  delete state.terminalPhaseArmed;
  delete state.terminalPhaseArmedAtPly;
  return state;
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
  if (!cell || cell.type === CellType.GravityWell) {
    throw new Error(`bad cell ${x},${y}`);
  }
  cell.pieceId = id;
}

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

describe('Terminal Overclock', () => {
  it('charges on lone-Hub moves instead of resetting (both lone)', () => {
    const state = bareBoard(terminalRules);
    place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 1, 1);
    place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 9, 9);
    const live = SubspaceLatticeEngine.fromState(state, terminalRules);
    expect(live.isTerminalOverclock(PlayerColor.White)).toBe(true);
    expect(live.getState().terminalPhaseArmed).toBe(true);

    expect(live.movePiece('w-ch', { x: 1, y: 2 })).toBe(true);
    expect(live.getEmpCharge(PlayerColor.White)).toBe(1);
    expect(live.movePiece('b-ch', { x: 9, y: 8 })).toBe(true);
    expect(live.movePiece('w-ch', { x: 1, y: 3 })).toBe(true);
    expect(live.getEmpCharge(PlayerColor.White)).toBe(2);
  });

  it('does not Terminal-charge while the opponent still has ships', () => {
    const state = bareBoard(terminalRules);
    place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 1, 1);
    place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 9, 9);
    place(state, 'b-e1', PieceType.Escort, PlayerColor.Black, 9, 8);
    const live = SubspaceLatticeEngine.fromState(state, terminalRules);
    expect(live.isTerminalOverclock(PlayerColor.White)).toBe(false);
    expect(live.isLoneCommandHub(PlayerColor.White)).toBe(true);

    expect(live.movePiece('w-ch', { x: 1, y: 2 })).toBe(true);
    expect(live.getEmpCharge(PlayerColor.White)).toBe(0);
  });

  it('still resets Hub charge when any friendly ship remains', () => {
    const state = bareBoard(terminalRules);
    place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 1, 1);
    place(state, 'w-e1', PieceType.Escort, PlayerColor.White, 2, 1);
    place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 9, 9);
    const live = SubspaceLatticeEngine.fromState(state, terminalRules);
    expect(live.isTerminalOverclock(PlayerColor.White)).toBe(false);

    expect(live.movePiece('w-e1', { x: 2, y: 2 })).toBe(true);
    expect(live.getEmpCharge(PlayerColor.White)).toBe(1);
    live.movePiece('b-ch', { x: 9, y: 8 });
    expect(live.movePiece('w-ch', { x: 1, y: 2 })).toBe(true);
    expect(live.getEmpCharge(PlayerColor.White)).toBe(0);
  });

  it('hit: Lockout for firer even though own Hub is fused', () => {
    const state = bareBoard(terminalRules);
    place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 2, 2);
    place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 2, 4);
    state.terminalPhaseArmed = true;
    state.empCharge = { [PlayerColor.White]: 3, [PlayerColor.Black]: 0 };
    const live = SubspaceLatticeEngine.fromState(state, terminalRules);
    expect(live.canFireEmp()).toBe(true);
    expect(live.fireEmp()).toBe(true);
    expect(live.getPiece('w-ch')?.enginesFused).toBe(true);
    expect(live.getState().winner).toBe(PlayerColor.White);
    expect(live.getState().winnerReason).toBe('no-moves');
  });

  it('miss: firer fused; opponent wins Lockout after their reply', () => {
    const state = bareBoard(terminalRules);
    place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 0, 0);
    place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 10, 10);
    state.terminalPhaseArmed = true;
    state.empCharge = { [PlayerColor.White]: 3, [PlayerColor.Black]: 0 };
    const live = SubspaceLatticeEngine.fromState(state, terminalRules);
    expect(live.fireEmp()).toBe(true);
    expect(live.getState().winner).toBeUndefined();
    expect(live.getPiece('w-ch')?.enginesFused).toBe(true);
    expect(live.listLegalMoves(PlayerColor.White)).toEqual([]);
    expect(live.listLegalMoves(PlayerColor.Black).length).toBeGreaterThan(0);

    const escape = live.listLegalMoves(PlayerColor.Black)[0]!;
    expect(live.movePiece(escape.pieceId, escape.to)).toBe(true);
    expect(live.getState().winner).toBe(PlayerColor.Black);
    expect(live.getState().winnerReason).toBe('no-moves');
  });

  it('entry komi credits the side not to move when the phase arms', () => {
    const rules = resolveRulesConfig('hybrid-fleet', {
      ...terminalRules,
      terminalPhaseEntryKomi: 1,
    });
    const state = bareBoard(rules);
    place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 1, 1);
    place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 9, 9);
    state.currentPlayer = PlayerColor.White;
    const live = SubspaceLatticeEngine.fromState(state, rules);
    expect(live.getState().terminalPhaseArmed).toBe(true);
    expect(live.getEmpCharge(PlayerColor.White)).toBe(0);
    expect(live.getEmpCharge(PlayerColor.Black)).toBe(1);
  });

  it('non-Terminal EMP does not fuse the firer', () => {
    const rules = resolveRulesConfig('hybrid-fleet', {
      empRadius: 1,
      empChargeTarget: 1,
      terminalOverclock: true,
      terminalRequiresBothLone: true,
      sectorActivationPly: 10_000,
      firstPlayerRelayCount: 0,
    });
    const state = bareBoard(rules);
    place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 2, 2);
    place(state, 'w-e1', PieceType.Escort, PlayerColor.White, 8, 8);
    place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 2, 3);
    place(state, 'b-e1', PieceType.Escort, PlayerColor.Black, 9, 9);
    state.empCharge = { [PlayerColor.White]: 1, [PlayerColor.Black]: 0 };
    const live = SubspaceLatticeEngine.fromState(state, rules);
    expect(live.isTerminalOverclock(PlayerColor.White)).toBe(false);
    expect(live.fireEmp()).toBe(true);
    expect(live.getPiece('w-ch')?.enginesFused).toBeUndefined();
    expect(live.getState().winner).toBeUndefined();
  });

  it('uses terminalEmpChargeTarget while Overclocking', () => {
    const state = bareBoard(terminalRules);
    place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 1, 1);
    place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 9, 9);
    const live = SubspaceLatticeEngine.fromState(state, terminalRules);
    expect(live.getEmpChargeTarget(PlayerColor.White)).toBe(3);
    expect(live.getEmpChargeTarget(PlayerColor.Black)).toBe(3);
  });

  it('grows Terminal EMP radius every X shared-phase plies (thermal runaway)', () => {
    const rules = resolveRulesConfig('hybrid-fleet', {
      ...terminalRules,
      terminalEmpRadiusGrowthInterval: 5,
      terminalEmpRadiusMax: 10,
    });
    const state = bareBoard(rules);
    place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 1, 1);
    place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 9, 9);
    state.plyCount = 40;
    const live = SubspaceLatticeEngine.fromState(state, rules);
    expect(live.getState().terminalPhaseArmedAtPly).toBe(40);
    expect(live.getEmpRadius(PlayerColor.White)).toBe(3);

    // 5 completed plies → age 5 → +1 radius
    const path: Array<[string, { x: number; y: number }]> = [
      ['w-ch', { x: 1, y: 2 }],
      ['b-ch', { x: 9, y: 8 }],
      ['w-ch', { x: 1, y: 3 }],
      ['b-ch', { x: 9, y: 7 }],
      ['w-ch', { x: 1, y: 4 }],
    ];
    for (const [id, to] of path) {
      expect(live.movePiece(id, to)).toBe(true);
    }
    expect(live.getTerminalPhaseAge()).toBe(5);
    expect(live.getEmpRadius(PlayerColor.White)).toBe(4);

    // Jump age to 35 (7×5) → r = min(10, 3+7) = 10
    const s = live.getState();
    s.plyCount = (s.terminalPhaseArmedAtPly ?? 0) + 35;
    const aged = SubspaceLatticeEngine.fromState(s, rules);
    expect(aged.getEmpRadius(PlayerColor.White)).toBe(10);
    expect(aged.getEmpRadius(PlayerColor.Black)).toBe(10);
  });

  it('resolves Sector Integration before Lockout when both apply', () => {
    const rules = resolveRulesConfig('hybrid-fleet', {
      empRadius: 4,
      empChargeTarget: 1,
      terminalOverclock: true,
      terminalRequiresBothLone: true,
      terminalSharedPhaseClock: true,
      terminalPhaseEntryKomi: 0,
      terminalEmpChargeTarget: 1,
      terminalEmpRadius: 4,
      sectorActivationPly: 0,
      sectorHoldPlies: 0,
      sectorIntegrationRatio: 0.35,
      contestedCellsNeutral: false,
      firstPlayerRelayCount: 0,
    });
    const state = bareBoard(rules);
    place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 4, 4);
    place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 0, 0);
    state.plyCount = 0;
    state.terminalPhaseArmed = true;
    state.empCharge = { [PlayerColor.White]: 1, [PlayerColor.Black]: 0 };
    const live = SubspaceLatticeEngine.fromState(state, rules);
    expect(live.fireEmp()).toBe(true);
    expect(live.getState().winnerReason).toBe('sector-integration');
    expect(live.getState().winner).toBe(PlayerColor.White);
  });
});
