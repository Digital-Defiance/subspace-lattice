import type { FirebaseOptions } from 'firebase/app';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  type Functions,
} from 'firebase/functions';

export type SubspaceFirebaseConfig = FirebaseOptions & {
  useEmulators?: boolean;
  authEmulatorHost?: string;
  firestoreEmulatorHost?: string;
  functionsEmulatorHost?: string;
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let functions: Functions | undefined;
let emulatorsConnected = false;

export function initFirebase(config: SubspaceFirebaseConfig): FirebaseApp {
  if (!getApps().length) {
    app = initializeApp(config);
  } else {
    app = getApps()[0];
  }

  auth = getAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app);

  if (config.useEmulators && !emulatorsConnected) {
    connectAuthEmulator(
      auth,
      config.authEmulatorHost ?? 'http://127.0.0.1:9099',
      { disableWarnings: true },
    );
    const [fsHost, fsPort] = (
      config.firestoreEmulatorHost ?? '127.0.0.1:8080'
    ).split(':');
    connectFirestoreEmulator(db, fsHost, Number(fsPort));
    const [fnHost, fnPort] = (
      config.functionsEmulatorHost ?? '127.0.0.1:5001'
    ).split(':');
    connectFunctionsEmulator(functions, fnHost, Number(fnPort));
    emulatorsConnected = true;
  }

  return app;
}

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    throw new Error('Firebase not initialized. Call initFirebase() first.');
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    throw new Error('Firebase not initialized. Call initFirebase() first.');
  }
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (!db) {
    throw new Error('Firebase not initialized. Call initFirebase() first.');
  }
  return db;
}

export function getFirebaseFunctions(): Functions {
  if (!functions) {
    throw new Error('Firebase not initialized. Call initFirebase() first.');
  }
  return functions;
}
