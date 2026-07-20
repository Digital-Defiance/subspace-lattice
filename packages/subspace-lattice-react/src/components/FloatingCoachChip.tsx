import React from 'react';
import type { AdvisorSuggestion } from '@subspace-lattice/core';
import './FloatingCoachChip.scss';

export interface FloatingCoachChipProps {
  suggestion: AdvisorSuggestion;
  teachingMode?: boolean;
  onDismiss: () => void;
}

/** Compact amber cue over the board while a suggestion is active. */
export const FloatingCoachChip: React.FC<FloatingCoachChipProps> = ({
  suggestion,
  teachingMode = false,
  onDismiss,
}) => {
  return (
    <div
      className="floating-coach-chip"
      role="status"
      data-testid="floating-coach-chip"
    >
      <span className="floating-coach-star" aria-hidden>
        ★
      </span>
      <div className="floating-coach-body">
        <p className="floating-coach-title">
          {teachingMode ? 'Teaching' : 'Advisor'}
        </p>
        <p className="floating-coach-move">{suggestion.summary}</p>
      </div>
      {!teachingMode && (
        <button
          type="button"
          className="floating-coach-dismiss"
          onClick={onDismiss}
          data-testid="floating-coach-dismiss"
          aria-label="Dismiss advisor highlight"
        >
          ×
        </button>
      )}
    </div>
  );
};
