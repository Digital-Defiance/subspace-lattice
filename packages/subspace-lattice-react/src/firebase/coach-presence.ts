import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { LATTICE_COLLECTIONS } from '@subspace-lattice/core';
import { getFirebaseDb } from './app';

/** Warp-style coach presence — signal only, never the advice text. */
export interface CoachPresence {
  coachRequestedAt?: string;
  coachUsedThisMatch?: boolean;
  plyCount?: number;
}

export const COACH_FLASH_MS = 45_000;

export function coachPresenceRef(roomId: string, playerId: string) {
  const db = getFirebaseDb();
  return doc(db, LATTICE_COLLECTIONS.rooms, roomId, 'presence', playerId);
}

/**
 * Flash “advisor engaged” for other seats / spectators.
 * Does not include the suggested move (privacy / integrity).
 */
export async function signalCoachRequest(
  roomId: string,
  playerId: string,
  plyCount?: number,
): Promise<void> {
  await setDoc(
    coachPresenceRef(roomId, playerId),
    {
      coachRequestedAt: new Date().toISOString(),
      coachUsedThisMatch: true,
      ...(typeof plyCount === 'number' ? { plyCount } : {}),
    } satisfies CoachPresence,
    { merge: true },
  );
}

export function subscribeCoachPresence(
  roomId: string,
  onUpdate: (presence: Record<string, CoachPresence>) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseDb();
  const presenceCol = collection(
    db,
    LATTICE_COLLECTIONS.rooms,
    roomId,
    'presence',
  );

  return onSnapshot(
    presenceCol,
    (snapshot) => {
      const presence: Record<string, CoachPresence> = {};
      for (const docSnap of snapshot.docs) {
        presence[docSnap.id] = docSnap.data() as CoachPresence;
      }
      onUpdate(presence);
    },
    (err) => onError?.(err instanceof Error ? err : new Error(String(err))),
  );
}

export interface CoachIndicator {
  flash: boolean;
  usedThisMatch: boolean;
}

/** Derive flash/used flags for a seat (Warp coachIndicatorForSeat). */
export function coachIndicatorForSeat(
  presence: CoachPresence | undefined,
  nowMs: number = Date.now(),
  flashMs: number = COACH_FLASH_MS,
): CoachIndicator {
  if (!presence) {
    return { flash: false, usedThisMatch: false };
  }
  const used = Boolean(presence.coachUsedThisMatch);
  const at = presence.coachRequestedAt
    ? Date.parse(presence.coachRequestedAt)
    : NaN;
  const flash = Number.isFinite(at) && nowMs - at <= flashMs;
  return { flash, usedThisMatch: used };
}
