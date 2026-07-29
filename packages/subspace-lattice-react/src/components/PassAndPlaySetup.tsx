import React, { useEffect, useState } from 'react';
import { PlayerColor } from '@subspace-lattice/core';
import type { PassPlaySeatNames } from '../hooks/usePassAndPlayGame';
import {
  DEFAULT_LOBBY_RULES,
  type LobbyRulesOptions,
} from '../lib/lobby-rules';
import { LobbyRulesModules } from './LobbyRulesModules';
import './PassAndPlaySetup.scss';
import './Lobby.scss';

export interface PassAndPlaySetupProps {
  onConfirm: (names: PassPlaySeatNames, rules: LobbyRulesOptions) => void;
  onCancel: () => void;
  /** Seat the local player claimed in the lobby — prefilled from profile. */
  preferredSeat?: PlayerColor;
  onPreferredSeatChange?: (seat: PlayerColor) => void;
  /** Prefill modules when launched from Lobby Local. */
  initialRules?: LobbyRulesOptions;
  /** Federation Profile call sign for the preferred seat. */
  defaultCallSign?: string;
  federationProfileUrl?: string;
}

export const PassAndPlaySetup: React.FC<PassAndPlaySetupProps> = ({
  onConfirm,
  onCancel,
  preferredSeat = PlayerColor.White,
  onPreferredSeatChange,
  initialRules,
  defaultCallSign = '',
  federationProfileUrl,
}) => {
  const [white, setWhite] = useState('');
  const [black, setBlack] = useState('');
  const [rules, setRules] = useState<LobbyRulesOptions>(
    () => initialRules ?? DEFAULT_LOBBY_RULES,
  );

  useEffect(() => {
    setRules(initialRules ?? DEFAULT_LOBBY_RULES);
  }, [initialRules]);

  useEffect(() => {
    if (!defaultCallSign) return;
    if (preferredSeat === PlayerColor.Black) {
      setBlack(defaultCallSign);
    } else {
      setWhite(defaultCallSign);
    }
  }, [defaultCallSign, preferredSeat]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm({ white, black }, rules);
  };

  return (
    <form
      className="pass-setup"
      onSubmit={handleSubmit}
      data-testid="pass-and-play-setup-form"
    >
      <p className="pass-setup-eyebrow">Pass &amp; Play</p>
      <h2 className="pass-setup-title">Set up the match</h2>
      <p className="pass-setup-copy">
        Your seat defaults from{' '}
        {federationProfileUrl ? (
          <a href={federationProfileUrl} target="_blank" rel="noreferrer">
            Federation Profile
          </a>
        ) : (
          'Federation Profile'
        )}
        . Name both commanders and optionally tune Advanced modules for this
        hotseat game.
      </p>

      <div className="pass-setup-fields">
        <label className="pass-setup-field">
          <span>Your seat</span>
          <select
            value={preferredSeat}
            onChange={(e) =>
              onPreferredSeatChange?.(e.target.value as PlayerColor)
            }
            data-testid="pass-preferred-seat"
          >
            <option value={PlayerColor.White}>White (moves first)</option>
            <option value={PlayerColor.Black}>Black</option>
          </select>
        </label>
        <label className="pass-setup-field">
          <span>White</span>
          <input
            type="text"
            value={white}
            onChange={(e) => setWhite(e.target.value)}
            placeholder="White"
            maxLength={24}
            autoComplete="off"
            data-testid="pass-name-white"
          />
        </label>
        <label className="pass-setup-field">
          <span>Black</span>
          <input
            type="text"
            value={black}
            onChange={(e) => setBlack(e.target.value)}
            placeholder="Black"
            maxLength={24}
            autoComplete="off"
            data-testid="pass-name-black"
          />
        </label>
      </div>

      <LobbyRulesModules
        className="lobby-modules pass-setup-modules"
        value={rules}
        onChange={setRules}
        idPrefix="pass"
        showUnratedWarn={false}
      />

      <div className="pass-setup-actions">
        <button
          type="button"
          className="pass-setup-cancel"
          onClick={onCancel}
          data-testid="pass-setup-cancel"
        >
          Back
        </button>
        <button
          type="submit"
          className="pass-setup-start"
          data-testid="pass-setup-start"
        >
          Start match
        </button>
      </div>
    </form>
  );
};
