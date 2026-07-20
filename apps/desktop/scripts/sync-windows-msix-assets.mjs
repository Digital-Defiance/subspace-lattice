/**
 * Mirror Windows MSIX tile art from src-tauri/icons → gen/windows/Assets.
 *
 * `icons/` is canonical (`yarn tauri:icon` output). MSIX packaging reads
 * gen/windows/Assets — sync everything here before a Windows store build.
 *
 * Run: yarn sync:windows-msix-assets
 * Exit 1 if any required tile is missing or the wrong pixel size.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(appRoot, 'src-tauri/icons');
const assetsDir = join(appRoot, 'src-tauri/gen/windows/Assets');

/** Required by gen/windows/AppxManifest.xml.template — name → [w, h]. */
const REQUIRED_MSIX_TILES = {
  'StoreLogo.png': [50, 50],
  'Square44x44Logo.png': [44, 44],
  'Square150x150Logo.png': [150, 150],
  'Wide310x150Logo.png': [310, 150],
};

/** Optional tiles (manifest may expand; Partner Center sometimes wants these). */
const OPTIONAL_MSIX_TILES = {
  'SplashScreen.png': [620, 300],
  'Square71x71Logo.png': [71, 71],
  'Square310x310Logo.png': [310, 310],
};

function readPngSize(filePath) {
  if (process.platform === 'darwin') {
    const result = spawnSync(
      'sips',
      ['-g', 'pixelWidth', '-g', 'pixelHeight', filePath],
      { encoding: 'utf8' },
    );
    if (result.status !== 0) return null;
    const width = Number(/pixelWidth:\s*(\d+)/.exec(result.stdout)?.[1]);
    const height = Number(/pixelHeight:\s*(\d+)/.exec(result.stdout)?.[1]);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return { width, height };
  }
  return null;
}

function reportTile(name, expected, kind) {
  const path = join(iconsDir, name);
  const [ew, eh] = expected;
  if (!existsSync(path)) {
    const label = kind === 'required' ? 'MISSING (required)' : 'missing (optional)';
    console.error(
      `  ${label}: ${name} — expected ${ew}×${eh}px at ${path}`,
    );
    return kind === 'required' ? 'missing-required' : 'missing-optional';
  }
  const size = readPngSize(path);
  if (size && (size.width !== ew || size.height !== eh)) {
    console.error(
      `  WRONG SIZE: ${name} is ${size.width}×${size.height}px — expected ${ew}×${eh}px`,
    );
    return kind === 'required' ? 'bad-required' : 'bad-optional';
  }
  if (size) {
    console.log(`  ok: ${name} (${size.width}×${size.height})`);
  } else {
    console.log(`  ok: ${name} (size not verified on this platform)`);
  }
  return 'ok';
}

function printChecklist() {
  console.error('');
  console.error('Windows MSIX tile checklist (place under apps/desktop/src-tauri/icons/):');
  for (const [name, [w, h]] of Object.entries(REQUIRED_MSIX_TILES)) {
    console.error(`  [required] ${name}  ${w}×${h}`);
  }
  for (const [name, [w, h]] of Object.entries(OPTIONAL_MSIX_TILES)) {
    console.error(`  [optional] ${name}  ${w}×${h}`);
  }
  console.error('Then: yarn sync:windows-msix-assets && yarn build:windows:store');
}

if (!existsSync(iconsDir)) {
  console.error(`Missing icons dir: ${iconsDir} (run: yarn tauri:icon)`);
  printChecklist();
  process.exit(1);
}

if (!existsSync(join(appRoot, 'src-tauri/gen/windows'))) {
  console.error(
    `Missing gen/windows (templates should live at src-tauri/gen/windows).`,
  );
  process.exit(1);
}

mkdirSync(assetsDir, { recursive: true });

console.log('Checking Windows MSIX tiles…');
let failed = false;
let optionalGaps = false;

for (const [name, size] of Object.entries(REQUIRED_MSIX_TILES)) {
  const status = reportTile(name, size, 'required');
  if (status !== 'ok') failed = true;
}
for (const [name, size] of Object.entries(OPTIONAL_MSIX_TILES)) {
  const status = reportTile(name, size, 'optional');
  if (status !== 'ok') optionalGaps = true;
}

if (failed) {
  printChecklist();
  process.exit(1);
}

const fromRoot = readdirSync(iconsDir).filter(
  (name) =>
    name.endsWith('.png') &&
    (name.includes('Logo') || name === 'SplashScreen.png'),
);
const ordered = [
  ...Object.keys(REQUIRED_MSIX_TILES),
  ...Object.keys(OPTIONAL_MSIX_TILES),
];
const extras = fromRoot.filter((name) => !ordered.includes(name)).sort();
const sources = [
  ...ordered.filter((name) => fromRoot.includes(name)),
  ...extras,
];

for (const name of sources) {
  copyFileSync(join(iconsDir, name), join(assetsDir, name));
}

console.log(`Synced ${sources.length} Windows MSIX tiles → ${assetsDir}`);
if (optionalGaps) {
  console.error('');
  console.error(
    'Note: one or more optional MSIX tiles are missing or wrong-sized.',
  );
  console.error(
    'Store packaging can still work; add them before Partner Center upload if requested.',
  );
  printChecklist();
}
