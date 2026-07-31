export const ORIGIN_STORY_YOUTUBE_ID = 'Au0OwdSuslg';

/** Watch-page / share URL. */
export const ORIGIN_STORY_YOUTUBE_URL = `https://youtu.be/${ORIGIN_STORY_YOUTUBE_ID}`;

/**
 * Approximate published length (seconds). Used when the YouTube IFrame API
 * is blocked and we cannot poll player time.
 */
export const ORIGIN_STORY_DURATION_SEC = 140;

const STORAGE_KEY = 'lattice-origin-welcome-seen';

export function hasSeenOriginWelcome(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Private mode / blocked storage — don't trap the player.
    return true;
  }
}

export function markOriginWelcomeSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // ignore
  }
}
