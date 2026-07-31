import { useEffect, useRef } from 'react';
import {
  GameState,
  PlayerColor,
  SubspaceLatticeEngine,
} from '@subspace-lattice/core';
import {
  collectLatticeSoundsAfterPly,
  playGameSound,
  playGameSounds,
} from '../lib/game-sounds';

function soundFingerprint(state: GameState): string {
  return [
    state.plyCount ?? 0,
    state.winner ?? '',
    state.winnerReason ?? '',
    state.terminalPhaseArmed ? '1' : '0',
    state.terminalPhaseArmedAtPly ?? '',
    state.empActive
      ? `${state.empActive.firedBy}:${state.empActive.pliesRemaining}:${state.empActive.radius}`
      : '',
    state.empCharge?.[PlayerColor.White] ?? 0,
    state.empCharge?.[PlayerColor.Black] ?? 0,
    Object.values(state.pieces ?? {})
      .map((p) => `${p.id}:${p.position.x},${p.position.y}:${p.enginesFused ? 'f' : ''}`)
      .sort()
      .join('|'),
  ].join(';');
}

export interface LatticeGameSoundsOptions {
  /** Both captains seated — sector is live. */
  matchReady?: boolean;
  /** Stable room id so start SFX fires once per match, not on remount. */
  roomId?: string | null;
}

/**
 * Play catalog SFX when an online (synced) engine advances.
 * Relies on GameState deltas — MoveInfo is not persisted in Firestore.
 * Also plays `game-start` once when the match becomes ready at ply 0.
 */
export function useLatticeGameSounds(
  engine: SubspaceLatticeEngine | null,
  enabled = true,
  options: LatticeGameSoundsOptions = {},
): void {
  const { matchReady = false, roomId = null } = options;
  const prevRef = useRef<GameState | null>(null);
  const startPlayedForRoomRef = useRef<string | null>(null);
  const fingerprint = engine ? soundFingerprint(engine.getState()) : null;

  useEffect(() => {
    if (!enabled) {
      prevRef.current = null;
      startPlayedForRoomRef.current = null;
      return;
    }
    if (!engine || !matchReady || !roomId) return;

    const state = engine.getState();
    if ((state.plyCount ?? 0) > 0 || state.winner) return;
    if (startPlayedForRoomRef.current === roomId) return;

    startPlayedForRoomRef.current = roomId;
    playGameSound('game-start');
  }, [enabled, engine, matchReady, roomId]);

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
