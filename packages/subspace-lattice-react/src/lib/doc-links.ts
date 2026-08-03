import { isTauriRuntime } from '../firebase/platform';

/** Canonical host for player-facing PDFs (also served from `apps/web/public/docs`). */
export const LATTICE_DOCS_ORIGIN = 'https://lattice.iwgf.org';

/** VitePress handbook (deployed separately to latticedocs). */
export const LATTICE_HANDBOOK_ORIGIN = 'https://docs.lattice.iwgf.org';

export const INTRO_MANUAL_PATH = '/docs/subspace-lattice-manual.pdf';
export const OFFICIAL_RULES_PATH = '/docs/rules.pdf';
export const ADVANCED_MANUAL_PATH = '/docs/advanced-manual.pdf';
/** Illustrated Sector 11 storybook PDF (InDesign twin of the `/story` page). */
export const STORY_PDF_PATH = '/docs/story.pdf';
/** Plain-text Sector 11 briefing (Markdown twin of the `/story` page). */
export const STORY_BRIEFING_PATH = '/docs/story.md';
/** Player fantasy / wins / TEI (Markdown twin of the handbook overview). */
export const PLAYER_OVERVIEW_PATH = '/docs/player-overview.md';

export type LatticeDocId =
  | 'manual'
  | 'rules'
  | 'advanced'
  | 'story'
  | 'storyPdf'
  | 'overview'
  | 'handbook';

const DOC_HREFS: Record<LatticeDocId, string> = {
  manual: INTRO_MANUAL_PATH,
  rules: OFFICIAL_RULES_PATH,
  advanced: ADVANCED_MANUAL_PATH,
  story: STORY_BRIEFING_PATH,
  storyPdf: STORY_PDF_PATH,
  overview: PLAYER_OVERVIEW_PATH,
  handbook: LATTICE_HANDBOOK_ORIGIN,
};

/**
 * URL for a rules/manual PDF, Markdown briefing, or handbook.
 *
 * - Browser / Firebase: same-origin path so local Vite + hosting serve synced
 *   copies under `public/docs` (handbook stays absolute — separate site).
 * - Tauri (desktop + mobile): absolute HTTPS. Relative `/docs/…` with
 *   `target="_blank"` fails in WKWebView (macOS/iOS); opening the hosted file
 *   in the system browser/viewer is reliable on every store build.
 */
export function latticeDocHref(doc: LatticeDocId): string {
  const href = DOC_HREFS[doc];
  if (/^https?:\/\//i.test(href)) return href;
  return isTauriRuntime() ? `${LATTICE_DOCS_ORIGIN}${href}` : href;
}

/** Open a docs URL via the OS when inside Tauri; otherwise let the anchor navigate. */
export async function openLatticeDocUrl(href: string): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(href);
}
