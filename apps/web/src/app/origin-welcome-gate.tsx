import { useState } from 'react';
import { Link } from 'react-router-dom';
import { OriginStoryPlayer } from './origin-story-player';
import { markOriginWelcomeSeen } from './origin-welcome';
import './origin-welcome.scss';

export interface OriginWelcomeGateProps {
  onDismiss: () => void;
}

/**
 * First-launch intercept: watch the Sector 11 origin story in-place, or skip.
 */
export function OriginWelcomeGate({ onDismiss }: OriginWelcomeGateProps) {
  const [watching, setWatching] = useState(false);
  const [ended, setEnded] = useState(false);

  const finish = () => {
    markOriginWelcomeSeen();
    onDismiss();
  };

  const startWatching = () => {
    markOriginWelcomeSeen();
    setEnded(false);
    setWatching(true);
  };

  return (
    <div
      className={`origin-welcome${watching ? ' origin-welcome--watching' : ''}${
        ended ? ' origin-welcome--ended' : ''
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="origin-welcome-title"
      data-testid="origin-welcome"
    >
      <div className="origin-welcome__veil" aria-hidden="true" />

      {watching ? (
        <div className="origin-welcome__watch">
          <div className="origin-welcome__stage">
            <OriginStoryPlayer
              className="origin-welcome__player-host"
              autoplay
              onEnded={() => setEnded(true)}
            />
          </div>
          {ended ? (
            <p
              className="origin-welcome__ended"
              role="status"
              data-testid="origin-welcome-ended"
            >
              Transmission complete. Explore the deck when you are ready —
              tutorial and rules live on the command deck.
            </p>
          ) : (
            <p className="origin-welcome__watching-hint" aria-live="polite">
              Origin story playing…
              <button
                type="button"
                className="origin-welcome__mark-ended"
                data-testid="origin-welcome-mark-ended"
                onClick={() => setEnded(true)}
              >
                Finished watching
              </button>
            </p>
          )}
          <div className="origin-welcome__watch-actions">
            {ended ? (
              <>
                <button
                  type="button"
                  className="origin-welcome__primary origin-welcome__primary--pulse"
                  data-testid="origin-welcome-continue"
                  onClick={finish}
                >
                  Continue to command deck
                </button>
                <Link
                  className="origin-welcome__secondary"
                  to="/play"
                  data-testid="origin-welcome-deploy"
                  onClick={finish}
                >
                  Deploy to Grid
                </Link>
              </>
            ) : (
              <button
                type="button"
                className="origin-welcome__secondary"
                data-testid="origin-welcome-close"
                onClick={finish}
              >
                Return to menu
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="origin-welcome__panel">
          <p className="origin-welcome__kicker">First transmission</p>
          <h1 id="origin-welcome-title" className="origin-welcome__title">
            Welcome to Sector 11, Captain.
          </h1>
          <p className="origin-welcome__copy">
            Before you take the helm, you can watch how the Lattice was woven —
            or deploy straight to the grid.
          </p>
          <div className="origin-welcome__actions">
            <button
              type="button"
              className="origin-welcome__primary"
              data-testid="origin-welcome-watch"
              onClick={startWatching}
            >
              Watch the Origin Story (2 mins)
            </button>
            <Link
              className="origin-welcome__secondary"
              to="/play"
              data-testid="origin-welcome-skip"
              onClick={finish}
            >
              Deploy to Grid (Skip to Gameplay)
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
