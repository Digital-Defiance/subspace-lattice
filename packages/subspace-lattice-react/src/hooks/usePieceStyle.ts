import { useCallback, useSyncExternalStore } from 'react';
import { getStyleCount } from '../components/Piece';
import { getStyleTitle } from '../components/PieceStyles';

export const BOARD_PIECE_STYLE_STORAGE_KEY = 'subspace-lattice.pieceStyle.v2';
/** Shipping default piece pack title (matches pack.json title). */
export const DEFAULT_PIECE_STYLE_TITLE = 'Subspace Lattice';
const CHANGE_EVENT = 'subspace-lattice:piece-style';

/** Resolve the default style index by pack title (falls back to 0). */
export function defaultPieceStyleIndex(): number {
  const count = getStyleCount();
  if (count <= 0) return 0;
  for (let i = 0; i < count; i++) {
    if (getStyleTitle(i) === DEFAULT_PIECE_STYLE_TITLE) return i;
  }
  return 0;
}

function clampStyleIndex(value: number): number {
  const count = getStyleCount();
  if (count <= 0) return 0;
  if (value < 0) return 0;
  if (value >= count) return count - 1;
  return value;
}

function readStoredPieceStyle(): number {
  const fallback = defaultPieceStyleIndex();
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(BOARD_PIECE_STYLE_STORAGE_KEY);
    if (raw == null || raw === '') return fallback;
    const value = parseInt(raw, 10);
    if (Number.isNaN(value)) return fallback;
    return clampStyleIndex(value);
  } catch {
    return fallback;
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
    window.localStorage.setItem(
      BOARD_PIECE_STYLE_STORAGE_KEY,
      clampStyleIndex(next).toString(),
    );
  } catch {
    // Private mode / quota — still update in-memory listeners below.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Persisted board piece style (0-N). Stored under {@link BOARD_PIECE_STYLE_STORAGE_KEY}.
 * Default: Subspace Lattice pack when no preference is stored.
 *
 * Pass `forced` to lock a mode without writing (figure harnesses).
 */
export function usePieceStyle(
  forced?: number,
): [number, (next: number) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    readStoredPieceStyle,
    defaultPieceStyleIndex,
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
