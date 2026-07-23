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

function appleProvider(): OAuthProvider {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  return provider;
}

function tauriPlatform(): string | undefined {
  return (import.meta as ImportMeta & { env?: Record<string, string> }).env
    ?.TAURI_ENV_PLATFORM;
}

function isNativeAppleSignInSupported(): boolean {
  const platform = tauriPlatform();
  return platform === 'ios' || platform === 'darwin';
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
    b.toString(16).padStart(2, '0')
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

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    });
  }, []);

  const signInAnonymous = async () => {
    await signInAnonymously(getFirebaseAuth());
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(getFirebaseAuth(), provider);
  };

  const signInWithApple = async () => {
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
  };

  const logOut = async () => {
    await signOut(getFirebaseAuth());
  };

  return {
    user,
    loading,
    uid: user?.uid ?? null,
    signInAnonymous,
    signInWithGoogle,
    signInWithApple,
    logOut,
  };
}
