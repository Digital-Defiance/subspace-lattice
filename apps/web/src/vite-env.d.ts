/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_USE_FIREBASE_EMULATORS?: string;
  readonly VITE_GOOGLE_IOS_CLIENT_ID?: string;
  readonly VITE_GOOGLE_ANDROID_CLIENT_ID?: string;
  readonly VITE_GOOGLE_DESKTOP_CLIENT_ID?: string;
  readonly VITE_GOOGLE_DESKTOP_CLIENT_SECRET?: string;
  readonly VITE_GOOGLE_ANDROID_CLIENT_SECRET?: string;
  readonly VITE_GOOGLE_OAUTH_REDIRECT_SCHEME?: string;
  readonly VITE_GOOGLE_OAUTH_REDIRECT_SCHEME_ANDROID?: string;
  readonly VITE_GOOGLE_OAUTH_REDIRECT_SCHEME_DESKTOP?: string;
  readonly TAURI_ENV_PLATFORM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
