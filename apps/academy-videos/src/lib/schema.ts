import { z } from 'zod';

/** Overlay flags for coaching HUD layers during a board beat. */
export const OverlayFlagsSchema = z.object({
  threeQuestions: z.boolean().optional(),
  hubEnPrise: z.boolean().optional(),
  targetLocked: z.boolean().optional(),
  /** Emphasize Sensor Net layer(s). */
  nets: z.enum(['white', 'black', 'both', 'contested']).optional(),
});

/** Engine facts for the ply, shown as a side panel instead of spoken aloud. */
export const PlyStatsSchema = z.object({
  netWhite: z.number().int().nonnegative().optional(),
  netBlack: z.number().int().nonnegative().optional(),
  locked: z.number().int().nonnegative().optional(),
  capture: z.string().optional(),
  result: z.string().optional(),
});

/**
 * Background music bed.
 *
 * Prefer a Remotion `public/`-relative path:
 * - `soundtrack/Void Pulse.mp3` — fleet OST (symlinked library)
 * - `audio/<episode-id>/intro-bed.mp3` — episode-local custom bed
 * - `story/<episode-id>/sting.mp3` — beside lore stills if needed
 *
 * Bare filenames (e.g. `Void Pulse.mp3`) still resolve under `soundtrack/`
 * for convenience. Object form adds mix / loop / span-key controls.
 *
 * Consecutive scenes whose resolved span `key` matches share one continuous
 * Audio mount (no restart). Use `key` to force a restart or stitch aliases.
 * Set `null` on a scene to silence an episode-level default for that beat.
 */
export const BgmObjectSchema = z.object({
  /** Remotion staticFile path under `public/` (see path rules above). */
  src: z.string().min(1),
  /** Peak bed level between / after VO (0–1). Default 0.8. */
  volume: z.number().min(0).max(1).optional(),
  /** Bed level while VO speaks (0–1). Default 0.15. */
  duck: z.number().min(0).max(1).optional(),
  /** Loop the bed when shorter than the span. Default true. */
  loop: z.boolean().optional(),
  /**
   * Identity for consecutive-span merging. Defaults to the resolved
   * static path. Change to force a cut, or align two different `src`
   * values into one span (advanced).
   */
  key: z.string().min(1).optional(),
});

export const BgmSpecSchema = z.union([
  z.string().min(1),
  BgmObjectSchema,
]);

/** Scene / episode field: path|object, or `null` to clear a default. */
export const BgmFieldSchema = z.union([BgmSpecSchema, z.null()]);

/** Optional full-bleed still under the scene chrome (filename under public/story/<episode-id>/). */
const atmosphereFields = {
  backgroundAsset: z.string().min(1).optional(),
  bgm: BgmFieldSchema.optional(),
};

export const SceneSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('title'),
    id: z.string(),
    voiceover: z.string(),
    durationHintSec: z.number().positive().default(4),
    eyebrow: z.string().optional(),
    headline: z.string(),
    subhead: z.string().optional(),
    ...atmosphereFields,
  }),
  z.object({
    kind: z.literal('narration'),
    id: z.string(),
    voiceover: z.string(),
    durationHintSec: z.number().positive().default(6),
    headline: z.string().optional(),
    bullets: z.array(z.string()).optional(),
    ...atmosphereFields,
  }),
  /** Lore beat — full-bleed art with headline / subhead (no board). */
  z.object({
    kind: z.literal('story'),
    id: z.string(),
    voiceover: z.string(),
    durationHintSec: z.number().positive().default(8),
    headline: z.string(),
    subhead: z.string().optional(),
    ...atmosphereFields,
  }),
  z.object({
    kind: z.literal('board'),
    id: z.string(),
    voiceover: z.string(),
    durationHintSec: z.number().positive().default(5),
    missionId: z.string(),
    /** Position after this many plies (0 = start). */
    ply: z.number().int().nonnegative(),
    moveLabel: z.string().optional(),
    overlays: OverlayFlagsSchema.optional(),
    stats: PlyStatsSchema.optional(),
    ...atmosphereFields,
  }),
  z.object({
    kind: z.literal('pause-predict'),
    id: z.string(),
    voiceover: z.string(),
    durationHintSec: z.number().positive().default(8),
    missionId: z.string(),
    ply: z.number().int().nonnegative(),
    prompt: z.string(),
    revealVoiceover: z.string(),
    revealDurationHintSec: z.number().positive().default(6),
    revealPly: z.number().int().nonnegative(),
    overlays: OverlayFlagsSchema.optional(),
    ...atmosphereFields,
  }),
  z.object({
    kind: z.literal('montage'),
    id: z.string(),
    voiceover: z.string(),
    durationHintSec: z.number().positive().default(8),
    missionId: z.string(),
    /** Inclusive ply range shown as a fast scrub. */
    fromPly: z.number().int().nonnegative(),
    toPly: z.number().int().nonnegative(),
    caption: z.string().optional(),
    ...atmosphereFields,
  }),
  z.object({
    kind: z.literal('outro'),
    id: z.string(),
    voiceover: z.string(),
    durationHintSec: z.number().positive().default(5),
    headline: z.string(),
    subhead: z.string().optional(),
    nextEpisode: z.string().optional(),
    ...atmosphereFields,
  }),
]);

export const EpisodeScriptSchema = z.object({
  id: z.string(),
  compositionId: z.string(),
  title: z.string(),
  youtubeTitle: z.string(),
  description: z.string(),
  fps: z.number().int().positive().default(30),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  /**
   * Default bed for every scene unless the scene sets its own `bgm`
   * (or `bgm: null` to stay silent on that beat).
   */
  bgm: BgmSpecSchema.optional(),
  scenes: z.array(SceneSchema).min(1),
});

export type OverlayFlags = z.infer<typeof OverlayFlagsSchema>;
export type PlyStats = z.infer<typeof PlyStatsSchema>;
export type BgmSpec = z.infer<typeof BgmSpecSchema>;
export type BgmObject = z.infer<typeof BgmObjectSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type EpisodeScript = z.infer<typeof EpisodeScriptSchema>;

/** Known top-level folders under academy-videos `public/`. */
const PUBLIC_ROOTS = [
  'soundtrack/',
  'audio/',
  'story/',
  'missions/',
  'sfx/',
] as const;

/**
 * Resolve a BGM `src` to a Remotion `staticFile` path under `public/`.
 *
 * - Explicit `soundtrack/…`, `audio/…`, `story/…`, `missions/…`, `sfx/…` → as-is
 * - Bare filename → `soundtrack/<file>` (fleet OST shorthand)
 * - Other relative paths (e.g. `custom/bed.mp3`) → used as-is under public/
 * - `episode:intro.mp3` → `audio/<episodeId>/intro.mp3`
 */
export function bgmStaticPath(src: string, episodeId?: string): string {
  const trimmed = src.trim().replace(/^\/+/, '');
  if (!trimmed) return trimmed;

  if (trimmed.startsWith('episode:')) {
    const rest = trimmed.slice('episode:'.length).replace(/^\/+/, '');
    if (!episodeId) {
      throw new Error(
        `bgm src "${src}" uses episode: prefix but no episode id is available`,
      );
    }
    return `audio/${episodeId}/${rest}`;
  }

  for (const root of PUBLIC_ROOTS) {
    if (trimmed.startsWith(root)) return trimmed;
  }

  // Bare file → fleet soundtrack library.
  if (!trimmed.includes('/')) {
    return `soundtrack/${trimmed}`;
  }

  return trimmed;
}

/** Normalize string|object BGM into a concrete object. */
export function normalizeBgmSpec(spec: BgmSpec): BgmObject {
  if (typeof spec === 'string') return { src: spec };
  return spec;
}

/**
 * Effective BGM for a scene: scene override, else episode default.
 * Scene `bgm: null` clears the episode default for that beat.
 */
export function resolveSceneBgm(
  scene: Scene,
  episode: EpisodeScript,
): BgmObject | null {
  if (scene.bgm === null) return null;
  if (scene.bgm != null) return normalizeBgmSpec(scene.bgm);
  if (episode.bgm != null) return normalizeBgmSpec(episode.bgm);
  return null;
}

/** Resolve Remotion staticFile path for a mission ply SVG. */
export function missionPlyStaticPath(missionId: string, ply: number): string {
  const pad = String(ply).padStart(3, '0');
  return `missions/${missionId}/ply-${pad}.svg`;
}

/**
 * Resolve Remotion staticFile path for story / lore stills.
 * `backgroundAsset` is a filename (e.g. `title.png`) under
 * `public/story/<episodeId>/`, or an explicit `story/...` path.
 */
export function storyBackgroundStaticPath(
  episodeId: string,
  backgroundAsset: string,
): string {
  const trimmed = backgroundAsset.trim().replace(/^\/+/, '');
  if (trimmed.startsWith('story/')) return trimmed;
  if (trimmed.includes('/')) return `story/${trimmed}`;
  return `story/${episodeId}/${trimmed}`;
}

/** @deprecated Use `bgmStaticPath`. */
export function soundtrackStaticPath(bgm: string): string {
  return bgmStaticPath(bgm);
}
