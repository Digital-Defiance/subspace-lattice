#!/usr/bin/env node
/**
 * Write apps/desktop/src-tauri/tauri.conf.local.json overrides from env.
 *
 * Precedence: process.env (already set by subspace/lattice-env) > .env files.
 *
 * Usage:
 *   node scripts/tauri-config-from-env.mjs --write [path]
 *   node scripts/tauri-config-from-env.mjs --print
 */

import process from 'node:process';
import console from 'node:console';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadDotEnvIfNeeded(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    if (value.includes('`') || value.includes('$(') || value.includes('${')) continue;
    if (value.startsWith('$HOME/')) value = `${process.env.HOME || ''}/${value.slice(6)}`;
    if (value.startsWith('~/')) value = `${process.env.HOME || ''}/${value.slice(2)}`;
    process.env[key] = value;
  }
}

function reversedClientIdScheme(clientId) {
  const bare = clientId.replace(/\.apps\.googleusercontent\.com$/, '');
  return `com.googleusercontent.apps.${bare}`;
}

function buildOverride() {
  loadDotEnvIfNeeded(join(ROOT, '.env'));
  loadDotEnvIfNeeded(join(ROOT, '.env.local'));
  loadDotEnvIfNeeded(join(ROOT, 'apps/desktop/.env'));
  loadDotEnvIfNeeded(join(ROOT, 'apps/desktop/.env.local'));
  loadDotEnvIfNeeded(join(ROOT, 'apps/web/.env'));
  loadDotEnvIfNeeded(join(ROOT, 'apps/web/.env.local'));

  const bundleId =
    process.env.APPLE_BUNDLE_ID ||
    process.env.TAURI_IDENTIFIER ||
    'org.digitaldefiance.app.subspacelattice';
  const teamId = process.env.APPLE_TEAM_ID || '';
  const publisher = process.env.APPLE_PUBLISHER_NAME || '';
  const productName =
    process.env.TAURI_PRODUCT_NAME ||
    process.env.APPLE_PRODUCT_NAME ||
    'Subspace Lattice';

  const override = {
    productName,
    identifier: bundleId,
    bundle: {
      publisher: publisher || undefined,
      iOS: {
        developmentTeam: teamId || undefined,
      },
    },
  };

  const androidScheme =
    process.env.VITE_GOOGLE_OAUTH_REDIRECT_SCHEME_ANDROID ||
    (process.env.VITE_GOOGLE_DESKTOP_CLIENT_ID
      ? reversedClientIdScheme(process.env.VITE_GOOGLE_DESKTOP_CLIENT_ID)
      : process.env.VITE_GOOGLE_ANDROID_CLIENT_ID
        ? reversedClientIdScheme(process.env.VITE_GOOGLE_ANDROID_CLIENT_ID)
        : '');
  const iosScheme =
    process.env.VITE_GOOGLE_OAUTH_REDIRECT_SCHEME ||
    (process.env.VITE_GOOGLE_IOS_CLIENT_ID
      ? reversedClientIdScheme(process.env.VITE_GOOGLE_IOS_CLIENT_ID)
      : '');

  const schemes = [];
  if (androidScheme) schemes.push(androidScheme);
  if (iosScheme && iosScheme !== androidScheme) schemes.push(iosScheme);

  if (schemes.length > 0) {
    override.plugins = {
      'deep-link': {
        mobile: [
          {
            scheme: schemes,
            appLink: false,
          },
        ],
      },
    };
  }

  if (!override.bundle.publisher) delete override.bundle.publisher;
  if (!override.bundle.iOS.developmentTeam) delete override.bundle.iOS;
  if (Object.keys(override.bundle).length === 0) delete override.bundle;

  return override;
}

function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || '--print';
  const override = buildOverride();
  const json = `${JSON.stringify(override, null, 2)}\n`;

  if (mode === '--print') {
    process.stdout.write(json);
    return;
  }

  if (mode === '--write') {
    const out = resolve(
      args[1] || join(ROOT, 'apps/desktop/src-tauri/tauri.conf.local.json'),
    );
    writeFileSync(out, json, 'utf8');
    process.stdout.write(`${out}\n`);
    return;
  }

  console.error(
    'Usage: node scripts/tauri-config-from-env.mjs --print|--write [path]',
  );
  process.exit(1);
}

main();
