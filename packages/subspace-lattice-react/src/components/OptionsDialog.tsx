import React from 'react';
import { PieceStyles, getStyleRimFlags } from './PieceStyles';
import { SoundMuteButton } from './SoundMuteButton';
import { useBoardContrastOutline } from '../hooks/useBoardContrastOutline';
import { useGameLogLpgn } from '../hooks/useGameLogLpgn';
import { usePieceStyle } from '../hooks/usePieceStyle';
import './OptionsDialog.scss';

export interface OptionsDialogProps {
  onClose: () => void;
}

export const OptionsDialog: React.FC<OptionsDialogProps> = ({ onClose }) => {
  const [styleIndex, setStyleIndex] = usePieceStyle();
  const [pieceOutline, setPieceOutline] = useBoardContrastOutline();
  const [lpgnLog, setLpgnLog] = useGameLogLpgn();
  const rimFlags = getStyleRimFlags(styleIndex);
  const bakedOutline =
    rimFlags.lightRimOnBlack && rimFlags.lightRimOnWhite;

  return (
    <div
      className="options-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="options-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lattice-options-title"
        onClick={(event) => event.stopPropagation()}
        data-testid="options-dialog"
      >
        <button
          type="button"
          className="options-dialog__close"
          onClick={onClose}
          aria-label="Close options"
        >
          &times;
        </button>
        <h2 id="lattice-options-title">Options</h2>

        <section className="options-section" aria-labelledby="options-audio">
          <h3 id="options-audio">Audio</h3>
          <div className="options-row">
            <span className="options-row__label">Game sounds</span>
            <SoundMuteButton className="options-control-btn" />
          </div>
        </section>

        <section className="options-section" aria-labelledby="options-pieces">
          <h3 id="options-pieces">Piece art</h3>
          <div className="options-row">
            <span className="options-row__label">Style</span>
            <div className="options-row__control">
              <PieceStyles
                selectedStyle={styleIndex}
                onStyleChange={setStyleIndex}
              />
            </div>
          </div>
          <div className="options-row">
            <span className="options-row__label">Outline</span>
            <button
              type="button"
              className="options-control-btn"
              aria-pressed={bakedOutline || pieceOutline}
              disabled={bakedOutline}
              data-testid="options-piece-outline"
              title={
                bakedOutline
                  ? 'This piece style already includes contrast rims on both sides'
                  : rimFlags.lightRimOnWhite && !rimFlags.lightRimOnBlack
                    ? 'Adds a white visibility trace on black pieces (white art is already clear)'
                    : rimFlags.lightRimOnBlack && !rimFlags.lightRimOnWhite
                      ? 'Adds a white visibility trace on white pieces (black art is already clear)'
                      : 'Adds a white visibility trace around pieces that lack a light rim'
              }
              onClick={() => setPieceOutline(!pieceOutline)}
            >
              {bakedOutline || pieceOutline ? 'On' : 'Off'}
            </button>
          </div>
        </section>

        <section className="options-section" aria-labelledby="options-game-log">
          <h3 id="options-game-log">Game log</h3>
          <div className="options-row">
            <span className="options-row__label">LPGN</span>
            <button
              type="button"
              className="options-control-btn"
              aria-pressed={lpgnLog}
              data-testid="options-game-log-lpgn"
              title="Show the in-match game log as Lattice Portable Game Notation"
              onClick={() => setLpgnLog(!lpgnLog)}
            >
              {lpgnLog ? 'On' : 'Off'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
