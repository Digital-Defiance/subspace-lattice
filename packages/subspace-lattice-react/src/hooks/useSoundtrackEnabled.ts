import { useCallback, useSyncExternalStore } from 'react';

/** Default off — soundtrack is opt-in under Options. */
export const SOUNDTRACK_ENABLED_STORAGE_KEY =
  'subspace-lattice.soundtrackEnabled.v1';
const CHANGE_EVENT = 'subspace-lattice:soundtrack-enabled';

function readStored(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.localStorage.getItem(SOUNDTRACK_ENABLED_STORAGE_KEY) === 'true'
    );
  } catch {
    return false;
  }
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === SOUNDTRACK_ENABLED_STORAGE_KEY || event.key === null) {
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
      SOUNDTRACK_ENABLED_STORAGE_KEY,
      next ? 'true' : 'false',
    );
  } catch {
    // Private mode / quota — still notify listeners.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * True once the player has explicitly chosen On or Off (Options or welcome gate).
 * Missing key means we have not asked yet — distinct from “chose Off”.
 */
export function hasSoundtrackPreferenceSet(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(SOUNDTRACK_ENABLED_STORAGE_KEY) != null;
  } catch {
    // Private mode — don't trap them on a gate they cannot persist past.
    return true;
  }
}

/**
 * Persisted soundtrack preference. Default: off until the player opts in.
 */
export function useSoundtrackEnabled(): [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, readStored, () => false);
  const setEnabled = useCallback((next: boolean) => {
    writeStored(next);
  }, []);
  return [enabled, setEnabled];
}
