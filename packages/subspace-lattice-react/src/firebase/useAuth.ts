import {
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { useEffect, useState } from 'react';
import { getFirebaseAuth } from './app';
import { runNativeGoogleOAuth } from './google-oauth-native';
import {
  isNativeAppleSignInSupported,
  isTauriRuntime,
  isTauriWindows,
} from './platform';

function appleProvider(): OAuthProvider {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  return provider;
}

function randomNonce(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

async function runNativeAppleSignIn(): Promise<{
  idToken: string;
  rawNonce: string;
}> {
  const { getAppleIdCredential } = await import('tauri-plugin-siwa-api');
  const rawNonce = randomNonce();
  const nonce = await sha256Hex(rawNonce);
  const response = await getAppleIdCredential({
    scope: ['fullName', 'email'],
    nonce,
  });
  const idToken = response.identityToken?.trim();
  if (!idToken) {
    throw new Error('Apple did not return an identity token.');
  }
  return { idToken, rawNonce };
}

function formatAuthError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: string }).code);
    const message =
      err instanceof Error
        ? err.message
        : String((err as { message?: string }).message ?? err);
    return message || code;
  }
  return err instanceof Error ? err.message : String(err);
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    });
  }, []);

  const runAuth = async (action: () => Promise<void>) => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await action();
    } catch (err) {
      const message = formatAuthError(err);
      console.error('[auth]', message, err);
      setAuthError(message);
    } finally {
      setAuthBusy(false);
    }
  };

  const signInAnonymous = () =>
    runAuth(async () => {
      await signInAnonymously(getFirebaseAuth());
    });

  const signInWithGoogle = () =>
    runAuth(async () => {
      const auth = getFirebaseAuth();
      // Firebase popups do not work in Tauri webviews (esp. Windows).
      if (isTauriRuntime()) {
        const tokens = await runNativeGoogleOAuth();
        const credential = GoogleAuthProvider.credential(
          tokens.idToken,
          tokens.accessToken ?? undefined,
        );
        await signInWithCredential(auth, credential);
        return;
      }
      await signInWithPopup(auth, new GoogleAuthProvider());
    });

  const signInWithApple = () =>
    runAuth(async () => {
      if (isTauriWindows()) {
        throw new Error(
          'Sign in with Apple is not available on Windows. Use Google or play anonymously.',
        );
      }
      const auth = getFirebaseAuth();
      if (isNativeAppleSignInSupported()) {
        const tokens = await runNativeAppleSignIn();
        const credential = appleProvider().credential({
          idToken: tokens.idToken,
          rawNonce: tokens.rawNonce,
        });
        await signInWithCredential(auth, credential);
        return;
      }
      await signInWithPopup(auth, appleProvider());
    });

  const logOut = () =>
    runAuth(async () => {
      await signOut(getFirebaseAuth());
    });

  const clearAuthError = () => setAuthError(null);

  return {
    user,
    loading,
    uid: user?.uid ?? null,
    authError,
    authBusy,
    clearAuthError,
    appleSignInAvailable: !isTauriWindows(),
    signInAnonymous,
    signInWithGoogle,
    signInWithApple,
    logOut,
  };
}
