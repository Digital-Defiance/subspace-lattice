/**
 * Runtime platform helpers.
 *
 * `TAURI_ENV_PLATFORM` is injected at build time by the Tauri CLI (e.g. "ios",
 * "android", "windows", "darwin"). It is undefined for the plain web build.
 */
export function tauriPlatform(): string | undefined {
  return (import.meta as ImportMeta & { env?: Record<string, string> }).env
    ?.TAURI_ENV_PLATFORM;
}

function hasTauriGlobals(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  );
}

/** True when running inside the Tauri runtime (desktop or mobile webview). */
export function isTauriRuntime(): boolean {
  return Boolean(tauriPlatform()) || hasTauriGlobals();
}

export function isTauriMobile(): boolean {
  const platform = tauriPlatform();
  if (platform === 'ios' || platform === 'android') {
    return true;
  }
  if (platform) {
    return false;
  }
  if (!hasTauriGlobals()) {
    return false;
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return /iPhone|iPad|iPod|Android/i.test(ua);
}

export function isTauriDesktop(): boolean {
  return isTauriRuntime() && !isTauriMobile();
}

export function isTauriWindows(): boolean {
  if (tauriPlatform() === 'windows') {
    return true;
  }
  if (!isTauriDesktop()) {
    return false;
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return /Windows/i.test(ua);
}

export function isNativeAppleSignInSupported(): boolean {
  const platform = tauriPlatform();
  return platform === 'ios' || platform === 'darwin';
}
