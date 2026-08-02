/**
 * Frozen Terminal Overclock / Lockout positions for AI regression and CI smoke.
 * Keep these small and deterministic — not a full endgame tablebase.
 */
import { SubspaceLatticeEngine } from '../game-engine';
import { CellType } from '../interfaces/cellType';
import type { GameState } from '../interfaces/gameState';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { resolveRulesConfig, type RulesConfig } from '../rules/rules-config';

export const TERMINAL_GOLDEN_RULES: RulesConfig = resolveRulesConfig(
  'hybrid-fleet',
  {
    empRadius: 3,
    empChargeTarget: 15,
    terminalOverclock: true,
    terminalRequiresBothLone: true,
    terminalSharedPhaseClock: true,
    terminalPhaseEntryKomi: 0,
    terminalEmpChargeTarget: 3,
    sectorActivationPly: 10_000,
    firstPlayerRelayCount: 0,
  },
);

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

export interface TerminalGolden {
  id: string;
  description: string;
  rules: RulesConfig;
  state: GameState;
  /** Expected agent action. */
  expect: 'emp' | 'not-emp' | 'hub-closer';
}

/** Armed EMP, enemy Hub in radius — Lockout fire wins immediately. */
export function terminalLockoutInRange(): TerminalGolden {
  const state = bareBoard(TERMINAL_GOLDEN_RULES);
  place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 2, 2);
  place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 2, 4);
  state.terminalPhaseArmed = true;
  state.terminalPhaseArmedAtPly = 40;
  state.empCharge = { [PlayerColor.White]: 3, [PlayerColor.Black]: 0 };
  return {
    id: 'terminal-lockout-in-range',
    description: 'Fire EMP for immediate Lockout (enemy Hub in radius)',
    rules: TERMINAL_GOLDEN_RULES,
    state,
    expect: 'emp',
  };
}

/** Armed EMP, enemy Hub just outside radius — must not suicide-fire. */
export function terminalMissOutOfRange(): TerminalGolden {
  const state = bareBoard(TERMINAL_GOLDEN_RULES);
  // Chebyshev 4 vs blast r=3: Black sits one ring outside the cyan disc.
  place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 4, 4);
  place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 4, 8);
  state.terminalPhaseArmed = true;
  state.terminalPhaseArmedAtPly = 40;
  state.empCharge = { [PlayerColor.White]: 3, [PlayerColor.Black]: 0 };
  return {
    id: 'terminal-miss-out-of-range',
    description: 'Do not fire EMP when enemy Hub is outside blast radius',
    rules: TERMINAL_GOLDEN_RULES,
    state,
    expect: 'not-emp',
  };
}

/** Charging Terminal — one Hub step both charges and enters blast range. */
export function terminalCloseForBlast(): TerminalGolden {
  const state = bareBoard(TERMINAL_GOLDEN_RULES);
  // Dist 4 → step to (4,6) for dist 3 (inside r=3) while charging 1→2.
  place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 4, 5);
  place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 4, 9);
  state.terminalPhaseArmed = true;
  state.terminalPhaseArmedAtPly = 40;
  state.empCharge = { [PlayerColor.White]: 1, [PlayerColor.Black]: 0 };
  return {
    id: 'terminal-close-for-blast',
    description: 'Hub step should reduce Chebyshev distance toward enemy Hub',
    rules: TERMINAL_GOLDEN_RULES,
    state,
    expect: 'hub-closer',
  };
}

export const TERMINAL_GOLDENS: TerminalGolden[] = [
  terminalLockoutInRange(),
  terminalMissOutOfRange(),
  terminalCloseForBlast(),
];

export function engineFromGolden(g: TerminalGolden): SubspaceLatticeEngine {
  return SubspaceLatticeEngine.fromState(g.state, g.rules);
}
