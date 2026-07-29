/**
 * Optional `public/pieces/{n}/pack.json` fields for high-contrast Outline.
 *
 * Prefer the explicit need flags when a side is already readable without a
 * CSS white trace (e.g. bright white art) but the other side is not:
 *
 * ```json
 * { "needsOutlineBlack": true, "needsOutlineWhite": false }
 * ```
 *
 * Legacy aliases (same meaning as the inverse of needsOutline*):
 * - `hasOutline` — both sides already rimmed (Outline is a no-op)
 * - `hasLightRim` — black art already has a light rim
 * - `hasLightRimWhite` — white art already has a light rim
 */
export type PackJson = {
  title?: unknown;
  needsOutlineBlack?: unknown;
  needsOutlineWhite?: unknown;
  hasOutline?: unknown;
  hasLightRim?: unknown;
  hasLightRimWhite?: unknown;
};

/** Baked white / near-white stroke (already visible on dark boards). */
export const LIGHT_STROKE_RE =
  /stroke\s*[:=]\s*(?:#fff(?:fff)?\b|white\b|rgb\(\s*100%\s*,\s*100%\s*,\s*100%\s*\)|rgba?\(\s*255\s*,\s*255\s*,\s*255)/i;

export interface StyleRimFlags {
  /** Black pieces already have a light rim — skip CSS outline. */
  lightRimOnBlack: boolean;
  /** White pieces already have a light rim — skip CSS outline. */
  lightRimOnWhite: boolean;
}

/**
 * Resolve rim flags from pack.json (+ SVG fallback). Exported for tests /
 * manifest codegen.
 * `lightRimOn*` true means “do not apply the CSS Outline trace on that side.”
 */
export function resolveStyleRimFlags(
  pack: PackJson | undefined,
  blackKingSvg?: string,
  whiteKingSvg?: string,
): StyleRimFlags {
  let lightRimOnBlack: boolean | undefined;
  let lightRimOnWhite: boolean | undefined;

  // Explicit needsOutline* wins (true → apply CSS outline when toggled).
  if (typeof pack?.needsOutlineBlack === 'boolean') {
    lightRimOnBlack = !pack.needsOutlineBlack;
  }
  if (typeof pack?.needsOutlineWhite === 'boolean') {
    lightRimOnWhite = !pack.needsOutlineWhite;
  }

  if (typeof pack?.hasOutline === 'boolean') {
    if (lightRimOnBlack === undefined) lightRimOnBlack = pack.hasOutline;
    if (lightRimOnWhite === undefined) lightRimOnWhite = pack.hasOutline;
  }
  if (
    typeof pack?.hasLightRim === 'boolean' &&
    lightRimOnBlack === undefined
  ) {
    lightRimOnBlack = pack.hasLightRim;
  }
  if (
    typeof pack?.hasLightRimWhite === 'boolean' &&
    lightRimOnWhite === undefined
  ) {
    lightRimOnWhite = pack.hasLightRimWhite;
  }

  if (lightRimOnBlack === undefined) {
    lightRimOnBlack =
      typeof blackKingSvg === 'string' && LIGHT_STROKE_RE.test(blackKingSvg);
  }
  if (lightRimOnWhite === undefined) {
    lightRimOnWhite =
      typeof whiteKingSvg === 'string' && LIGHT_STROKE_RE.test(whiteKingSvg);
  }

  return { lightRimOnBlack, lightRimOnWhite };
}
