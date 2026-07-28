import { getStyleCount } from './Piece';

export interface PieceStylesProps {
  selectedStyle: number;
  onStyleChange: (style: number) => void;
}

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

const packJsonModules = import.meta.glob(
  '../../../../apps/web/public/pieces/*/pack.json',
  { eager: true },
);

const blackKingModules = import.meta.glob(
  '../../../../apps/web/public/pieces/*/bk.svg',
  { eager: true, query: '?raw', import: 'default' },
);

const whiteKingModules = import.meta.glob(
  '../../../../apps/web/public/pieces/*/wk.svg',
  { eager: true, query: '?raw', import: 'default' },
);

/** Baked white / near-white stroke (already visible on dark boards). */
const LIGHT_STROKE_RE =
  /stroke\s*[:=]\s*(?:#fff(?:fff)?\b|white\b|rgb\(\s*100%\s*,\s*100%\s*,\s*100%\s*\)|rgba?\(\s*255\s*,\s*255\s*,\s*255)/i;

function packPath(styleIndex: number, file: string): string {
  return `../../../../apps/web/public/pieces/${styleIndex}/${file}`;
}

function readPack(data: unknown): PackJson | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }
  if (
    'default' in data &&
    typeof data.default === 'object' &&
    data.default !== null
  ) {
    return data.default as PackJson;
  }
  return data as PackJson;
}

function readTitle(data: unknown): string | undefined {
  const pack = readPack(data);
  return typeof pack?.title === 'string' ? pack.title : undefined;
}

/** Title from `public/pieces/{styleIndex}/pack.json`, if present. */
export function getStyleTitle(styleIndex: number): string | undefined {
  return readTitle(packJsonModules[packPath(styleIndex, 'pack.json')]);
}

export function getStyleLabel(styleIndex: number): string {
  return getStyleTitle(styleIndex) ?? `Style ${styleIndex + 1}`;
}

export interface StyleRimFlags {
  /** Black pieces already have a light rim — skip CSS outline. */
  lightRimOnBlack: boolean;
  /** White pieces already have a light rim — skip CSS outline. */
  lightRimOnWhite: boolean;
}

/**
 * Resolve rim flags from pack.json (+ SVG fallback). Exported for tests.
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

/**
 * Which sides already ship a light rim. Anything without one needs a white
 * CSS trace when Outline is on (including white art that only has a black rim).
 */
export function getStyleRimFlags(styleIndex: number): StyleRimFlags {
  const pack = readPack(packJsonModules[packPath(styleIndex, 'pack.json')]);
  const blackSvg = blackKingModules[packPath(styleIndex, 'bk.svg')];
  const whiteSvg = whiteKingModules[packPath(styleIndex, 'wk.svg')];
  return resolveStyleRimFlags(
    pack,
    typeof blackSvg === 'string' ? blackSvg : undefined,
    typeof whiteSvg === 'string' ? whiteSvg : undefined,
  );
}

/** True when neither side needs a CSS white trace. */
export function styleHasBakedOutline(styleIndex: number): boolean {
  const { lightRimOnBlack, lightRimOnWhite } = getStyleRimFlags(styleIndex);
  return lightRimOnBlack && lightRimOnWhite;
}

/** True when at least one side still benefits from the Outline toggle. */
export function styleNeedsOutlineToggle(styleIndex: number): boolean {
  return !styleHasBakedOutline(styleIndex);
}

export const PieceStyles = ({
  selectedStyle,
  onStyleChange,
}: PieceStylesProps) => {
  const styleCount = getStyleCount();
  const styles = Array.from({ length: styleCount }, (_, index) => index);
  return (
    <select
      aria-label="Piece art style"
      value={selectedStyle}
      onChange={(e) => onStyleChange(parseInt(e.target.value, 10))}
    >
      {styles.map((style) => (
        <option key={style} value={style}>
          {getStyleLabel(style)}
        </option>
      ))}
    </select>
  );
};
