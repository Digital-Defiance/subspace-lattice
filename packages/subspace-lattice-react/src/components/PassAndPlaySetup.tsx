import React, { useEffect, useState } from 'react';
import { PlayerColor } from '@subspace-lattice/core';
import type { PassPlaySeatNames } from '../hooks/usePassAndPlayGame';
import './PassAndPlaySetup.scss';

export interface PassAndPlaySetupProps {
  onConfirm: (names: PassPlaySeatNames) => void;
  onCancel: () => void;
  /** Seat the local player claimed in the lobby — prefilled from profile. */
  preferredSeat?: PlayerColor;
  /** Federation Profile call sign for the preferred seat. */
  defaultCallSign?: string;
  federationProfileUrl?: string;
}

export const PassAndPlaySetup: React.FC<PassAndPlaySetupProps> = ({
  onConfirm,
  onCancel,
  preferredSeat = PlayerColor.White,
  defaultCallSign = '',
  federationProfileUrl,
}) => {
  const [white, setWhite] = useState('');
  const [black, setBlack] = useState('');

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
    onConfirm({ white, black });
  };

  return (
    <form
      className="pass-setup"
      onSubmit={handleSubmit}
      data-testid="pass-and-play-setup-form"
    >
      <p className="pass-setup-eyebrow">Pass &amp; Play</p>
      <h2 className="pass-setup-title">Name the commanders</h2>
      <p className="pass-setup-copy">
        Your seat defaults from{' '}
        {federationProfileUrl ? (
          <a href={federationProfileUrl} target="_blank" rel="noreferrer">
            Federation Profile
          </a>
        ) : (
          'Federation Profile'
        )}
        . Override either name for this match only.
      </p>
      <div className="pass-setup-fields">
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
