import React, { useState } from 'react';
import type { PassPlaySeatNames } from '../hooks/usePassAndPlayGame';
import './PassAndPlaySetup.scss';

export interface PassAndPlaySetupProps {
  onConfirm: (names: PassPlaySeatNames) => void;
  onCancel: () => void;
}

export const PassAndPlaySetup: React.FC<PassAndPlaySetupProps> = ({
  onConfirm,
  onCancel,
}) => {
  const [white, setWhite] = useState('');
  const [black, setBlack] = useState('');

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
        Optional — leave blank to use White / Black at the helm.
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
