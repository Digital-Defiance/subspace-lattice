import { Cell } from './cell';
import { Piece } from './piece';
import { PlayerColor } from './playerColor';
import { RulesVersion } from './rulesVersion';

export type WinnerReason =
  | 'hub-capture'
  | 'no-moves'
  | 'sector-integration'
  | 'resign';

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
   * Consecutive plies each side has held Sector Integration coverage.
   * Only used when rules.sectorHoldPlies > 0 (Integration Hold clock).
   */
  sectorHoldProgress?: Partial<Record<PlayerColor, number>>;
  /**
   * Completed plies (successful actions by either side). Used by
   * rules.sectorActivationPly to arm the Sector Integration clock late-game.
   */
  plyCount?: number;
}
