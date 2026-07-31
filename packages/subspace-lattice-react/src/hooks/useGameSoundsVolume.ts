import { useCallback, useSyncExternalStore } from 'react';
import {
  DEFAULT_GAME_SOUNDS_VOLUME,
  getGameSoundsVolume,
  setGameSoundsVolume,
  subscribeGameSoundsVolume,
} from '../lib/game-sounds';

/**
 * Persisted effects volume (0–1). Independent of mute.
 */
export function useGameSoundsVolume(): [number, (next: number) => void] {
  const volume = useSyncExternalStore(
    subscribeGameSoundsVolume,
    getGameSoundsVolume,
    () => DEFAULT_GAME_SOUNDS_VOLUME,
  );
  const setVolume = useCallback((next: number) => {
    setGameSoundsVolume(next);
  }, []);
  return [volume, setVolume];
}
