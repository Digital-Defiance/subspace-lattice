import type { SubspaceFirebaseConfig } from '@subspace-lattice/react';

export function readFirebaseWebConfig(): SubspaceFirebaseConfig {
  // Opt-in only. Never force emulators just because Vite is in DEV —
  // that breaks local work against production Firebase when emulators
  // are not running. Set VITE_USE_FIREBASE_EMULATORS=true in .env.local.
  const useEmulators =
    !import.meta.env.PROD &&
    import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'demo-api-key',
    authDomain:
      import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'warp-12.firebaseapp.com',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'warp-12',
    storageBucket:
      import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ??
      'warp-12.firebasestorage.app',
    messagingSenderId:
      import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '000000000000',
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '1:000000000000:web:demo',
    useEmulators,
  };
}
