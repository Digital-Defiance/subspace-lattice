import type { EpisodeScript, Scene } from './schema';

export const FPS = 30;

/**
 * Silence after a voice clip ends, before the next scene.
 *
 * Board / ply beats need a real absorb window — the old 0.45s pad made
 * turn-by-turn episodes feel like a flipbook. Other scene kinds keep a
 * shorter breath so title cards don't drag.
 */
export const BOARD_AUDIO_TAIL_PAD_SEC = 2.25;
export const AUDIO_TAIL_PAD_SEC = 0.9;

export type AudioSeconds = Readonly<Record<string, number>>;

function hintSec(scene: Scene): number {
  return 'durationHintSec' in scene && scene.durationHintSec
    ? scene.durationHintSec
    : 5;
}

function audioTailPadSec(scene: Scene): number {
  return scene.kind === 'board' ? BOARD_AUDIO_TAIL_PAD_SEC : AUDIO_TAIL_PAD_SEC;
}

/** Wall-clock seconds for one scene (TTS length when present, else JSON hint). */
export function sceneDurationSec(
  scene: Scene,
  audioSeconds?: AudioSeconds,
): number {
  if (scene.kind === 'pause-predict') {
    const prompt =
      audioSeconds?.[scene.id] ?? scene.durationHintSec;
    const reveal =
      audioSeconds?.[`${scene.id}-reveal`] ?? scene.revealDurationHintSec;
    const pad =
      audioSeconds?.[scene.id] != null ||
      audioSeconds?.[`${scene.id}-reveal`] != null
        ? AUDIO_TAIL_PAD_SEC
        : 0;
    return prompt + reveal + pad;
  }

  const clip = audioSeconds?.[scene.id];
  if (clip != null) return clip + audioTailPadSec(scene);
  return hintSec(scene);
}

export function sceneDurationFrames(
  scene: Scene,
  fps = FPS,
  audioSeconds?: AudioSeconds,
): number {
  return Math.max(1, Math.round(sceneDurationSec(scene, audioSeconds) * fps));
}

/** Prompt half of a pause-predict beat, in frames. */
export function pausePromptFrames(
  scene: Extract<Scene, { kind: 'pause-predict' }>,
  fps = FPS,
  audioSeconds?: AudioSeconds,
): number {
  const prompt = audioSeconds?.[scene.id] ?? scene.durationHintSec;
  return Math.max(1, Math.round(prompt * fps));
}

export function episodeDurationFrames(
  episode: EpisodeScript,
  fps = episode.fps ?? FPS,
  audioSeconds?: AudioSeconds,
): number {
  return episode.scenes.reduce(
    (sum, scene) => sum + sceneDurationFrames(scene, fps, audioSeconds),
    0,
  );
}

export function sceneStarts(
  episode: EpisodeScript,
  fps = episode.fps ?? FPS,
  audioSeconds?: AudioSeconds,
): number[] {
  const starts: number[] = [];
  let t = 0;
  for (const scene of episode.scenes) {
    starts.push(t);
    t += sceneDurationFrames(scene, fps, audioSeconds);
  }
  return starts;
}
