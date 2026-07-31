import { PieceType } from './pieceType';
import { PlayerColor } from './playerColor';
import { Coordinate } from './coordinate';

export interface Piece {
  id: string;
  type: PieceType;
  owner: PlayerColor;
  position: Coordinate;
  /**
   * Navigational Target Lock: announced warp destination (hybrid-spool).
   * Cleared on execute, failed execute, ortho move while detected, or capture.
   */
  spoolTarget?: Coordinate;
  /**
   * Terminal Overclock: Hub drives fused after a safeties-off EMP.
   * Piece generates no legal moves; life support intact (not an instant loss).
   */
  enginesFused?: boolean;
}
