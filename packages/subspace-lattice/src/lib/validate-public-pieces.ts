/* Go through the public pieces and ensure they all have w/b k q r b n p symbols. */

import { readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { pieceTypeChessSymbolMap } from './interfaces';

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/* pieces are stored as public/pieces/#/{w/b}{k/q/r/b/n/p}.svg
 * with an optional public/pieces/#/pack.json (`title`, and optional outline
 * hints: needsOutlineBlack / needsOutlineWhite, or legacy hasOutline /
 * hasLightRim / hasLightRimWhite).
 */
const piecesPath = join(__dirname, '../../../../apps/web', 'public', 'pieces')

let pieces = readdirSync(piecesPath);

// exclude .DS_Store, sort numerically (0-9, 10-19, 20-29, etc.)
pieces = pieces.filter(file => file !== '.DS_Store').sort((a, b) => parseInt(a) - parseInt(b));

let missingPieces = 0;
let currentPack = '';
for (const piece of pieces) {
  currentPack = `Style ${(parseInt(piece) + 1)}`;
  const piecePath = join(piecesPath, piece);
  const packJsonPath = join(piecePath, 'pack.json');
  if (existsSync(packJsonPath)) {
    const packJson = JSON.parse(readFileSync(packJsonPath, 'utf8'));
    if (packJson && packJson.title) {
      currentPack = packJson.title;
    }
  }
  for (const color of ['w', 'b']) {
    for (const pt of Object.values(pieceTypeChessSymbolMap)) {
        const piecePath = join(piecesPath, piece, `${color}${pt}.svg`);
        if (!existsSync(piecePath)) {
            missingPieces++;
            console.error(`${currentPack} - Piece ${piece} missing ${color} ${pt} SVG`);
        }
    }
  }
}

console.log(`Missing ${missingPieces} pieces`);