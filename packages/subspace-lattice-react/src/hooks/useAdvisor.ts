import { useCallback, useMemo, useState } from 'react';
import {
  AiStrengthId,
  AdvisorSuggestion,
  suggestAdvisorMove,
  SubspaceLatticeEngine,
} from '@subspace-lattice/core';
import type { BoardGuidance } from '../components/Board';

/**
 * Client-side tactical advisor (Warp-style). Suggestions never auto-play and
 * never go to chat. Using the advisor marks the session as assisted.
 */
export function useAdvisor(strength: AiStrengthId = 'normal') {
  const [suggestion, setSuggestion] = useState<AdvisorSuggestion | null>(null);
  const [teachingMode, setTeachingMode] = useState(false);
  const [assisted, setAssisted] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [pendingAsk, setPendingAsk] = useState(false);

  const clearSuggestion = useCallback(() => {
    setSuggestion(null);
  }, []);

  const applySuggestion = useCallback(
    (engine: SubspaceLatticeEngine | null) => {
      if (!engine) return null;
      const tip = suggestAdvisorMove(engine, strength);
      setSuggestion(tip);
      if (tip) setAssisted(true);
      return tip;
    },
    [strength],
  );

  const askAdvisor = useCallback(
    (engine: SubspaceLatticeEngine | null, opts?: { requireConsent?: boolean }) => {
      if (!engine) return;
      if (opts?.requireConsent && !assisted) {
        setPendingAsk(true);
        setConsentOpen(true);
        return;
      }
      applySuggestion(engine);
    },
    [applySuggestion, assisted],
  );

  const confirmConsent = useCallback(
    (engine: SubspaceLatticeEngine | null) => {
      setConsentOpen(false);
      setAssisted(true);
      if (pendingAsk) {
        setPendingAsk(false);
        applySuggestion(engine);
      }
    },
    [applySuggestion, pendingAsk],
  );

  const declineConsent = useCallback(() => {
    setConsentOpen(false);
    setPendingAsk(false);
  }, []);

  const refreshIfTeaching = useCallback(
    (engine: SubspaceLatticeEngine | null) => {
      if (!teachingMode || !engine || engine.getState().winner) {
        return;
      }
      applySuggestion(engine);
    },
    [teachingMode, applySuggestion],
  );

  const enableTeaching = useCallback(
    (engine: SubspaceLatticeEngine | null) => {
      setTeachingMode(true);
      setAssisted(true);
      applySuggestion(engine);
    },
    [applySuggestion],
  );

  const disableTeaching = useCallback(() => {
    setTeachingMode(false);
    setSuggestion(null);
  }, []);

  const guidance: BoardGuidance | undefined = useMemo(() => {
    if (!suggestion) return undefined;
    // Amber advisor highlights only — do not reuse purple tutorial focus.
    return {
      advisorFrom: suggestion.from,
      advisorTo: suggestion.to,
    };
  }, [suggestion]);

  return {
    suggestion,
    teachingMode,
    assisted,
    consentOpen,
    guidance,
    askAdvisor,
    clearSuggestion,
    confirmConsent,
    declineConsent,
    refreshIfTeaching,
    enableTeaching,
    disableTeaching,
    setAssisted,
  };
}
