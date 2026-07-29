#!/usr/bin/env node
/**
 * Scan apps/web/public/pieces/{n}/ → write a TS manifest for react-ui.
 * Avoids Vite import.meta.glob into public/ (which warns / is unsupported).
 *
 * Usage: yarn pieces:manifest
 *
 * Rim resolution mirrors packages/subspace-lattice-react/src/lib/piece-pack-rim.ts
 * (keep in sync).
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const piecesDir = join(root, 'apps/web/public/pieces');
const outPath = join(
  root,
  'packages/subspace-lattice-react/src/generated/piece-packs.manifest.ts',
);

const LIGHT_STROKE_RE =
  /stroke\s*[:=]\s*(?:#fff(?:fff)?\b|white\b|rgb\(\s*100%\s*,\s*100%\s*,\s*100%\s*\)|rgba?\(\s*255\s*,\s*255\s*,\s*255)/i;

/** @typedef {{ title?: unknown, needsOutlineBlack?: unknown, needsOutlineWhite?: unknown, hasOutline?: unknown, hasLightRim?: unknown, hasLightRimWhite?: unknown }} PackJson */

/**
 * @param {PackJson | undefined} pack
 * @param {string | undefined} blackKingSvg
 * @param {string | undefined} whiteKingSvg
 */
function resolveStyleRimFlags(pack, blackKingSvg, whiteKingSvg) {
  /** @type {boolean | undefined} */
  let lightRimOnBlack;
  /** @type {boolean | undefined} */
  let lightRimOnWhite;

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
  if (typeof pack?.hasLightRim === 'boolean' && lightRimOnBlack === undefined) {
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

/** @param {string} packPath */
function readPack(packPath) {
  if (!existsSync(packPath)) return undefined;
  try {
    return /** @type {PackJson} */ (JSON.parse(readFileSync(packPath, 'utf8')));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`warn: bad pack.json at ${packPath}:`, msg);
    return undefined;
  }
}

/** @param {string} path */
function readSvg(path) {
  if (!existsSync(path)) return undefined;
  return readFileSync(path, 'utf8');
}

function listStyleIndexes() {
  return readdirSync(piecesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
    .map((d) => Number(d.name))
    .sort((a, b) => a - b);
}

function main() {
  if (!existsSync(piecesDir)) {
    console.error(`Missing pieces dir: ${piecesDir}`);
    process.exit(1);
  }

  const indexes = listStyleIndexes();
  if (indexes.length === 0) {
    console.error('No numeric piece style folders found');
    process.exit(1);
  }

  const max = indexes[indexes.length - 1];
  /** @type {Array<{ index: number, title?: string, lightRimOnBlack: boolean, lightRimOnWhite: boolean }>} */
  const packs = [];

  for (let i = 0; i <= max; i++) {
    const dir = join(piecesDir, String(i));
    if (!existsSync(dir)) {
      console.warn(`warn: missing style folder pieces/${i} (gap in 0..${max})`);
      packs.push({
        index: i,
        lightRimOnBlack: false,
        lightRimOnWhite: false,
      });
      continue;
    }
    const pack = readPack(join(dir, 'pack.json'));
    const rim = resolveStyleRimFlags(
      pack,
      readSvg(join(dir, 'bk.svg')),
      readSvg(join(dir, 'wk.svg')),
    );
    packs.push({
      index: i,
      title: typeof pack?.title === 'string' ? pack.title : undefined,
      lightRimOnBlack: rim.lightRimOnBlack,
      lightRimOnWhite: rim.lightRimOnWhite,
    });
  }

  const body = packs
    .map((p) => {
      const title =
        p.title === undefined ? '' : ` title: ${JSON.stringify(p.title)},`;
      return `  { index: ${p.index},${title} lightRimOnBlack: ${p.lightRimOnBlack}, lightRimOnWhite: ${p.lightRimOnWhite} },`;
    })
    .join('\n');

  const source = `/* AUTO-GENERATED — do not edit. Run: yarn pieces:manifest */

export interface PiecePackManifestEntry {
  readonly index: number;
  readonly title?: string;
  readonly lightRimOnBlack: boolean;
  readonly lightRimOnWhite: boolean;
}

export const PIECE_PACKS: readonly PiecePackManifestEntry[] = [
${body}
] as const;

export const PIECE_PACK_COUNT = PIECE_PACKS.length;
`;

  writeFileSync(outPath, source);
  console.log(
    `Wrote ${packs.length} packs → ${outPath.replace(`${root}/`, '')}`,
  );
}

main();
