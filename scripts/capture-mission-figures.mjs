#!/usr/bin/env node
/**
 * Capture every guided-mission ply as a vector SVG for the advanced manual.
 *
 * Boots the web app (vite dev), opens /harness/mission-figures, and uses the
 * vendored dom-to-svg converter in-page (window.__missionFigures.capture).
 * Output: docs/figures/missions/<mission-id>/ply-NNN.svg  (NNN = position
 * after that many plies; 000 is the starting position).
 *
 * Usage: node scripts/capture-mission-figures.mjs [--force] [--mission <id>]
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_ROOT = path.join(ROOT, 'docs', 'figures', 'missions');
const PORT = 4317;
const BASE = `http://127.0.0.1:${PORT}`;

const force = process.argv.includes('--force');
const missionArg = process.argv.includes('--mission')
  ? process.argv[process.argv.indexOf('--mission') + 1]
  : null;

async function serverUp(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await serverUp(BASE)) return null;
  const vite = path.join(ROOT, 'node_modules', '.bin', 'vite');
  const child = spawn(vite, ['--host', '127.0.0.1', '--port', String(PORT)], {
    cwd: path.join(ROOT, 'apps', 'web'),
    stdio: 'ignore',
    detached: false,
  });
  for (let i = 0; i < 120; i++) {
    if (await serverUp(BASE)) return child;
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`vite dev server did not come up on ${BASE}`);
}

const pad = (n) => String(n).padStart(3, '0');

async function main() {
  const server = await ensureServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 900, height: 900 },
    });
    await page.goto(`${BASE}/harness/mission-figures`);
    await page.waitForFunction(() => Boolean(window.__missionFigures));

    const missions = await page.evaluate(() =>
      window.__missionFigures.missions,
    );
    let written = 0;
    let skipped = 0;

    for (let m = 0; m < missions.length; m++) {
      const { id, plies } = missions[m];
      if (missionArg && id !== missionArg) continue;
      const dir = path.join(OUT_ROOT, id);
      await mkdir(dir, { recursive: true });

      for (let ply = 0; ply <= plies; ply++) {
        const file = path.join(dir, `ply-${pad(ply)}.svg`);
        if (!force && existsSync(file)) {
          skipped++;
          continue;
        }
        await page.evaluate(
          ([mi, p]) => window.__missionFigures.show(mi, p),
          [m, ply],
        );
        await page.waitForFunction(
          ([mi, p]) => {
            const root = document.getElementById('figure-capture-root');
            return (
              root?.dataset.missionId ===
                window.__missionFigures.missions[mi].id &&
              root?.dataset.ply === String(p)
            );
          },
          [m, ply],
        );
        const svg = await page.evaluate(() =>
          window.__missionFigures.capture(),
        );
        const sizeMatch = svg.match(/\bwidth="(\d+(?:\.\d+)?)"/);
        const width = sizeMatch ? Number(sizeMatch[1]) : 0;
        // Fluid board + shrink-to-fit capture once produced ~50px boards;
        // refuse to write those so manuals/videos stay readable.
        if (width < 200) {
          throw new Error(
            `${id} ply ${ply}: capture width ${width}px is too small ` +
              '(expected ~468). Check .figures-capture-frame board sizing.',
          );
        }
        await writeFile(file, svg, 'utf8');
        written++;
        if (ply % 20 === 0) {
          console.log(`  ${id}: ply ${ply}/${plies}`);
        }
      }
      console.log(`${id}: done (${plies + 1} positions)`);
    }
    console.log(
      `capture:mission-figures — wrote ${written}, kept ${skipped} existing`,
    );
  } finally {
    await browser.close();
    server?.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
