/** Remotion `staticFile` path for a scene voice clip (no Node imports). */
export function sceneAudioStaticPath(
  episodeId: string,
  sceneId: string,
  kind: 'main' | 'reveal' = 'main',
): string {
  const suffix = kind === 'reveal' ? '-reveal' : '';
  return `audio/${episodeId}/${sceneId}${suffix}.mp3`;
}

/** ElevenLabs character-alignment sidecar (sentence cues for captions). */
export function sceneAlignmentStaticPath(
  episodeId: string,
  sceneId: string,
  kind: 'main' | 'reveal' = 'main',
): string {
  const suffix = kind === 'reveal' ? '-reveal' : '';
  return `audio/${episodeId}/${sceneId}${suffix}.alignment.json`;
}

export type CaptionSentence = {
  text: string;
  startSec: number;
  endSec: number;
};

export type SceneAlignmentFile = {
  spoken: string;
  sentences: CaptionSentence[];
};
