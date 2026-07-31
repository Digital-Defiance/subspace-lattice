import { useId } from 'react';
import { useSoundtrackEnabled } from '@subspace-lattice/react';
import './origin-welcome.scss';

export interface SoundtrackWelcomeGateProps {
  onDismiss: () => void;
}

/**
 * First command-deck visit: friendly soundtrack opt-in.
 * Choosing either option persists the preference (and unlocks autoplay if On).
 */
export function SoundtrackWelcomeGate({ onDismiss }: SoundtrackWelcomeGateProps) {
  const titleId = useId();
  const [, setEnabled] = useSoundtrackEnabled();

  const enableSoundtrack = () => {
    setEnabled(true);
    onDismiss();
  };

  const keepQuiet = () => {
    setEnabled(false);
    onDismiss();
  };

  return (
    <div
      className="origin-welcome"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="soundtrack-welcome"
    >
      <div className="origin-welcome__veil" aria-hidden="true" />
      <div className="origin-welcome__panel">
        <p className="origin-welcome__kicker">Command deck audio</p>
        <h1 id={titleId} className="origin-welcome__title">
          Bring the fleet soundtrack online?
        </h1>
        <p className="origin-welcome__copy">
          Adaptive music follows the fight — from this deck through the lobby
          and into the lattice. You can change this anytime under Options.
        </p>
        <div className="origin-welcome__actions">
          <button
            type="button"
            className="origin-welcome__primary"
            data-testid="soundtrack-welcome-on"
            onClick={enableSoundtrack}
          >
            Play soundtrack
          </button>
          <button
            type="button"
            className="origin-welcome__secondary"
            data-testid="soundtrack-welcome-off"
            onClick={keepQuiet}
          >
            Keep it quiet
          </button>
        </div>
      </div>
    </div>
  );
}
