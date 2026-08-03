import { getAudioDurationInSeconds } from '@remotion/media-utils';
import { staticFile } from 'remotion';
import { ostSoundtrackStaticPath, type OstFamily } from './ost-catalog';

export type OstTrackDurations = readonly number[];

/** Wall-clock seconds per stem (order matches `family.stems`). */
export async function resolveOstTrackDurations(
  family: OstFamily,
): Promise<OstTrackDurations> {
  const out: number[] = [];
  for (const stem of family.stems) {
    const src = staticFile(ostSoundtrackStaticPath(stem));
    const sec = await getAudioDurationInSeconds(src);
    if (!Number.isFinite(sec) || sec <= 0) {
      throw new Error(`OST: bad duration for ${stem} (${sec})`);
    }
    out.push(sec);
  }
  return out;
}

export function ostFamilyDurationFrames(
  trackSeconds: OstTrackDurations,
  fps: number,
): number {
  const total = trackSeconds.reduce((s, n) => s + n, 0);
  return Math.max(1, Math.round(total * fps));
}

export function ostTrackStartsFrames(
  trackSeconds: OstTrackDurations,
  fps: number,
): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const sec of trackSeconds) {
    starts.push(Math.round(acc * fps));
    acc += sec;
  }
  return starts;
}
