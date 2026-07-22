import type { IGameRoom } from '../interfaces/gameRoom';

/**
 * Warp-style integrity: tactical advisor is suppressed on rated sectors.
 * Once a seat engages the advisor, the room is marked assisted (casual).
 */
export function isRoomRated(room: Pick<IGameRoom, 'rated' | 'assisted'>): boolean {
  return room.rated === true && room.assisted !== true;
}

/** True when Ask advisor / teaching should be available. */
export function isAdvisorAvailable(
  room: Pick<IGameRoom, 'rated' | 'assisted'>,
): boolean {
  return !isRoomRated(room);
}

/**
 * Whether engaging the advisor requires an “unrate / assisted” consent step.
 * Local AI always consents once; online rated rooms consent to mark assisted.
 */
export function advisorRequiresUnrateConsent(
  room: Pick<IGameRoom, 'rated' | 'assisted'> | null | undefined,
  alreadyAssistedLocally: boolean,
): boolean {
  if (alreadyAssistedLocally) return false;
  if (!room) return true; // local / offline — TEI consent
  if (room.assisted) return false;
  return room.rated === true;
}

/** Rated, unassisted online finish — eligible for human TEI. */
export function shouldRecordOnlineTei(
  room: Pick<IGameRoom, 'rated' | 'assisted'>,
): boolean {
  return isRoomRated(room);
}
