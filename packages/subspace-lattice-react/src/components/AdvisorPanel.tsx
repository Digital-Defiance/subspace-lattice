import React from 'react';
import type { AdvisorSuggestion } from '@subspace-lattice/core';
import './AdvisorPanel.scss';

export interface AdvisorPanelProps {
  suggestion: AdvisorSuggestion | null;
  teachingMode: boolean;
  assisted: boolean;
  canAsk: boolean;
  /** Warp-style: rated sector suppresses advisor until assisted. */
  suppressed?: boolean;
  onAsk: () => void;
  onClear: () => void;
  onToggleTeaching: () => void;
  /** Host/player opts to make a rated sector casual so advisor unlocks. */
  onMakeCasual?: () => void;
  consentOpen?: boolean;
  onConfirmConsent?: () => void;
  onDeclineConsent?: () => void;
}

export const AdvisorPanel: React.FC<AdvisorPanelProps> = ({
  suggestion,
  teachingMode,
  assisted,
  canAsk,
  suppressed = false,
  onAsk,
  onClear,
  onToggleTeaching,
  onMakeCasual,
  consentOpen,
  onConfirmConsent,
  onDeclineConsent,
}) => {
  return (
    <div className="advisor-panel" data-testid="advisor-panel">
      <div className="advisor-panel-header">
        <h3>
          <span className="advisor-star" aria-hidden>
            ★
          </span>{' '}
          Tactical advisor
        </h3>
        {assisted && (
          <span className="advisor-assisted" data-testid="advisor-assisted">
            Assisted — unrated
          </span>
        )}
      </div>
      {suppressed ? (
        <div className="advisor-suppressed" data-testid="advisor-suppressed">
          <p>
            Rated sector — advisor hidden (Warp integrity). Make the sector
            casual to unlock coaching.
          </p>
          {onMakeCasual && (
            <button
              type="button"
              className="advisor-ask"
              onClick={onMakeCasual}
              data-testid="advisor-make-casual"
            >
              Make casual &amp; unlock
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="advisor-panel-hint">
            {teachingMode
              ? 'Teaching mode — suggestion updates on your turn. You still confirm each move.'
              : 'Suggestions stay on this device. Highlight shows the play — you still confirm.'}
          </p>
          <div className="advisor-actions">
            <button
              type="button"
              className="advisor-ask"
              onClick={onAsk}
              disabled={!canAsk}
              data-testid="advisor-ask"
            >
              Ask advisor
            </button>
            <button
              type="button"
              className={`advisor-teach${teachingMode ? ' active' : ''}`}
              onClick={onToggleTeaching}
              disabled={!canAsk && !teachingMode}
              data-testid="advisor-teach"
            >
              {teachingMode ? 'Teaching on' : 'Teaching mode'}
            </button>
            {suggestion && (
              <button
                type="button"
                className="advisor-clear"
                onClick={onClear}
                data-testid="advisor-clear"
              >
                Clear
              </button>
            )}
          </div>
          {suggestion && (
            <div className="advisor-suggestion" data-testid="advisor-suggestion">
              <p className="advisor-move">
                Recommend <strong>{suggestion.summary}</strong>
              </p>
              <ul>
                {suggestion.reasons.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {consentOpen && (
        <div
          className="advisor-consent"
          role="dialog"
          aria-modal="true"
          data-testid="advisor-consent"
        >
          <p>
            Engaging the advisor marks this match as <strong>assisted</strong>{' '}
            — it will not update TEI.
          </p>
          <div className="advisor-consent-actions">
            <button
              type="button"
              onClick={onConfirmConsent}
              data-testid="advisor-consent-yes"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={onDeclineConsent}
              data-testid="advisor-consent-no"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
