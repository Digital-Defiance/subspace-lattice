/**
 * Lightweight print SVG of a Lattice board (no React / DOM).
 * Letters match LPGN piece glyphs; White uppercase, Black lowercase.
 */
import type { GameState } from '../interfaces/gameState';
import { CellType } from '../interfaces/cellType';
import { pieceTypeChessSymbolMap } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import type { Coordinate } from '../interfaces/coordinate';

export interface BoardSvgOptions {
  size?: number;
  /** Amber focus cells (moved piece path, shortcuts, …). */
  focusCells?: readonly Coordinate[];
  title?: string;
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

export function gameStateToBoardSvg(
  state: GameState,
  options: BoardSvgOptions = {},
): string {
  const n = state.boardSize || 11;
  const size = options.size ?? 468;
  const pad = 28;
  const cell = (size - pad * 2) / n;
  const focus = new Set(
    (options.focusCells ?? []).map((c) => key(c.x, c.y)),
  );

  const pieces = Object.values(state.pieces);
  const at = new Map<string, (typeof pieces)[0]>();
  for (const p of pieces) at.set(key(p.position.x, p.position.y), p);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
  );
  parts.push(
    `<rect width="${size}" height="${size}" fill="#0b1220"/>`,
  );
  if (options.title) {
    parts.push(
      `<text x="${pad}" y="18" fill="#9fb3c8" font-size="12" font-family="ui-monospace,monospace">${escapeXml(options.title)}</text>`,
    );
  }

  for (let y = n - 1; y >= 0; y--) {
    for (let x = 0; x < n; x++) {
      const px = pad + x * cell;
      const py = pad + (n - 1 - y) * cell;
      const cellObj = state.cells.find(
        (c) => c.coordinate.x === x && c.coordinate.y === y,
      );
      const well = cellObj?.type === CellType.GravityWell;
      const dark = (x + y) % 2 === 0;
      let fill = well ? '#1a2332' : dark ? '#152033' : '#1c2a40';
      if (focus.has(key(x, y))) fill = '#5a3d12';
      parts.push(
        `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="${fill}" stroke="#2a3a52" stroke-width="0.6"/>`,
      );
      if (well) {
        parts.push(
          `<circle cx="${(px + cell / 2).toFixed(1)}" cy="${(py + cell / 2).toFixed(1)}" r="${(cell * 0.18).toFixed(1)}" fill="#3d4f6a"/>`,
        );
      }
      const piece = at.get(key(x, y));
      if (piece) {
        const glyph = pieceTypeChessSymbolMap[piece.type];
        const letter =
          piece.owner === PlayerColor.White
            ? glyph.toUpperCase()
            : glyph.toLowerCase();
        const color =
          piece.owner === PlayerColor.White ? '#e8eef7' : '#7eb8ff';
        parts.push(
          `<text x="${(px + cell / 2).toFixed(1)}" y="${(py + cell * 0.68).toFixed(1)}" text-anchor="middle" fill="${color}" font-size="${(cell * 0.55).toFixed(1)}" font-family="ui-monospace,Menlo,monospace" font-weight="700">${letter}</text>`,
        );
      }
    }
  }

  // File / rank labels
  for (let x = 0; x < n; x++) {
    const file = String.fromCharCode('a'.charCodeAt(0) + x);
    const px = pad + x * cell + cell / 2;
    parts.push(
      `<text x="${px.toFixed(1)}" y="${(size - 8).toFixed(1)}" text-anchor="middle" fill="#6a7f96" font-size="10" font-family="ui-monospace,monospace">${file}</text>`,
    );
  }
  for (let y = 0; y < n; y++) {
    const py = pad + (n - 1 - y) * cell + cell * 0.65;
    parts.push(
      `<text x="10" y="${py.toFixed(1)}" text-anchor="middle" fill="#6a7f96" font-size="10" font-family="ui-monospace,monospace">${y + 1}</text>`,
    );
  }

  parts.push(`</svg>`);
  return parts.join('');
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
