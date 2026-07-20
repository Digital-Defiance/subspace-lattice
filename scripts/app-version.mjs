#!/usr/bin/env node
/**
 * Canonical Subspace Lattice app version: semver 0.MINOR.BUILD where BUILD is also
 * iOS bundleVersion and Android versionCode (kept in sync).
 *
 *   node scripts/app-version.mjs print
 *   node scripts/app-version.mjs set 0.1.0
 *   node scripts/app-version.mjs bump [--next-minor] [--next-build]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG_JSON = path.join(ROOT, 'apps/desktop/package.json');
const TAURI_CONF = path.join(ROOT, 'apps/desktop/src-tauri/tauri.conf.json');
const CARGO_TOML = path.join(ROOT, 'apps/desktop/src-tauri/Cargo.toml');

export function normalizeVersion(input) {
  return String(input).replace(/^v/i, '');
}

export function parseAppVersion(version) {
  const normalized = normalizeVersion(version);
  const match = /^0\.(\d+)\.(\d+)$/.exec(normalized);
  if (!match) {
    throw new Error(
      `expected 0.MINOR.BUILD semver (e.g. 0.1.0), got ${version}`,
    );
  }
  return {
    version: normalized,
    minor: Number(match[1]),
    build: Number(match[2]),
  };
}

export function formatAppVersion(minor, build) {
  if (!Number.isInteger(minor) || minor < 0) {
    throw new Error(`invalid minor: ${minor}`);
  }
  if (!Number.isInteger(build) || build < 0) {
    throw new Error(`invalid build: ${build}`);
  }
  return `0.${minor}.${build}`;
}

function readTauriConf() {
  return JSON.parse(fs.readFileSync(TAURI_CONF, 'utf8'));
}

function readCurrentVersion() {
  const tauri = readTauriConf();
  const pkg = JSON.parse(fs.readFileSync(PKG_JSON, 'utf8'));
  const parsed = parseAppVersion(tauri.version);
  const iosBuild = Number(tauri.bundle?.iOS?.bundleVersion ?? parsed.build);
  const androidBuild = Number(
    tauri.bundle?.android?.versionCode ?? parsed.build,
  );
  return {
    ...parsed,
    iosBuild,
    androidBuild,
    pkgVersion: pkg.version ?? tauri.version,
  };
}

function updatePackageVersionInCargo(cargo, version) {
  let inPackage = false;
  let found = false;
  let changed = false;
  const nextLines = cargo.split('\n').map((line) => {
    if (line.trim() === '[package]') {
      inPackage = true;
      return line;
    }
    if (inPackage && line.startsWith('[')) {
      inPackage = false;
    }
    if (inPackage && /^version = /.test(line)) {
      found = true;
      const nextLine = `version = "${version}"`;
      if (line !== nextLine) {
        changed = true;
      }
      return nextLine;
    }
    return line;
  });
  if (!found) {
    throw new Error(`no [package] version in ${CARGO_TOML}`);
  }
  return { text: nextLines.join('\n'), changed };
}

export function writeAppVersion(version) {
  const { minor, build } = parseAppVersion(version);

  const tauri = readTauriConf();
  const pkg = JSON.parse(fs.readFileSync(PKG_JSON, 'utf8'));
  const iosBuild = String(build);
  const androidBuild = build;

  const tauriChanged =
    tauri.version !== version ||
    tauri.bundle?.android?.versionCode !== androidBuild ||
    tauri.bundle?.iOS?.bundleVersion !== iosBuild;
  const pkgChanged = pkg.version !== version;
  const cargo = fs.readFileSync(CARGO_TOML, 'utf8');
  const { text: nextCargo, changed: cargoChanged } =
    updatePackageVersionInCargo(cargo, version);

  if (tauriChanged) {
    tauri.version = version;
    if (!tauri.bundle) {
      tauri.bundle = {};
    }
    if (!tauri.bundle.android) {
      tauri.bundle.android = {};
    }
    if (!tauri.bundle.iOS) {
      tauri.bundle.iOS = {};
    }
    tauri.bundle.android.versionCode = androidBuild;
    tauri.bundle.iOS.bundleVersion = iosBuild;
    fs.writeFileSync(TAURI_CONF, `${JSON.stringify(tauri, null, 2)}\n`);
  }

  if (pkgChanged) {
    pkg.version = version;
    fs.writeFileSync(PKG_JSON, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  if (cargoChanged) {
    fs.writeFileSync(CARGO_TOML, nextCargo);
  }

  return { version, minor, build };
}

export function bumpAppVersion({ nextMinor = false, nextBuild = false } = {}) {
  const current = readCurrentVersion();
  let minor = current.minor;
  let build = current.build;

  if (nextMinor) {
    minor += 1;
  }
  if (nextBuild) {
    build += 1;
  }
  if (!nextMinor && !nextBuild) {
    throw new Error('bump requires --next-minor and/or --next-build');
  }

  return writeAppVersion(formatAppVersion(minor, build));
}

function usage() {
  console.error(`usage:
  node scripts/app-version.mjs print
  node scripts/app-version.mjs set <0.MINOR.BUILD>
  node scripts/app-version.mjs bump [--next-minor] [--next-build]`);
  process.exit(1);
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command) {
    usage();
  }

  switch (command) {
    case 'print': {
      const current = readCurrentVersion();
      process.stdout.write(`${current.version}\n`);
      return;
    }
    case 'set': {
      const version = normalizeVersion(rest[0] ?? '');
      if (!version) {
        usage();
      }
      const written = writeAppVersion(version);
      console.error(
        `set version ${written.version} (iOS bundleVersion ${written.build}, Android versionCode ${written.build})`,
      );
      process.stdout.write(`${written.version}\n`);
      return;
    }
    case 'bump': {
      const nextMinor = rest.includes('--next-minor');
      const nextBuild = rest.includes('--next-build');
      const written = bumpAppVersion({ nextMinor, nextBuild });
      console.error(
        `bumped to ${written.version} (iOS bundleVersion ${written.build}, Android versionCode ${written.build})`,
      );
      process.stdout.write(`${written.version}\n`);
      return;
    }
    default:
      usage();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
