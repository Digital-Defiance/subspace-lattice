#!/usr/bin/env node
/**
 * Generate game sound effects via ElevenLabs text-to-sound.
 *
 * Reads scripts/sfx/lattice-sfx.json, writes MP3s under apps/web/public/sfx/
 * and a plan.json sidecar for --stale regeneration.
 *
 * Requires ELEVENLABS_API_KEY. Without it, dry-runs the plan and exits 0.
 *
 * Usage:
 *   yarn sfx
 *   yarn sfx -- --id game-start
 *   yarn sfx -- --stale
 *   yarn sfx -- --force
 *
 * @see https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'scripts', 'sfx', 'lattice-sfx.json');

const apiKey = process.env.ELEVENLABS_API_KEY;
const idFilter = process.argv.includes('--id')
  ? process.argv[process.argv.indexOf('--id') + 1]
  : null;
const staleOnly = process.argv.includes('--stale');
const force = process.argv.includes('--force');

/**
 * @typedef {{
 *   id: string,
 *   title?: string,
 *   prompt: string,
 *   durationSeconds?: number | null,
 *   loop?: boolean,
 *   promptInfluence?: number,
 *   modelId?: string,
 * }} SfxEffect
 *
 * @typedef {{
 *   version: number,
 *   outputDir: string,
 *   defaults?: {
 *     modelId?: string,
 *     outputFormat?: string,
 *     promptInfluence?: number,
 *   },
 *   effects: SfxEffect[],
 * }} SfxManifest
 */

function effectFingerprint(effect, defaults) {
  const modelId = effect.modelId ?? defaults.modelId ?? 'eleven_text_to_sound_v2';
  const promptInfluence =
    effect.promptInfluence ?? defaults.promptInfluence ?? 0.3;
  const payload = {
    id: effect.id,
    prompt: effect.prompt.trim(),
    durationSeconds: effect.durationSeconds ?? null,
    loop: Boolean(effect.loop),
    promptInfluence,
    modelId,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * @param {SfxEffect} effect
 * @param {SfxManifest['defaults']} defaults
 * @param {string} outputFormat
 * @param {string} outPath
 */
async function synthesize(effect, defaults, outputFormat, outPath) {
  const modelId = effect.modelId ?? defaults.modelId ?? 'eleven_text_to_sound_v2';
  const promptInfluence =
    effect.promptInfluence ?? defaults.promptInfluence ?? 0.3;

  const body = {
    text: effect.prompt.trim(),
    model_id: modelId,
    prompt_influence: promptInfluence,
    loop: Boolean(effect.loop),
  };
  if (
    effect.durationSeconds != null &&
    Number.isFinite(effect.durationSeconds)
  ) {
    body.duration_seconds = effect.durationSeconds;
  }

  const url = new URL('https://api.elevenlabs.io/v1/sound-generation');
  url.searchParams.set('output_format', outputFormat);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `ElevenLabs sound-generation ${res.status}: ${await res.text()}`,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
}

async function main() {
  /** @type {SfxManifest} */
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const defaults = manifest.defaults ?? {};
  const outputFormat = defaults.outputFormat ?? 'mp3_44100_128';
  const outDir = path.join(ROOT, manifest.outputDir);
  await mkdir(outDir, { recursive: true });

  const planPath = path.join(outDir, 'plan.json');
  /** @type {Map<string, string>} */
  let prevFingerprints = new Map();
  if (staleOnly && !force && existsSync(planPath)) {
    try {
      const prev = JSON.parse(await readFile(planPath, 'utf8'));
      prevFingerprints = new Map(
        (prev.plan ?? []).map((entry) => [entry.id, entry.fingerprint]),
      );
    } catch {
      // No usable prior plan.
    }
  }

  const effects = manifest.effects.filter(
    (effect) => !idFilter || effect.id === idFilter,
  );
  if (idFilter && effects.length === 0) {
    console.error(
      `No effect "${idFilter}". Available: ${manifest.effects
        .map((e) => e.id)
        .join(', ')}`,
    );
    process.exit(1);
  }

  /** @type {Array<{ id: string, fingerprint: string, out: string, chars: number }>} */
  const plan = [];
  let synthesized = 0;
  let skippedFresh = 0;

  for (const effect of effects) {
    const out = path.join(outDir, `${effect.id}.mp3`);
    const fingerprint = effectFingerprint(effect, defaults);
    const fresh =
      !force &&
      staleOnly &&
      prevFingerprints.get(effect.id) === fingerprint &&
      existsSync(out);

    plan.push({
      id: effect.id,
      fingerprint,
      chars: effect.prompt.length,
      out,
    });

    if (fresh) {
      skippedFresh++;
      continue;
    }
    if (!apiKey) {
      if (staleOnly || force) console.log(`stale ${effect.id}`);
      continue;
    }

    console.log(`sfx ${effect.id}…`);
    await synthesize(effect, defaults, outputFormat, out);
    synthesized++;
  }

  // Merge into full inventory when filtering by --id.
  let fullPlan = plan;
  if (apiKey && idFilter && existsSync(planPath)) {
    try {
      const prev = JSON.parse(await readFile(planPath, 'utf8'));
      const byId = new Map((prev.plan ?? []).map((entry) => [entry.id, entry]));
      for (const entry of plan) byId.set(entry.id, entry);
      fullPlan = [...byId.values()];
    } catch {
      // Keep this run's plan only.
    }
  }

  if (apiKey) {
    await writeFile(
      planPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          model: defaults.modelId ?? 'eleven_text_to_sound_v2',
          plan: fullPlan,
        },
        null,
        2,
      ) + '\n',
    );
  }

  if (!apiKey) {
    const staleNote = staleOnly
      ? ` (${plan.length - skippedFresh} stale, ${skippedFresh} fresh)`
      : '';
    console.log(
      `dry-run: ${plan.length} effect${plan.length === 1 ? '' : 's'}${staleNote} (set ELEVENLABS_API_KEY to generate)`,
    );
    for (const entry of plan) {
      console.log(`  ${entry.id} → ${path.relative(ROOT, entry.out)}`);
    }
  } else {
    const skipNote = staleOnly ? `, ${skippedFresh} already fresh` : '';
    console.log(
      `wrote ${synthesized} clip${synthesized === 1 ? '' : 's'}${skipNote} → ${outDir}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
