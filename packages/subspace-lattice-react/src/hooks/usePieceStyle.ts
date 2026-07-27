import { useCallback, useSyncExternalStore } from 'react';
import { getStyleCount } from '../components/Piece';

export const BOARD_PIECE_STYLE_STORAGE_KEY = 'subspace-lattice.pieceStyle';
const CHANGE_EVENT = 'subspace-lattice:piece-style';

function readStoredPieceStyle(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const value = parseInt(window.localStorage.getItem(BOARD_PIECE_STYLE_STORAGE_KEY) ?? '0');
    if (isNaN(value)) return 0;
    if (value < 0) return 0;
    if (value >= getStyleCount()) return getStyleCount() - 1;
    return value;
  } catch {
    return 0;
  }
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === BOARD_PIECE_STYLE_STORAGE_KEY || event.key === null) {
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

function writeStoredPieceStyle(next: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BOARD_PIECE_STYLE_STORAGE_KEY, next.toString());
  } catch {
    // Private mode / quota — still update in-memory listeners below.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Persisted board piece style (0-N). Stored under {@link BOARD_PIECE_STYLE_STORAGE_KEY}.
 *
 * Pass `forced` to lock a mode without writing (figure harnesses).
 */
export function usePieceStyle(
  forced?: number,
): [number, (next: number) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    readStoredPieceStyle,
    () => 0,
  );
  const pieceStyle = forced ?? stored;

  const setPieceStyle = useCallback(
    (next: number) => {
      if (forced !== undefined) return;
      writeStoredPieceStyle(next);
    },
    [forced],
  );

  return [pieceStyle, setPieceStyle];
}
