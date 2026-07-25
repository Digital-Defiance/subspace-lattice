/** Remotion `staticFile` path for a scene voice clip (no Node imports). */
export function sceneAudioStaticPath(
  episodeId: string,
  sceneId: string,
  kind: 'main' | 'reveal' = 'main',
): string {
  const suffix = kind === 'reveal' ? '-reveal' : '';
  return `audio/${episodeId}/${sceneId}${suffix}.mp3`;
}
