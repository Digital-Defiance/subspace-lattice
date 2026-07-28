import { useCallback, useSyncExternalStore } from 'react';

export type BoardContrast = 'classic' | 'high';

export const BOARD_CONTRAST_STORAGE_KEY = 'subspace-lattice.boardContrast.v2';
export const DEFAULT_BOARD_CONTRAST: BoardContrast = 'high';
const CHANGE_EVENT = 'subspace-lattice:board-contrast';

function readStoredContrast(): BoardContrast {
  if (typeof window === 'undefined') return DEFAULT_BOARD_CONTRAST;
  try {
    const raw = window.localStorage.getItem(BOARD_CONTRAST_STORAGE_KEY);
    if (raw === 'classic' || raw === 'high') return raw;
    return DEFAULT_BOARD_CONTRAST;
  } catch {
    return DEFAULT_BOARD_CONTRAST;
  }
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === BOARD_CONTRAST_STORAGE_KEY || event.key === null) {
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

function writeStoredContrast(next: BoardContrast): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BOARD_CONTRAST_STORAGE_KEY, next);
  } catch {
    // Private mode / quota — still update in-memory listeners below.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Persisted board contrast (classic glyphs + muted nets, or high-contrast
 * hulls + brighter nets). Stored under {@link BOARD_CONTRAST_STORAGE_KEY}.
 * Default: high contrast.
 *
 * Pass `forced` to lock a mode without writing (figure harnesses).
 */
export function useBoardContrast(
  forced?: BoardContrast,
): [BoardContrast, (next: BoardContrast) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    readStoredContrast,
    () => DEFAULT_BOARD_CONTRAST,
  );
  const contrast = forced ?? stored;

  const setContrast = useCallback(
    (next: BoardContrast) => {
      if (forced !== undefined) return;
      writeStoredContrast(next);
    },
    [forced],
  );

  return [contrast, setContrast];
}
