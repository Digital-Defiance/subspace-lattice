import { PieceType, pieceTypeChessSymbolMap } from '@subspace-lattice/core';
import { FC } from 'react';

export interface PieceProps {
  size?: number;
  color: 'white' | 'black';
  styleIndex: number;
  pieceType: PieceType;
}

/** Build-time map of style folders under `apps/web/public/pieces/{n}/`. */
const pieceStyleModules = import.meta.glob(
  '../../../../apps/web/public/pieces/*/wk.svg',
);

/** Number of piece art styles (`/pieces/0` … `/pieces/n-1`). */
export function getStyleCount(): number {
  let maxIndex = -1;
  for (const path of Object.keys(pieceStyleModules)) {
    const match = /[/\\]pieces[/\\](\d+)[/\\]/.exec(path);
    if (match) {
      maxIndex = Math.max(maxIndex, Number(match[1]));
    }
  }
  // dirs are 0-indexed → count is highest dir number + 1
  return maxIndex + 1;
}

export const Piece: FC<PieceProps> = ({
  size = 40,
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
  return (
    <span aria-hidden="true" className="piece-art">
      <img
        src={src}
        width={size}
        height={size}
        alt=""
        draggable={false}
      />
    </span>
  );
};
