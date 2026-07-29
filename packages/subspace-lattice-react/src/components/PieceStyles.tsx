import { getStyleCount } from './Piece';
import {
  PIECE_PACKS,
  type PiecePackManifestEntry,
} from '../generated/piece-packs.manifest';
import type { StyleRimFlags } from '../lib/piece-pack-rim';
export type { PackJson, StyleRimFlags } from '../lib/piece-pack-rim';
export { resolveStyleRimFlags } from '../lib/piece-pack-rim';

export interface PieceStylesProps {
  selectedStyle: number;
  onStyleChange: (style: number) => void;
}

function packAt(styleIndex: number): PiecePackManifestEntry | undefined {
  return PIECE_PACKS[styleIndex];
}

/** Title from `public/pieces/{styleIndex}/pack.json`, if present. */
export function getStyleTitle(styleIndex: number): string | undefined {
  return packAt(styleIndex)?.title;
}

export function getStyleLabel(styleIndex: number): string {
  return getStyleTitle(styleIndex) ?? `Style ${styleIndex + 1}`;
}

/**
 * Which sides already ship a light rim. Anything without one needs a white
 * CSS trace when Outline is on (including white art that only has a black rim).
 * Values are baked by `yarn pieces:manifest`.
 */
export function getStyleRimFlags(styleIndex: number): StyleRimFlags {
  const pack = packAt(styleIndex);
  return {
    lightRimOnBlack: pack?.lightRimOnBlack ?? false,
    lightRimOnWhite: pack?.lightRimOnWhite ?? false,
  };
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
