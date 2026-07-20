import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { useEffect, useState } from 'react';
import { getFirebaseAuth } from './app';

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

  const logOut = async () => {
    await signOut(getFirebaseAuth());
  };

  return {
    user,
    loading,
    uid: user?.uid ?? null,
    signInAnonymous,
    signInWithGoogle,
    logOut,
  };
}
