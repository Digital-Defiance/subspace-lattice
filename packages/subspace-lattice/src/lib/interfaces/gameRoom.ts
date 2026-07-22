import { GameState } from './gameState';
import { IChatMessage } from './chatMessage';
import { RulesVersion } from './rulesVersion';

export interface IGameRoom<TId = string> {
  id: TId;
  roomCode: string;
  name: string;
  password?: string;
  creatorId: TId;
  whitePlayerId?: TId;
  blackPlayerId?: TId;
  /** Per-match seat label (defaults from Federation Profile; overridable). */
  whiteDisplayName?: string;
  blackDisplayName?: string;
  observerIds: TId[];

  allowObservers: boolean;
  /**
   * When true, tactical advisor is hidden until the sector is marked assisted
   * (Warp-style rated integrity).
   */
  rated?: boolean;
  /** Set when any seat engages the advisor — sector becomes casual. */
  assisted?: boolean;
  /** Room rules; gameState.rulesVersion is authoritative for the engine. */
  rulesVersion?: RulesVersion;
  gameState: GameState;
  chatMessages: IChatMessage<TId>[];
  createdAt: Date;
  updatedAt: Date;
}
