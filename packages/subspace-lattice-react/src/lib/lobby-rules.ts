import {
  FLEET_LOBBY_DEFAULTS,
  isDefaultFleetLobby,
  type RulesLobbyOverrides,
} from '@subspace-lattice/core';

/** Create-room / local lobby module options (fleet base). */
export type LobbyRulesOptions = RulesLobbyOverrides;

export const DEFAULT_LOBBY_RULES: LobbyRulesOptions = {
  ...FLEET_LOBBY_DEFAULTS,
};

export function lobbyRulesAreDefault(options: LobbyRulesOptions): boolean {
  return isDefaultFleetLobby(options);
}
