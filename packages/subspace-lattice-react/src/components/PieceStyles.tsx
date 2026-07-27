import { getStyleCount } from './Piece';

export interface PieceStylesProps {
  selectedStyle: number;
  onStyleChange: (style: number) => void;
}

type PackJson = {
  title?: unknown;
  /**
   * When true, this pack is already fully rimmed for dark boards —
   * Outline is a no-op. Otherwise optional per-side overrides:
   * `hasLightRim` (black art), `hasLightRimWhite` (white art).
   */
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
 * Which sides already ship a light rim. Anything without one needs a white
 * CSS trace when Outline is on (including white art that only has a black rim).
 */
export function getStyleRimFlags(styleIndex: number): StyleRimFlags {
  const pack = readPack(packJsonModules[packPath(styleIndex, 'pack.json')]);

  let lightRimOnBlack: boolean | undefined;
  let lightRimOnWhite: boolean | undefined;

  if (typeof pack?.hasOutline === 'boolean') {
    lightRimOnBlack = pack.hasOutline;
    lightRimOnWhite = pack.hasOutline;
  }
  if (typeof pack?.hasLightRim === 'boolean') {
    lightRimOnBlack = pack.hasLightRim;
  }
  if (typeof pack?.hasLightRimWhite === 'boolean') {
    lightRimOnWhite = pack.hasLightRimWhite;
  }

  if (lightRimOnBlack === undefined) {
    const svg = blackKingModules[packPath(styleIndex, 'bk.svg')];
    lightRimOnBlack = typeof svg === 'string' && LIGHT_STROKE_RE.test(svg);
  }
  if (lightRimOnWhite === undefined) {
    const svg = whiteKingModules[packPath(styleIndex, 'wk.svg')];
    lightRimOnWhite = typeof svg === 'string' && LIGHT_STROKE_RE.test(svg);
  }

  return { lightRimOnBlack, lightRimOnWhite };
}

/** True when neither side needs a CSS white trace. */
export function styleHasBakedOutline(styleIndex: number): boolean {
  const { lightRimOnBlack, lightRimOnWhite } = getStyleRimFlags(styleIndex);
  return lightRimOnBlack && lightRimOnWhite;
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
