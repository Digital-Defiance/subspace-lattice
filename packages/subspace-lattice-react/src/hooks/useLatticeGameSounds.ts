import { useEffect, useRef } from 'react';
import {
  GameState,
  PlayerColor,
  SubspaceLatticeEngine,
} from '@subspace-lattice/core';
import {
  collectLatticeSoundsAfterPly,
  playGameSounds,
} from '../lib/game-sounds';

function soundFingerprint(state: GameState): string {
  return [
    state.plyCount ?? 0,
    state.winner ?? '',
    state.winnerReason ?? '',
    state.empActive
      ? `${state.empActive.firedBy}:${state.empActive.pliesRemaining}`
      : '',
    state.empCharge?.[PlayerColor.White] ?? 0,
    state.empCharge?.[PlayerColor.Black] ?? 0,
    Object.values(state.pieces ?? {})
      .map((p) => `${p.id}:${p.position.x},${p.position.y}`)
      .sort()
      .join('|'),
  ].join(';');
}

/**
 * Play catalog SFX when an online (synced) engine advances.
 * Relies on GameState deltas — MoveInfo is not persisted in Firestore.
 */
export function useLatticeGameSounds(
  engine: SubspaceLatticeEngine | null,
  enabled = true,
): void {
  const prevRef = useRef<GameState | null>(null);
  const fingerprint = engine ? soundFingerprint(engine.getState()) : null;

  useEffect(() => {
    if (!enabled || !engine || fingerprint == null) {
      prevRef.current = null;
      return;
    }

    const after = engine.getState();
    const before = prevRef.current;
    if (before) {
      const sounds = collectLatticeSoundsAfterPly(
        before,
        after,
        engine.getRules(),
        null,
      );
      if (sounds.length > 0) playGameSounds(sounds);
    }
    prevRef.current = structuredClone(after);
  }, [enabled, engine, fingerprint]);
}
