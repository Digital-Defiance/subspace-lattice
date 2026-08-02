#!/usr/bin/env node
/**
 * Capture LPGN replay positions as Board SVGs (Sensor Net + EMP/TO + piece art).
 *
 * Boots vite, opens /harness/lpgn-figures, injects the .lpgn text, captures
 * selected plies into docs/lpgn-reports/<id>/figures/lpgn/<id>/ply-NNN.svg
 * (or --out).
 *
 * Usage:
 *   node scripts/capture-lpgn-figures.mjs --lpgn path/to/game.lpgn
 *   node scripts/capture-lpgn-figures.mjs --lpgn game.lpgn --plies 0,29,37,75
 *   node scripts/capture-lpgn-figures.mjs --lpgn game.lpgn --every-ply --force
 *   node scripts/capture-lpgn-figures.mjs --lpgn game.lpgn --out docs/lpgn-reports
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4318;
const BASE = `http://127.0.0.1:${PORT}`;

function argValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const everyPly = args.includes('--every-ply');
const lpgnPath = argValue(args, '--lpgn');
const outRoot = argValue(args, '--out') ?? path.join(ROOT, 'docs', 'lpgn-reports');
const pliesArg = argValue(args, '--plies');
const idOverride = argValue(args, '--id');

if (!lpgnPath) {
  console.error(
    'usage: capture-lpgn-figures.mjs --lpgn <file.lpgn> [--id name] [--plies 0,1,2] [--every-ply] [--force] [--out dir]',
  );
  process.exit(1);
}

const pad = (n) => String(n).padStart(3, '0');

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
  const text = readFileSync(lpgnPath, 'utf8');
  const server = await ensureServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 900, height: 900 },
    });
    await page.goto(`${BASE}/harness/lpgn-figures`);
    await page.waitForFunction(() => Boolean(window.__lpgnFigures));

    const loaded = await page.evaluate((lpgn) => window.__lpgnFigures.load(lpgn), text);
    const id = (
      idOverride ||
      loaded.id ||
      path.basename(lpgnPath, path.extname(lpgnPath))
    ).slice(0, 72);
    const maxPly = loaded.plies;

    let plies;
    if (everyPly) {
      plies = Array.from({ length: maxPly + 1 }, (_, i) => i);
    } else if (pliesArg) {
      plies = pliesArg.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
    } else {
      // Default: start + every 10th + last (caller usually passes --plies from annotate).
      plies = [0];
      for (let p = 10; p < maxPly; p += 10) plies.push(p);
      plies.push(maxPly);
    }
    plies = [...new Set(plies.filter((p) => p >= 0 && p <= maxPly))].sort(
      (a, b) => a - b,
    );

    const dir = path.join(outRoot, id, 'figures', 'lpgn', id);
    await mkdir(dir, { recursive: true });

    let written = 0;
    let skipped = 0;
    for (const ply of plies) {
      const file = path.join(dir, `ply-${pad(ply)}.svg`);
      if (!force && existsSync(file)) {
        // Prefer keeping an existing Board capture; skip letter fallbacks under 5KB? No — always skip if exists unless force.
        skipped++;
        continue;
      }
      await page.evaluate((p) => window.__lpgnFigures.show(p), ply);
      await page.waitForFunction(
        (p) => {
          const root = document.getElementById('figure-capture-root');
          return root?.dataset.ply === String(p);
        },
        ply,
      );
      // Let React commit Board + net paints (transitions disabled in CSS).
      await page.waitForTimeout(50);
      const svg = await page.evaluate(() => window.__lpgnFigures.capture());
      const sizeMatch = svg.match(/\bwidth="(\d+(?:\.\d+)?)"/);
      const width = sizeMatch ? Number(sizeMatch[1]) : 0;
      if (width < 200) {
        throw new Error(
          `${id} ply ${ply}: capture width ${width}px is too small (expected ~468)`,
        );
      }
      await writeFile(file, svg, 'utf8');
      written++;
      if (ply % 20 === 0 || ply === maxPly) {
        console.log(`  ${id}: ply ${ply}/${maxPly}`);
      }
    }
    console.log(
      `capture:lpgn-figures — ${id}: wrote ${written}, kept ${skipped} existing → ${dir}`,
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
