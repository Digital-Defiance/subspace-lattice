import { Cell } from './cell';
import { Coordinate } from './coordinate';
import { Piece } from './piece';
import { PlayerColor } from './playerColor';
import { RulesVersion } from './rulesVersion';

export type WinnerReason =
  | 'hub-capture'
  | 'no-moves'
  | 'sector-integration'
  | 'resign'
  /** Local AI conceded a mathematically forced loss (Grandmaster resignation). */
  | 'ai-resigned';

/** Lobby-tunable knobs persisted on GameState (see RulesConfig). */
export interface GameRulesOverrides {
  infiltratorSpoolUp?: boolean;
  infiltratorActivationPly?: number;
  sectorActivationPly?: number;
  heavyWingPreset?: 'standard' | 'refractor-wing' | 'fleet-draft';
  /** EMP blast Chebyshev radius (0 = EMP disabled). */
  empRadius?: number;
  /** Non-Hub plies with a stationary Hub required to arm EMP (0 = disabled). */
  empChargeTarget?: number;
  /** Enemy reply plies the blackout lasts (default 1). */
  empBlackoutPlies?: number;
  /**
   * Terminal Overclock: plies between +1 EMP radius growth (thermal runaway).
   * Lobby options 3–10; fleet default 5.
   */
  terminalEmpRadiusGrowthInterval?: number;
}

/** Active Command Overload blast — engine blackout on enemy ships in radius. */
export interface EmpActive {
  origin: Coordinate;
  radius: number;
  /** Side that detonated. Its own fleet is never in the blast. */
  firedBy: PlayerColor;
  /** Side whose engines are seized (the opponent of `firedBy`). */
  targetSide: PlayerColor;
  /** Reply plies of blackout still owed to `targetSide`. */
  pliesRemaining: number;
}

export interface GameState {
  boardSize: number;
  cells: Cell[];
  pieces: Record<string, Piece>;
  currentPlayer: PlayerColor;
  winner?: PlayerColor;
  winnerReason?: WinnerReason;
  /** Defaults to classic when missing (legacy rooms). */
  rulesVersion?: RulesVersion;
  /**
   * Lobby-tunable RulesConfig knobs. Merged over the named version when
   * hydrating the engine (`fromState`). Absent on legacy rooms → version defaults.
   */
  rulesOverrides?: GameRulesOverrides;
  /**
   * Consecutive plies each side has held Sector Integration coverage.
   * Only used when rules.sectorHoldPlies > 0 (Integration Hold clock).
   */
  sectorHoldProgress?: Partial<Record<PlayerColor, number>>;
  /**
   * Completed plies (successful actions by either side). Used by
   * rules.sectorActivationPly to arm the Sector Integration clock late-game.
   */
  plyCount?: number;
  /**
   * Command Overload (EMP) charge. Increments when a non-Hub piece moves while
   * the Hub stays put; resets when the Hub moves or EMP fires.
   */
  empCharge?: Partial<Record<PlayerColor, number>>;
  /**
   * Live EMP blackout: enemy pieces inside the blast cannot move or capture.
   * Burns one `pliesRemaining` per action the frozen side commits.
   */
  empActive?: EmpActive;
  /**
   * Terminal Overclock shared phase: set when both sides first become lone
   * Hubs (if `terminalSharedPhaseClock`). Charges were reset on arming.
   */
  terminalPhaseArmed?: boolean;
  /**
   * `plyCount` when the Terminal phase armed. Used for shared-age EMP radius
   * growth (ambient radiation). Absent on legacy snapshots → treat as current ply.
   */
  terminalPhaseArmedAtPly?: number;
}
