import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import {
  FEDERATION_PROFILE_URL,
  FEDERATION_PROFILE_URL_FALLBACK,
  fetchFederationCallSign,
} from './federation-profile';

/**
 * Loads the signed-in user's Federation Profile call sign (playerProfiles).
 * Empty string when anonymous, unsigned, or unset — callers use seat defaults.
 */
export function useFederationProfile() {
  const { user, uid } = useAuth();
  const [callSign, setCallSign] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!uid || !user || user.isAnonymous) {
      setCallSign('');
      return;
    }
    setLoading(true);
    try {
      setCallSign(await fetchFederationCallSign(uid));
    } catch {
      setCallSign('');
    } finally {
      setLoading(false);
    }
  }, [uid, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    callSign,
    loading,
    refresh,
    profileUrl: FEDERATION_PROFILE_URL,
    profileUrlFallback: FEDERATION_PROFILE_URL_FALLBACK,
  };
}
