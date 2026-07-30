import { useCallback, useSyncExternalStore } from 'react';

export const GAME_LOG_LPGN_STORAGE_KEY = 'subspace-lattice.gameLogLpgn.v1';
const CHANGE_EVENT = 'subspace-lattice:game-log-lpgn';

function readStored(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(GAME_LOG_LPGN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === GAME_LOG_LPGN_STORAGE_KEY || event.key === null) {
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
      GAME_LOG_LPGN_STORAGE_KEY,
      next ? 'true' : 'false',
    );
  } catch {
    // Private mode / quota — still notify listeners.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Persisted game-log LPGN display toggle. Default: off (human-readable log).
 */
export function useGameLogLpgn(): [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, readStored, () => false);
  const setEnabled = useCallback((next: boolean) => {
    writeStored(next);
  }, []);
  return [enabled, setEnabled];
}
