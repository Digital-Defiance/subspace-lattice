/**
 * Native Google OAuth for the Tauri webview (mobile + desktop).
 *
 * Firebase `signInWithPopup`/`signInWithRedirect` cannot work inside an embedded
 * webview (no popup window, and Google blocks OAuth in embedded user agents).
 * Instead we run the standard OAuth 2.0 Authorization Code + PKCE flow ourselves,
 * opening Google's consent screen in the SYSTEM browser and capturing the
 * redirect. How the redirect comes back differs by platform:
 *
 *   • Mobile (iOS/Android): Google redirects to the app's custom URL scheme
 *     (reversed client id), and `plugin-deep-link` hands us that URL. iOS/Android
 *     OAuth client types support custom-scheme redirects.
 *
 *   • Desktop (macOS/Windows/Linux): Google "Desktop" client types do NOT allow
 *     custom-scheme redirects — only the loopback flow. We bind a one-shot
 *     localhost server in Rust (`start_oauth_server`), use
 *     `http://127.0.0.1:<port>` as the redirect URI, and receive the callback
 *     URL via the `oauth://url` event.
 *
 * Either way we exchange the code for tokens and the caller signs into Firebase
 * with `signInWithCredential(idToken)`. See docs/mobile-google-signin.md.
 */

import { isTauriMobile, tauriPlatform } from './platform';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REDIRECT_PATH = '/oauth2redirect';

export interface GoogleNativeTokens {
  idToken: string;
  accessToken: string | null;
}

export class GoogleNativeAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleNativeAuthError';
  }
}

/**
 * Step logger for diagnosing the native OAuth flow.
 * Always persists to localStorage (release-safe); console only in DEV.
 * Callers must never pass token material.
 */
function oauthLog(step: string, detail?: unknown): void {
  if (detail === undefined) {
    console.info(`[oauth] ${step}`);
  } else {
    console.info(`[oauth] ${step}`, detail);
  }
}

interface OAuthClientConfig {
  clientId: string;
  /** Custom URL scheme Google redirects back to (registered in plist/manifest). */
  scheme: string;
  /** Only for "Desktop/installed" client types; iOS/Android clients omit this. */
  clientSecret?: string;
}

/** Reversed-client-id scheme, e.g. com.googleusercontent.apps.1234-abcd */
function reversedClientIdScheme(clientId: string): string {
  const bare = clientId.replace(/\.apps\.googleusercontent\.com$/, '');
  return `com.googleusercontent.apps.${bare}`;
}

/**
 * Resolve the platform's Google OAuth client. iOS and Android each need their
 * own client (iOS keyed to the bundle id; Android to package + SHA-1). The
 * redirect scheme defaults to the reversed client id but can be overridden per
 * platform via VITE_GOOGLE_OAUTH_REDIRECT_SCHEME(_ANDROID).
 */
function resolveClientConfig(platform: string | undefined): OAuthClientConfig {
  // Direct import.meta.env.VITE_* access — Vite only statically replaces these.
  const iosClientId = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID;
  const desktopClientId = import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID;
  const androidClientId = import.meta.env.VITE_GOOGLE_ANDROID_CLIENT_ID;
  const iosSecret = import.meta.env.VITE_GOOGLE_IOS_CLIENT_SECRET;
  const desktopSecret = import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_SECRET;
  const androidSecret = import.meta.env.VITE_GOOGLE_ANDROID_CLIENT_SECRET;
  const redirectScheme = import.meta.env.VITE_GOOGLE_OAUTH_REDIRECT_SCHEME;
  const redirectSchemeAndroid =
    import.meta.env.VITE_GOOGLE_OAUTH_REDIRECT_SCHEME_ANDROID;
  const redirectSchemeDesktop =
    import.meta.env.VITE_GOOGLE_OAUTH_REDIRECT_SCHEME_DESKTOP;

  // iOS uses its own iOS-type client (reversed-client-id scheme, no secret).
  if (platform === 'ios') {
    if (!iosClientId) {
      throw new GoogleNativeAuthError(
        'Missing VITE_GOOGLE_IOS_CLIENT_ID — the Google iOS OAuth client is not configured.',
      );
    }
    return {
      clientId: iosClientId,
      scheme: redirectScheme ?? reversedClientIdScheme(iosClientId),
      clientSecret: iosSecret,
    };
  }

  // Everything else (Android + macOS/Windows/Linux) uses a "Desktop/installed"
  // client. That client type is not platform-bound, so a single Desktop client
  // can serve them all. VITE_GOOGLE_DESKTOP_CLIENT_ID is preferred; the older
  // VITE_GOOGLE_ANDROID_CLIENT_ID is accepted as a fallback.
  const clientId = desktopClientId ?? androidClientId;
  if (!clientId) {
    throw new GoogleNativeAuthError(
      'Missing VITE_GOOGLE_DESKTOP_CLIENT_ID (or VITE_GOOGLE_ANDROID_CLIENT_ID) — the Google Desktop OAuth client is not configured.',
    );
  }
  const clientSecret = desktopSecret ?? androidSecret;
  const schemeOverride =
    platform === 'android' ? redirectSchemeAndroid : redirectSchemeDesktop;
  return {
    clientId,
    scheme: schemeOverride ?? reversedClientIdScheme(clientId),
    clientSecret,
  };
}

/** Custom-scheme redirect URI used by the mobile deep-link flow. */
function schemeRedirectUri(scheme: string): string {
  return `${scheme}:${REDIRECT_PATH}`;
}

/**
 * Pull an authorization code out of the redirect query params, validating the
 * `state` and surfacing any `error`. Returns null when this isn't the matching
 * redirect (wrong state / no code yet).
 */
function codeFromParams(
  params: URLSearchParams,
  expectedState: string
): string | null {
  if (params.get('state') !== expectedState) {
    return null;
  }
  const error = params.get('error');
  if (error) {
    throw new GoogleNativeAuthError(`Google denied the request: ${error}`);
  }
  return params.get('code');
}

/**
 * Extract the authorization code from a full redirect URL (loopback
 * `http://127.0.0.1:<port>/?…` or custom-scheme `scheme:/path?…`), validating
 * `state`. Returns null when the URL carries no query or a mismatched state;
 * throws {@link GoogleNativeAuthError} when Google returned an `error`.
 */
export function parseRedirectCode(
  raw: string,
  expectedState: string
): string | null {
  const queryIndex = raw.indexOf('?');
  if (queryIndex === -1) {
    return null;
  }
  const params = new URLSearchParams(raw.slice(queryIndex + 1));
  return codeFromParams(params, expectedState);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  );
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Wait for the OAuth redirect to re-open the app via the custom scheme.
 * Resolves with the `code` once the matching `state` arrives.
 *
 * The returned Promise does not resolve until the native listener is fully
 * registered (IPC round-trip complete), so the caller may safely open the
 * browser immediately after awaiting this function without risking a race
 * where the deep-link fires before the listener is active.
 */
async function awaitRedirectCode(
  expectedState: string,
  expectedScheme: string
): Promise<string> {
  const { onOpenUrl, getCurrent } = await import('@tauri-apps/plugin-deep-link');

  const extract = (urls: readonly string[]): string | null => {
    oauthLog('awaitRedirectCode: checking URLs', {
      count: urls.length,
      schemes: urls.map((u) => u.split(':')[0]),
    });
    for (const raw of urls) {
      oauthLog('awaitRedirectCode: examining URL', {
        matchesScheme: raw.startsWith(`${expectedScheme}:`),
        url: raw.replace(/code=[^&]+/, 'code=<redacted>'),
      });
      if (!raw.startsWith(`${expectedScheme}:`)) {
        continue;
      }
      const code = parseRedirectCode(raw, expectedState);
      if (code) {
        oauthLog('awaitRedirectCode: code extracted successfully');
        return code;
      }
      oauthLog('awaitRedirectCode: URL matched scheme but no valid code', {
        hasQueryString: raw.includes('?'),
      });
    }
    return null;
  };

  // A redirect that arrived before we started listening (cold launch).
  oauthLog('awaitRedirectCode: checking for cold launch URL');
  const initial = await getCurrent().catch(() => null);
  if (initial) {
    oauthLog('awaitRedirectCode: cold launch URLs found', {
      count: initial.length,
    });
    const code = extract(initial);
    if (code) {
      oauthLog('awaitRedirectCode: resolved from cold launch');
      return code;
    }
  } else {
    oauthLog('awaitRedirectCode: no cold launch URLs');
  }

  oauthLog('awaitRedirectCode: registering deep link listener');

  let resolveCode!: (code: string) => void;
  let rejectCode!: (err: unknown) => void;
  let settled = false;
  let timeoutHandle = 0;
  let unlisten: () => void = () => undefined;
  const listenerPromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const onVisibility = () => {
    if (document.visibilityState !== 'visible' || settled) {
      return;
    }
    oauthLog('awaitRedirectCode: app visible again — re-polling getCurrent');
    void tryGetCurrent('visibilitychange');
  };

  const finishOk = (code: string, source: string) => {
    if (settled) {
      return;
    }
    settled = true;
    oauthLog(`awaitRedirectCode: resolved via ${source}`);
    window.clearTimeout(timeoutHandle);
    document.removeEventListener('visibilitychange', onVisibility);
    unlisten();
    resolveCode(code);
  };

  const finishErr = (err: unknown) => {
    if (settled) {
      return;
    }
    settled = true;
    window.clearTimeout(timeoutHandle);
    document.removeEventListener('visibilitychange', onVisibility);
    unlisten();
    rejectCode(err);
  };

  const tryGetCurrent = async (source: string): Promise<void> => {
    try {
      const urls = await getCurrent().catch(() => null);
      if (!urls || urls.length === 0) {
        oauthLog(`awaitRedirectCode: ${source} — getCurrent empty`);
        return;
      }
      oauthLog(`awaitRedirectCode: ${source} — getCurrent`, {
        count: urls.length,
      });
      const code = extract(urls);
      if (code) {
        finishOk(code, source);
      }
    } catch (err) {
      oauthLog(`awaitRedirectCode: ${source} — getCurrent threw`, err);
    }
  };

  // CRITICAL: await onOpenUrl() so the native IPC round-trip completes and the
  // listener is active BEFORE runMobileDeepLinkOAuth opens the browser.
  unlisten = await onOpenUrl((urls) => {
    oauthLog('awaitRedirectCode: deep link event received');
    try {
      const code = extract(urls);
      if (code) {
        finishOk(code, 'onOpenUrl');
      }
    } catch (err) {
      oauthLog('awaitRedirectCode: error extracting code', err);
      finishErr(err);
    }
  });

  document.addEventListener('visibilitychange', onVisibility);

  oauthLog('awaitRedirectCode: listener registered — safe to open browser');

  timeoutHandle = window.setTimeout(() => {
    oauthLog('awaitRedirectCode: TIMEOUT after 5 minutes');
    finishErr(new GoogleNativeAuthError('Sign-in timed out.'));
  }, 5 * 60 * 1000);

  return listenerPromise;
}

async function exchangeCodeForTokens(
  code: string,
  verifier: string,
  config: OAuthClientConfig,
  redirectUri: string
): Promise<GoogleNativeTokens> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  if (config.clientSecret) {
    body.set('client_secret', config.clientSecret);
  }

  oauthLog('token exchange: POST', {
    endpoint: TOKEN_ENDPOINT,
    hasClientSecret: Boolean(config.clientSecret),
    redirectUri,
  });

  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (err) {
    oauthLog('token exchange: fetch threw', err);
    throw new GoogleNativeAuthError(
      `Token exchange request failed (network/CORS): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const rawBody = await response.text();
  // Only log the body on failure — a successful body contains access/id tokens.
  oauthLog('token exchange: response', {
    status: response.status,
    ok: response.ok,
    ...(response.ok ? {} : { body: rawBody.slice(0, 300) }),
  });

  if (!response.ok) {
    throw new GoogleNativeAuthError(
      `Token exchange failed (${response.status}): ${rawBody.slice(0, 300)}`
    );
  }

  const json = JSON.parse(rawBody) as {
    id_token?: string;
    access_token?: string;
  };
  if (!json.id_token) {
    throw new GoogleNativeAuthError('Google did not return an ID token.');
  }
  oauthLog('token exchange: id_token received');
  return { idToken: json.id_token, accessToken: json.access_token ?? null };
}

interface AuthRequest {
  authUrl: string;
  verifier: string;
  state: string;
}

/** Build the PKCE-protected authorization URL for the given redirect URI. */
async function buildAuthRequest(
  config: OAuthClientConfig,
  redirectUri: string
): Promise<AuthRequest> {
  const verifier = randomString();
  const challenge = await pkceChallenge(verifier);
  const state = randomString(16);
  const nonce = randomString(16);

  const authUrl = new URL(AUTH_ENDPOINT);
  authUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    prompt: 'select_account',
  }).toString();

  return { authUrl: authUrl.toString(), verifier, state };
}

/** Mobile (iOS/Android): consent in the system browser → custom-scheme deep link. */
async function runMobileDeepLinkOAuth(
  config: OAuthClientConfig
): Promise<GoogleNativeTokens> {
  const redirectUri = schemeRedirectUri(config.scheme);
  const { authUrl, verifier, state } = await buildAuthRequest(
    config,
    redirectUri
  );

  // Start listening before opening the browser so a fast redirect is not missed.
  const codePromise = awaitRedirectCode(state, config.scheme);

  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(authUrl);

  const code = await codePromise;
  return exchangeCodeForTokens(code, verifier, config, redirectUri);
}

/** Desktop (macOS/Windows/Linux): consent in the system browser → loopback server. */
async function runDesktopLoopbackOAuth(
  config: OAuthClientConfig
): Promise<GoogleNativeTokens> {
  const { invoke } = await import('@tauri-apps/api/core');
  const { openUrl } = await import('@tauri-apps/plugin-opener');

  oauthLog('desktop: starting loopback server');
  const port = await invoke<number>('start_oauth_server');
  oauthLog('desktop: loopback server started', { port });
  const redirectUri = `http://127.0.0.1:${port}`;
  const { authUrl, verifier, state } = await buildAuthRequest(
    config,
    redirectUri
  );

  // Start awaiting the captured redirect URL before opening the browser. The
  // Rust side buffers the URL in a channel, so there is no lost-event race even
  // if Google redirects before this invoke is dispatched.
  const redirectPromise = invoke<string>('await_oauth_redirect', { port });

  oauthLog('desktop: opening system browser');
  await openUrl(authUrl);

  oauthLog('desktop: awaiting redirect from loopback server');
  const redirectUrl = await redirectPromise;
  oauthLog('desktop: redirect received', {
    url: redirectUrl.replace(/code=[^&]+/, 'code=<redacted>'),
  });
  const code = parseRedirectCode(redirectUrl, state);
  if (!code) {
    throw new GoogleNativeAuthError(
      'The sign-in redirect did not contain an authorization code.'
    );
  }
  oauthLog('desktop: authorization code extracted');
  return exchangeCodeForTokens(code, verifier, config, redirectUri);
}

/**
 * Run the full native Google OAuth flow and return the resulting tokens.
 * Only valid inside the Tauri runtime; callers gate with `isTauriRuntime()`.
 */
export async function runNativeGoogleOAuth(): Promise<GoogleNativeTokens> {
  const platform = tauriPlatform();
  const mobile = isTauriMobile();
  oauthLog('runNativeGoogleOAuth', { platform, mobile });
  const config = resolveClientConfig(platform);
  oauthLog('resolved client config', {
    clientIdSuffix: config.clientId.slice(-24),
    hasClientSecret: Boolean(config.clientSecret),
  });
  try {
    const tokens = mobile
      ? await runMobileDeepLinkOAuth(config)
      : await runDesktopLoopbackOAuth(config);
    oauthLog('runNativeGoogleOAuth: tokens obtained');
    return tokens;
  } catch (err) {
    oauthLog('runNativeGoogleOAuth: FAILED', err);
    throw err;
  }
}
