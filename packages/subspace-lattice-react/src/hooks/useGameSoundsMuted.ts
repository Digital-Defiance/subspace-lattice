import { useCallback, useSyncExternalStore } from 'react';
import {
  areGameSoundsMuted,
  setGameSoundsMuted,
  subscribeGameSoundsMuted,
  unlockGameAudio,
} from '../lib/game-sounds';

/**
 * Persisted fleet SFX mute (`lattice-sounds-muted`). Default: unmuted.
 */
export function useGameSoundsMuted(): [
  boolean,
  (muted: boolean) => void,
  () => void,
] {
  const muted = useSyncExternalStore(
    subscribeGameSoundsMuted,
    areGameSoundsMuted,
    () => false,
  );

  const setMuted = useCallback((next: boolean) => {
    setGameSoundsMuted(next);
  }, []);

  const toggleMuted = useCallback(() => {
    const next = !areGameSoundsMuted();
    if (!next) unlockGameAudio();
    setGameSoundsMuted(next);
  }, []);

  return [muted, setMuted, toggleMuted];
}
