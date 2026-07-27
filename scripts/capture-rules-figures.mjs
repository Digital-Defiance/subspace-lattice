#!/usr/bin/env node
/**
 * Capture every rules-manual figure as a vector SVG (docs/figures/<id>.svg).
 *
 * Boots the web app (vite dev), opens /harness/figures, and uses the vendored
 * dom-to-svg converter in-page (window.__rulesFigures.capture) — same pipeline
 * as capture-mission-figures.mjs.
 *
 * Usage: node scripts/capture-rules-figures.mjs [--force] [--figure <id>]
 * Then:  yarn build:rules   (SVG→PDF + rules.pdf)
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs', 'figures');
const PORT = 4318;
const BASE = `http://127.0.0.1:${PORT}`;

const force = process.argv.includes('--force');
const figureArg = process.argv.includes('--figure')
  ? process.argv[process.argv.indexOf('--figure') + 1]
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

async function main() {
  const server = await ensureServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1100, height: 900 },
    });
    await page.goto(`${BASE}/harness/figures`);
    await page.waitForFunction(() => Boolean(window.__rulesFigures));

    const figures = await page.evaluate(() => window.__rulesFigures.figures);
    await mkdir(OUT_DIR, { recursive: true });
    let written = 0;
    let skipped = 0;

    for (const { id } of figures) {
      if (figureArg && id !== figureArg) continue;
      const file = path.join(OUT_DIR, `${id}.svg`);
      if (!force && existsSync(file)) {
        skipped++;
        continue;
      }
      await page.evaluate((fid) => window.__rulesFigures.show(fid), id);
      await page.waitForFunction(
        (fid) =>
          document.getElementById('figure-capture-root')?.dataset.figureId ===
          fid,
        id,
      );
      const svg = await page.evaluate(() => window.__rulesFigures.capture());
      await writeFile(file, svg, 'utf8');
      written++;
      console.log(`  ${id}.svg`);
    }
    if (figureArg && written + skipped === 0) {
      throw new Error(
        `no figure "${figureArg}" — available: ${figures
          .map((f) => f.id)
          .join(', ')}`,
      );
    }
    console.log(
      `capture:rules-figures — wrote ${written}, kept ${skipped} existing` +
        ' (use --force to overwrite; then run yarn build:rules)',
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
