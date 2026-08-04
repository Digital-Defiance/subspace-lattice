import React, { useId } from 'react';
import { PieceStyles, getStyleRimFlags } from './PieceStyles';
import { SoundMuteButton } from './SoundMuteButton';
import { useAiResignOnForcedLoss } from '../hooks/useAiResignOnForcedLoss';
import { useBoardContrastOutline } from '../hooks/useBoardContrastOutline';
import { useGameLogLpgn } from '../hooks/useGameLogLpgn';
import { useGameSoundsVolume } from '../hooks/useGameSoundsVolume';
import { usePieceStyle } from '../hooks/usePieceStyle';
import { useShowPowerRelay } from '../hooks/useShowPowerRelay';
import { useSoundtrackEnabled } from '../hooks/useSoundtrackEnabled';
import { useSoundtrackVolume } from '../hooks/useSoundtrackVolume';
import './OptionsDialog.scss';

export interface OptionsDialogProps {
  onClose: () => void;
}

function VolumeSlider({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  testId: string;
}) {
  const id = useId();
  const pct = Math.round(value * 100);
  return (
    <div className="options-row options-row--volume">
      <label className="options-volume" htmlFor={id}>
        <span className="options-row__label">{label}</span>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          data-testid={testId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${pct} percent`}
          onChange={(event) =>
            onChange(Number.parseInt(event.target.value, 10) / 100)
          }
        />
        <span className="options-volume__pct" aria-hidden="true">
          {pct}%
        </span>
      </label>
    </div>
  );
}

export const OptionsDialog: React.FC<OptionsDialogProps> = ({ onClose }) => {
  const [styleIndex, setStyleIndex] = usePieceStyle();
  const [pieceOutline, setPieceOutline] = useBoardContrastOutline();
  const [showPowerRelay, setShowPowerRelay] = useShowPowerRelay();
  const [soundtrackOn, setSoundtrackOn] = useSoundtrackEnabled();
  const [sfxVolume, setSfxVolume] = useGameSoundsVolume();
  const [ostVolume, setOstVolume] = useSoundtrackVolume();
  const [lpgnLog, setLpgnLog] = useGameLogLpgn();
  const [aiResignOnForcedLoss, setAiResignOnForcedLoss] =
    useAiResignOnForcedLoss();
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
          <VolumeSlider
            label="Effects volume"
            value={sfxVolume}
            onChange={setSfxVolume}
            testId="options-sfx-volume"
          />
          <div className="options-row">
            <span className="options-row__label">Soundtrack</span>
            <button
              type="button"
              className="options-control-btn"
              aria-pressed={soundtrackOn}
              data-testid="options-soundtrack"
              title="Optional adaptive music that follows Sensor Net contact, the Sector clock, and Terminal Overclock. Off by default."
              onClick={() => setSoundtrackOn(!soundtrackOn)}
            >
              {soundtrackOn ? 'On' : 'Off'}
            </button>
          </div>
          <VolumeSlider
            label="Soundtrack volume"
            value={ostVolume}
            onChange={setOstVolume}
            testId="options-ost-volume"
          />
        </section>

        <section className="options-section" aria-labelledby="options-board">
          <h3 id="options-board">Board</h3>
          <div className="options-row">
            <span className="options-row__label">Power relay</span>
            <button
              type="button"
              className="options-control-btn"
              aria-pressed={showPowerRelay}
              data-testid="options-power-relay"
              title="When a ship is selected, show its amber dashed power-relay path back to the Command Hub"
              onClick={() => setShowPowerRelay(!showPowerRelay)}
            >
              {showPowerRelay ? 'On' : 'Off'}
            </button>
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

        <section className="options-section" aria-labelledby="options-ai">
          <h3 id="options-ai">Local AI</h3>
          <div className="options-row">
            <span className="options-row__label">Resign on forced loss</span>
            <button
              type="button"
              className="options-control-btn"
              aria-pressed={aiResignOnForcedLoss}
              data-testid="options-ai-resign-forced-loss"
              title="When search is confident every reply is a forced loss, the AI resigns instead of playing on. Off forces play to the bitter end."
              onClick={() => setAiResignOnForcedLoss(!aiResignOnForcedLoss)}
            >
              {aiResignOnForcedLoss ? 'On' : 'Off'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
