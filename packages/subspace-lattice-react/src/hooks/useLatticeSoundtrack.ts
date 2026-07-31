import { useEffect } from 'react';
import {
  PlayerColor,
  type SubspaceLatticeEngine,
} from '@subspace-lattice/core';
import {
  stopSoundtrack,
  syncSoundtrack,
  type SoundtrackScene,
} from '../lib/soundtrack';
import { useSoundtrackEnabled } from './useSoundtrackEnabled';

function soundtrackFingerprint(
  engine: SubspaceLatticeEngine,
): string {
  const state = engine.getState();
  const contestedBit = (() => {
    try {
      const w = engine.getSensorNetSet(PlayerColor.White);
      const b = engine.getSensorNetSet(PlayerColor.Black);
      for (const key of w) {
        if (b.has(key)) return '1';
      }
      return '0';
    } catch {
      return '0';
    }
  })();
  return [
    state.plyCount ?? 0,
    state.winner ?? '',
    state.winnerReason ?? '',
    state.terminalPhaseArmed ? '1' : '0',
    contestedBit,
    Object.values(state.pieces ?? {})
      .map((p) => `${p.id}:${p.position.x},${p.position.y}`)
      .sort()
      .join('|'),
  ].join(';');
}

export interface LatticeSoundtrackOptions {
  /** Defaults to `match` when an engine is driving; use for pre-match surfaces. */
  scene?: SoundtrackScene;
  matchLive?: boolean;
  matchKey?: string | null;
  localPlayer?: PlayerColor | 'OBSERVER' | null;
  /**
   * When true, unmount stops playback. Landing leaves audio running so
   * `/play` can crossfade into lobby without a hard cut.
   */
  stopOnUnmount?: boolean;
}

/**
 * Adaptive soundtrack driver. Opt-in via Options (default off).
 */
export function useLatticeSoundtrack(
  engine: SubspaceLatticeEngine | null,
  options: LatticeSoundtrackOptions = {},
): void {
  const [enabled] = useSoundtrackEnabled();
  const {
    scene = 'match',
    matchLive = false,
    matchKey = null,
    localPlayer = null,
    stopOnUnmount = true,
  } = options;
  const fingerprint =
    scene === 'match' && engine ? soundtrackFingerprint(engine) : scene;

  useEffect(() => {
    syncSoundtrack({
      enabled,
      scene: enabled ? scene : 'idle',
      matchLive,
      matchKey,
      engine,
      localPlayer,
    });
  }, [enabled, scene, matchLive, matchKey, engine, localPlayer, fingerprint]);

  useEffect(() => {
    if (!stopOnUnmount) return undefined;
    return () => {
      stopSoundtrack();
    };
  }, [stopOnUnmount]);
}
