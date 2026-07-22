/**
 * Firestore collection names for the shared warp-12 project.
 * Namespaced so Lattice never collides with Warp's `games` / `playerStats`.
 *
 * TEI lives in `latticeTei` — Lattice’s own rating collection (same TEI
 * alphabet via warp12-engine, separate OpenSkill pool / docs from Warp).
 */
export const LATTICE_COLLECTIONS = {
  rooms: 'latticeRooms',
  roomCodes: 'latticeRoomCodes',
  /** OpenSkill + display TEI per uid (local AI + future human track). */
  tei: 'latticeTei',
  ratingEvents: 'latticeRatingEvents',
} as const;

/**
 * Shared IWGF identity (same docs Warp uses). Not Lattice-namespaced.
 * Edit at https://profile.iwgf.org (iwgf.org/profile until the domain is live).
 */
export const FEDERATION_COLLECTIONS = {
  playerProfiles: 'playerProfiles',
  playerStats: 'playerStats',
} as const;

export const FEDERATION_PROFILE_URL = 'https://profile.iwgf.org';
/** Fallback while profile.iwgf.org DNS/hosting is attached. */
export const FEDERATION_PROFILE_URL_FALLBACK = 'https://iwgf.org/profile';

export type LatticeCollection =
  (typeof LATTICE_COLLECTIONS)[keyof typeof LATTICE_COLLECTIONS];
