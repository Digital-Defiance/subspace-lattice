import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  FEDERATION_COLLECTIONS,
  FEDERATION_PROFILE_URL,
  FEDERATION_PROFILE_URL_FALLBACK,
} from '@subspace-lattice/core';
import { getFirebaseDb } from './app';

export type ProfileVisibility = 'public' | 'private';

/** Shared IWGF Federation Profile (`playerProfiles/{uid}`). */
export interface FederationProfile {
  uid: string;
  /** Public call sign shown on ladders and as the default match name. */
  displayName: string;
  bio?: string;
  visibility: ProfileVisibility;
  createdAt: string;
  updatedAt: string;
}

export {
  FEDERATION_PROFILE_URL,
  FEDERATION_PROFILE_URL_FALLBACK,
};

export function resolveFederationCallSign(
  profile: Pick<FederationProfile, 'displayName'> | null | undefined,
  statsDisplayName?: string | null,
): string {
  const fromProfile = profile?.displayName?.trim();
  if (fromProfile) return fromProfile;
  const fromStats = statsDisplayName?.trim();
  if (fromStats) return fromStats;
  return '';
}

export async function fetchFederationProfile(
  uid: string,
): Promise<FederationProfile | null> {
  const snap = await getDoc(
    doc(getFirebaseDb(), FEDERATION_COLLECTIONS.playerProfiles, uid),
  );
  if (!snap.exists()) return null;
  return snap.data() as FederationProfile;
}

export async function fetchFederationCallSign(uid: string): Promise<string> {
  const profile = await fetchFederationProfile(uid);
  if (profile?.displayName?.trim()) {
    return profile.displayName.trim();
  }
  const statsSnap = await getDoc(
    doc(getFirebaseDb(), FEDERATION_COLLECTIONS.playerStats, uid),
  );
  if (statsSnap.exists()) {
    const name = String(
      (statsSnap.data() as { displayName?: string }).displayName ?? '',
    ).trim();
    if (name) return name;
  }
  return '';
}

/**
 * Lightweight call-sign write used when Lattice must set a name before the
 * player visits profile.iwgf.org. Prefer linking them to the Federation Profile
 * site for full bio / gaming IDs.
 */
export async function upsertFederationCallSign(
  uid: string,
  displayName: string,
): Promise<void> {
  const now = new Date().toISOString();
  const trimmed = displayName.trim().slice(0, 40) || 'Commander';
  const existing = await fetchFederationProfile(uid);
  await setDoc(
    doc(getFirebaseDb(), FEDERATION_COLLECTIONS.playerProfiles, uid),
    {
      uid,
      displayName: trimmed,
      visibility: existing?.visibility ?? 'public',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    },
    { merge: true },
  );
  await setDoc(
    doc(getFirebaseDb(), FEDERATION_COLLECTIONS.playerStats, uid),
    { uid, displayName: trimmed, updatedAt: now },
    { merge: true },
  );
}
