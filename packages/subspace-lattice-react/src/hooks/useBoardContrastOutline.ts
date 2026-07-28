import { useCallback, useSyncExternalStore } from 'react';

export type BoardContrastOutline = true | false;

export const BOARD_CONTRAST_OUTLINE_STORAGE_KEY =
  'subspace-lattice.boardContrastOutline.v2';
export const DEFAULT_BOARD_CONTRAST_OUTLINE: BoardContrastOutline = true;
const CHANGE_EVENT = 'subspace-lattice:board-contrast';

function readStoredContrastOutline(): BoardContrastOutline {
  if (typeof window === 'undefined') return DEFAULT_BOARD_CONTRAST_OUTLINE;
  try {
    const raw = window.localStorage.getItem(BOARD_CONTRAST_OUTLINE_STORAGE_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return DEFAULT_BOARD_CONTRAST_OUTLINE;
  } catch {
    return DEFAULT_BOARD_CONTRAST_OUTLINE;
  }
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === BOARD_CONTRAST_OUTLINE_STORAGE_KEY || event.key === null) {
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

function writeStoredContrastOutline(next: BoardContrastOutline): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      BOARD_CONTRAST_OUTLINE_STORAGE_KEY,
      next ? 'true' : 'false',
    );
  } catch {
    // Private mode / quota — still update in-memory listeners below.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Persisted board contrast outline (white visibility trace). Stored under
 * {@link BOARD_CONTRAST_OUTLINE_STORAGE_KEY}. Default: on.
 *
 * Pass `forced` to lock a mode without writing (figure harnesses).
 */
export function useBoardContrastOutline(
  forced?: BoardContrastOutline,
): [BoardContrastOutline, (next: BoardContrastOutline) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    readStoredContrastOutline,
    () => DEFAULT_BOARD_CONTRAST_OUTLINE,
  );
  const contrastOutline = forced ?? stored;

  const setContrastOutline = useCallback(
    (next: BoardContrastOutline) => {
      if (forced !== undefined) return;
      writeStoredContrastOutline(next);
    },
    [forced],
  );

  return [contrastOutline, setContrastOutline];
}
