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

/** Optional full-bleed still under the scene chrome (filename under public/story/<episode-id>/). */
const backgroundAssetField = {
  backgroundAsset: z.string().min(1).optional(),
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
    ...backgroundAssetField,
  }),
  z.object({
    kind: z.literal('narration'),
    id: z.string(),
    voiceover: z.string(),
    durationHintSec: z.number().positive().default(6),
    headline: z.string().optional(),
    bullets: z.array(z.string()).optional(),
    ...backgroundAssetField,
  }),
  /** Lore beat — full-bleed art with headline / subhead (no board). */
  z.object({
    kind: z.literal('story'),
    id: z.string(),
    voiceover: z.string(),
    durationHintSec: z.number().positive().default(8),
    headline: z.string(),
    subhead: z.string().optional(),
    ...backgroundAssetField,
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
    ...backgroundAssetField,
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
    ...backgroundAssetField,
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
    ...backgroundAssetField,
  }),
  z.object({
    kind: z.literal('outro'),
    id: z.string(),
    voiceover: z.string(),
    durationHintSec: z.number().positive().default(5),
    headline: z.string(),
    subhead: z.string().optional(),
    nextEpisode: z.string().optional(),
    ...backgroundAssetField,
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
  scenes: z.array(SceneSchema).min(1),
});

export type OverlayFlags = z.infer<typeof OverlayFlagsSchema>;
export type PlyStats = z.infer<typeof PlyStatsSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type EpisodeScript = z.infer<typeof EpisodeScriptSchema>;

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
