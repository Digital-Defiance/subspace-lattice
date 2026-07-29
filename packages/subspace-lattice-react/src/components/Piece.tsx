/**
 * Fleet piece art — board `<img>` uses stable public URLs (`/pieces/{n}/…`).
 * Style count / titles / rim flags come from the generated manifest
 * (`yarn pieces:manifest`), not from Vite imports of `public/`.
 */

import { PieceType, pieceTypeChessSymbolMap } from '@subspace-lattice/core';
import { FC } from 'react';
import { PIECE_PACK_COUNT } from '../generated/piece-packs.manifest';

export interface PieceProps {
  size?: number;
  color: 'white' | 'black';
  styleIndex: number;
  pieceType: PieceType;
}

/** Number of piece art styles (`/pieces/0` … `/pieces/n-1`). */
export function getStyleCount(): number {
  return PIECE_PACK_COUNT;
}

export const Piece: FC<PieceProps> = ({
  size,
  color,
  pieceType,
  styleIndex,
}) => {
  const styleCount = getStyleCount();
  const si = Math.min(
    Math.max(styleIndex, 0),
    Math.max(styleCount - 1, 0),
  );
  const prefix = color === 'white' ? 'w' : 'b';
  const src = `/pieces/${si}/${prefix}${pieceTypeChessSymbolMap[pieceType]}.svg`;

  // Decorative: the board cell’s aria-label already names seat + piece.
  // Omit width/height when size is unset so Board CSS can fluid-scale the img.
  return (
    <span aria-hidden="true" className="piece-art">
      <img
        src={src}
        {...(size != null ? { width: size, height: size } : {})}
        alt=""
        draggable={false}
      />
    </span>
  );
};
