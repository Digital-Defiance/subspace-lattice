#!/usr/bin/env node
/**
 * Optional ElevenLabs TTS pass.
 *
 * Reads episode JSON, writes public/audio/<episode-id>/<scene-id>.mp3
 * and a timings sidecar for future caption sync.
 *
 * Spoken text is run through speakable() so coordinates like (5,9) become
 * "column 5, row 9" instead of "five comma nine".
 *
 * Pronunciation for academy jargon (e.g. orthogonal, contest*) comes from
 * scripts/tts/lattice-academy.pls — uploaded once and cached, then attached
 * as an ElevenLabs pronunciation dictionary (IPA phonemes). That needs
 * eleven_flash_v2 or eleven_v3; we default to flash_v2 when the dictionary
 * is in use.
 *
 * Requires ELEVENLABS_API_KEY. Without it, prints the dry-run plan and exits 0
 * so CI / local preview stay TTS-free (durationHintSec drives timing).
 *
 * Usage:
 *   yarn tts                 # all episodes
 *   yarn tts -- --episode ep02-surgical-strike
 *   yarn tts -- --episode ep00-intro --scene outro
 *   yarn tts -- --stale      # only clips whose spoken text changed
 *   yarn tts -- --sync-dictionary  # force re-upload PLS lexicon
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { speakable } from './lib/speakable.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EP_DIR = path.join(ROOT, 'scripts', 'episodes');
const OUT_DIR = path.join(ROOT, 'public', 'audio');
const PLS_PATH = path.join(ROOT, 'scripts', 'tts', 'lattice-academy.pls');
const DICT_CACHE_PATH = path.join(ROOT, 'scripts', 'tts', '.dictionary-ids.json');

const apiKey = process.env.ELEVENLABS_API_KEY;
// Default academy narrator — override with ELEVENLABS_VOICE_ID.
const voiceId =
  process.env.ELEVENLABS_VOICE_ID ?? 'NtS6nEHDYMQC9QczMQuq';
const modelIdDefault = process.env.ELEVENLABS_MODEL_ID ?? null;
const episodeFilter = process.argv.includes('--episode')
  ? process.argv[process.argv.indexOf('--episode') + 1]
  : null;
const sceneFilter = process.argv.includes('--scene')
  ? process.argv[process.argv.indexOf('--scene') + 1]
  : null;
/**
 * Re-synthesize only clips whose speakable() output no longer matches the
 * text recorded in plan.json (e.g. after a pronunciation fix), or whose mp3
 * is missing. Keeps ElevenLabs spend proportional to what actually changed.
 */
const staleOnly = process.argv.includes('--stale');
const syncDictionary = process.argv.includes('--sync-dictionary');

/** @typedef {{ id: string, versionId: string, plsSha256: string }} DictLocator */

async function plsSha256() {
  const buf = await readFile(PLS_PATH);
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Parse lattice-academy.pls into ElevenLabs add-from-rules payloads.
 * File upload only accepts alphabet="ipa" on the lexicon tag; CMU works via
 * the JSON rules API with per-rule alphabet.
 */
function rulesFromPls(plsXml) {
  const alphabetMatch = plsXml.match(/\balphabet\s*=\s*["']([^"']+)["']/i);
  const alphabet = alphabetMatch?.[1]?.trim() || 'ipa';
  const rules = [];
  for (const lexemeMatch of plsXml.matchAll(
    /<lexeme\b[^>]*>([\s\S]*?)<\/lexeme>/gi,
  )) {
    const body = lexemeMatch[1] ?? '';
    const grapheme = body
      .match(/<grapheme\b[^>]*>([\s\S]*?)<\/grapheme>/i)?.[1]
      ?.replace(/<[^>]+>/g, '')
      .trim();
    if (!grapheme) continue;
    const alias = body
      .match(/<alias\b[^>]*>([\s\S]*?)<\/alias>/i)?.[1]
      ?.replace(/<[^>]+>/g, '')
      .trim();
    if (alias) {
      rules.push({
        type: 'alias',
        string_to_replace: grapheme,
        alias,
        case_sensitive: true,
        word_boundaries: true,
      });
      continue;
    }
    const phonemeMatch = body.match(/<phoneme\b([^>]*)>([\s\S]*?)<\/phoneme>/i);
    if (phonemeMatch) {
      const attrs = phonemeMatch[1] ?? '';
      const phoneme = phonemeMatch[2]?.replace(/<[^>]+>/g, '').trim();
      const ruleAlphabet =
        attrs.match(/\balphabet\s*=\s*["']([^"']+)["']/i)?.[1]?.trim() ||
        alphabet;
      if (phoneme) {
        rules.push({
          type: 'phoneme',
          string_to_replace: grapheme,
          phoneme,
          alphabet: ruleAlphabet,
          case_sensitive: true,
          word_boundaries: true,
        });
      }
    }
  }
  return rules;
}

/**
 * Upload / reuse the academy PLS lexicon. Phoneme rules require flash_v2 or v3.
 * @returns {Promise<DictLocator | null>}
 */
async function ensurePronunciationDictionary() {
  if (!apiKey || !existsSync(PLS_PATH)) return null;

  const sha = await plsSha256();
  const fromEnvId = process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_ID?.trim();
  const fromEnvVersion =
    process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_VERSION_ID?.trim();

  if (fromEnvId && fromEnvVersion && !syncDictionary) {
    // Env ids win only while the local PLS is unchanged (tracked in cache).
    if (existsSync(DICT_CACHE_PATH)) {
      try {
        const cached = JSON.parse(await readFile(DICT_CACHE_PATH, 'utf8'));
        if (cached?.plsSha256 === sha) {
          return {
            id: fromEnvId,
            versionId: fromEnvVersion,
            plsSha256: sha,
          };
        }
      } catch {
        // Fall through to upload.
      }
    } else {
      return { id: fromEnvId, versionId: fromEnvVersion, plsSha256: sha };
    }
  }

  if (!syncDictionary && existsSync(DICT_CACHE_PATH)) {
    try {
      const cached = JSON.parse(await readFile(DICT_CACHE_PATH, 'utf8'));
      if (
        cached?.id &&
        cached?.versionId &&
        cached?.plsSha256 === sha
      ) {
        return cached;
      }
    } catch {
      // Fall through to upload.
    }
  }

  const plsXml = await readFile(PLS_PATH, 'utf8');
  const rules = rulesFromPls(plsXml);
  if (rules.length === 0) {
    throw new Error(`No lexeme rules found in ${PLS_PATH}`);
  }

  // add-from-file rejects alphabet="cmu"; JSON rules accept ipa | cmu per rule.
  const res = await fetch(
    'https://api.elevenlabs.io/v1/pronunciation-dictionaries/add-from-rules',
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        name: 'lattice-academy',
        description: 'Subspace Lattice academy TTS (orthogonal, contest*)',
        rules,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `ElevenLabs dictionary upload ${res.status}: ${await res.text()}`,
    );
  }
  const body = await res.json();
  const locator = {
    id: body.id,
    versionId: body.version_id,
    plsSha256: sha,
  };
  await mkdir(path.dirname(DICT_CACHE_PATH), { recursive: true });
  await writeFile(DICT_CACHE_PATH, JSON.stringify(locator, null, 2) + '\n');
  console.log(
    `pronunciation dictionary ${locator.id} (version ${locator.versionId})`,
  );
  return locator;
}

async function synthesize(text, outPath, dictionary) {
  // Phoneme PLS rules only apply on flash_v2 / v3 — not multilingual_v2.
  const modelId =
    modelIdDefault ??
    (dictionary ? 'eleven_flash_v2' : 'eleven_multilingual_v2');

  const payload = {
    text,
    model_id: modelId,
  };
  if (dictionary) {
    payload.pronunciation_dictionary_locators = [
      {
        pronunciation_dictionary_id: dictionary.id,
        version_id: dictionary.versionId,
      },
    ];
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
  return modelId;
}

async function main() {
  const dictionary = apiKey ? await ensurePronunciationDictionary() : null;
  const resolvedModel =
    modelIdDefault ??
    (dictionary ? 'eleven_flash_v2' : 'eleven_multilingual_v2');
  // Voice / model / dictionary bumps change audio without changing speakable
  // text — bake them into the plan so --stale regenerates.
  const spokenKey = (spoken) =>
    [
      spoken,
      `#voice:${voiceId}`,
      `#model:${resolvedModel}`,
      `#dict:${dictionary?.versionId ?? 'none'}`,
    ].join('\n');

  const files = (await readdir(EP_DIR)).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(EP_DIR, file), 'utf8'));
    if (episodeFilter && raw.id !== episodeFilter) continue;
    const dir = path.join(OUT_DIR, raw.id);
    await mkdir(dir, { recursive: true });
    const planPathEarly = path.join(dir, 'plan.json');
    let prevSpoken = new Map();
    if (staleOnly) {
      try {
        const prev = JSON.parse(await readFile(planPathEarly, 'utf8'));
        prevSpoken = new Map(
          (prev.plan ?? []).map((entry) => [entry.scene, entry.spoken]),
        );
      } catch {
        // No prior plan — everything counts as stale.
      }
    }
    const plan = [];
    let synthesized = 0;
    let skippedFresh = 0;
    for (const scene of raw.scenes) {
      if (sceneFilter && scene.id !== sceneFilter) continue;
      const texts = [scene.voiceover];
      if (scene.kind === 'pause-predict') texts.push(scene.revealVoiceover);
      for (let i = 0; i < texts.length; i++) {
        const suffix = i === 0 ? '' : '-reveal';
        const out = path.join(dir, `${scene.id}${suffix}.mp3`);
        const spoken = speakable(texts[i]);
        const planSpoken = spokenKey(spoken);
        const fresh =
          staleOnly &&
          prevSpoken.get(scene.id + suffix) === planSpoken &&
          existsSync(out);
        plan.push({
          scene: scene.id + suffix,
          chars: spoken.length,
          spoken: planSpoken,
          out,
        });
        if (fresh) {
          skippedFresh++;
          continue;
        }
        if (!apiKey) {
          if (staleOnly) console.log(`stale ${raw.id}/${scene.id}${suffix}`);
          continue;
        }
        console.log(`tts ${raw.id}/${scene.id}${suffix}…`);
        await synthesize(spoken, out, dictionary);
        synthesized++;
      }
    }
    if (sceneFilter && plan.length === 0) {
      console.error(
        `No scene "${sceneFilter}" in ${raw.id}. Available: ${raw.scenes
          .map((s) => s.id)
          .join(', ')}`,
      );
      process.exit(1);
    }
    // plan.json is the record of what the mp3s on disk were generated from
    // (--stale diffs against it), so only rewrite it after real synthesis —
    // a dry-run must not mark clips as current.
    if (apiKey) {
      const planPath = path.join(dir, 'plan.json');
      let fullPlan = plan;
      if (sceneFilter) {
        // Single-scene runs merge into the existing inventory.
        try {
          const prev = JSON.parse(await readFile(planPath, 'utf8'));
          const byScene = new Map(
            (prev.plan ?? []).map((entry) => [entry.scene, entry]),
          );
          for (const entry of plan) byScene.set(entry.scene, entry);
          fullPlan = [...byScene.values()];
        } catch {
          // No prior plan — write just this scene.
        }
      }
      await writeFile(
        planPath,
        JSON.stringify({ episode: raw.id, plan: fullPlan }, null, 2),
      );
    }
    if (!apiKey) {
      const staleNote = staleOnly
        ? ` (${plan.length - skippedFresh} stale, ${skippedFresh} fresh)`
        : '';
      console.log(
        `dry-run ${raw.id}: ${plan.length} clips${staleNote} (set ELEVENLABS_API_KEY to generate)`,
      );
    } else {
      const skipNote = staleOnly ? `, ${skippedFresh} already fresh` : '';
      console.log(
        `wrote ${synthesized} clip${synthesized === 1 ? '' : 's'}${skipNote} → ${dir}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
