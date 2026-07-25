import { getAudioDurationInSeconds } from '@remotion/media-utils';
import { staticFile } from 'remotion';
import type { Scene } from './schema';
import { sceneAudioStaticPath } from './audio-paths';

/**
 * Measure every available TTS clip for an episode.
 * Keys are `sceneId` or `sceneId-reveal` (pause-predict second half).
 * Missing clips are skipped (scene falls back to durationHintSec).
 */
export async function resolveAudioSeconds(
  episodeId: string,
  scenes: readonly Scene[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const scene of scenes) {
    const jobs: Array<{ key: string; kind: 'main' | 'reveal' }> = [
      { key: scene.id, kind: 'main' },
    ];
    if (scene.kind === 'pause-predict') {
      jobs.push({ key: `${scene.id}-reveal`, kind: 'reveal' });
    }
    for (const { key, kind } of jobs) {
      const src = staticFile(
        sceneAudioStaticPath(episodeId, scene.id, kind),
      );
      try {
        out[key] = await getAudioDurationInSeconds(src);
      } catch {
        // Clip not generated yet — keep durationHintSec.
      }
    }
  }
  return out;
}
