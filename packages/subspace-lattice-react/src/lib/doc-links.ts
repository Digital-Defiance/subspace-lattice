import { isTauriRuntime } from '../firebase/platform';

/** Canonical host for player-facing PDFs (also served from `apps/web/public/docs`). */
export const LATTICE_DOCS_ORIGIN = 'https://lattice.iwgf.org';

export const INTRO_MANUAL_PATH = '/docs/subspace-lattice-manual.pdf';
export const OFFICIAL_RULES_PATH = '/docs/rules.pdf';

export type LatticeDocId = 'manual' | 'rules';

const DOC_PATHS: Record<LatticeDocId, string> = {
  manual: INTRO_MANUAL_PATH,
  rules: OFFICIAL_RULES_PATH,
};

/**
 * URL for a rules/manual PDF.
 *
 * - Browser / Firebase: same-origin path so local Vite + hosting serve synced
 *   copies under `public/docs`.
 * - Tauri (desktop + mobile): absolute HTTPS. Relative `/docs/…` with
 *   `target="_blank"` fails in WKWebView (macOS/iOS); opening the hosted file
 *   in the system browser/viewer is reliable on every store build.
 */
export function latticeDocHref(doc: LatticeDocId): string {
  const path = DOC_PATHS[doc];
  return isTauriRuntime() ? `${LATTICE_DOCS_ORIGIN}${path}` : path;
}

/** Open a docs URL via the OS when inside Tauri; otherwise let the anchor navigate. */
export async function openLatticeDocUrl(href: string): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(href);
}
