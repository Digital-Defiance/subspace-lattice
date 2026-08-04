import { useCallback, useSyncExternalStore } from 'react';

/**
 * When true, local AI resigns after a confident forced-loss MCTS search
 * instead of flailing through zero-win-rate suicide moves.
 * Default: on.
 */
export const AI_RESIGN_ON_FORCED_LOSS_STORAGE_KEY =
  'subspace-lattice.aiResignOnForcedLoss.v1';
const CHANGE_EVENT = 'subspace-lattice:ai-resign-on-forced-loss';

function readStored(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(AI_RESIGN_ON_FORCED_LOSS_STORAGE_KEY);
    if (raw == null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === AI_RESIGN_ON_FORCED_LOSS_STORAGE_KEY ||
      event.key === null
    ) {
      onStoreChange();
    }
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

function writeStored(next: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      AI_RESIGN_ON_FORCED_LOSS_STORAGE_KEY,
      next ? 'true' : 'false',
    );
  } catch {
    // Private mode / quota — still notify listeners.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Persisted Grandmaster-resignation preference. Default: on. */
export function useAiResignOnForcedLoss(): [
  boolean,
  (next: boolean) => void,
] {
  const enabled = useSyncExternalStore(subscribe, readStored, () => true);
  const setEnabled = useCallback((next: boolean) => {
    writeStored(next);
  }, []);
  return [enabled, setEnabled];
}
