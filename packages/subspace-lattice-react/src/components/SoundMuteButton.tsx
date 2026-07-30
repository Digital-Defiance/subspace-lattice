import { useGameSoundsMuted } from '../hooks/useGameSoundsMuted';
import './SoundMuteButton.scss';

export interface SoundMuteButtonProps {
  className?: string;
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      className="sound-mute-icon"
      viewBox="0 0 24 24"
      width={18}
      height={18}
      aria-hidden="true"
      focusable="false"
    >
      {/* Speaker body + cone */}
      <path
        className="sound-mute-icon__body"
        d="M4.5 9.25v5.5h3.1L12.8 19V5L7.6 9.25H4.5z"
        fill="currentColor"
      />
      {!muted && (
        <g
          className="sound-mute-icon__waves"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path d="M15.1 9.2a3.4 3.4 0 0 1 0 5.6" />
          <path d="M17.4 7a6.2 6.2 0 0 1 0 10" />
        </g>
      )}
      {muted && (
        <g className="sound-mute-icon__mute" aria-hidden="true">
          {/* Red crosshatch: two diagonals over the cone/wave area */}
          <path
            d="M13.2 7.2l7.1 9.6"
            stroke="#e11d2e"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M20.3 7.2l-7.1 9.6"
            stroke="#e11d2e"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </g>
      )}
    </svg>
  );
}

/** Compact mute toggle (header chrome or Options dialog). */
export function SoundMuteButton({
  className = 'rules-btn',
}: SoundMuteButtonProps) {
  const [muted, , toggleMuted] = useGameSoundsMuted();
  return (
    <button
      type="button"
      className={`${className} sound-mute-btn`.trim()}
      aria-pressed={!muted}
      aria-label={muted ? 'Unmute game sounds' : 'Mute game sounds'}
      title={muted ? 'Unmute game sounds' : 'Mute game sounds'}
      data-testid="sound-mute-toggle"
      data-muted={muted ? 'true' : 'false'}
      onClick={toggleMuted}
    >
      <SpeakerIcon muted={muted} />
    </button>
  );
}
