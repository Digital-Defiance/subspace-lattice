import { useCallback, useSyncExternalStore } from 'react';
import {
  DEFAULT_SOUNDTRACK_VOLUME,
  getSoundtrackVolume,
  setSoundtrackVolume,
  subscribeSoundtrackVolume,
} from '../lib/soundtrack';

/**
 * Persisted soundtrack volume (0–1). Independent of On/Off.
 */
export function useSoundtrackVolume(): [number, (next: number) => void] {
  const volume = useSyncExternalStore(
    subscribeSoundtrackVolume,
    getSoundtrackVolume,
    () => DEFAULT_SOUNDTRACK_VOLUME,
  );
  const setVolume = useCallback((next: number) => {
    setSoundtrackVolume(next);
  }, []);
  return [volume, setVolume];
}
