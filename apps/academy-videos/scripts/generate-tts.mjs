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
 * Requires ELEVENLABS_API_KEY. Without it, prints the dry-run plan and exits 0
 * so CI / local preview stay TTS-free (durationHintSec drives timing).
 *
 * Usage:
 *   yarn tts                 # all episodes
 *   yarn tts -- --episode ep02-surgical-strike
 *   yarn tts -- --episode ep00-intro --scene outro
 */
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { speakable } from './lib/speakable.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EP_DIR = path.join(ROOT, 'scripts', 'episodes');
const OUT_DIR = path.join(ROOT, 'public', 'audio');

const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId =
  process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM'; // Rachel default
const episodeFilter = process.argv.includes('--episode')
  ? process.argv[process.argv.indexOf('--episode') + 1]
  : null;
const sceneFilter = process.argv.includes('--scene')
  ? process.argv[process.argv.indexOf('--scene') + 1]
  : null;

async function synthesize(text, outPath) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
}

async function main() {
  const files = (await readdir(EP_DIR)).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(EP_DIR, file), 'utf8'));
    if (episodeFilter && raw.id !== episodeFilter) continue;
    const dir = path.join(OUT_DIR, raw.id);
    await mkdir(dir, { recursive: true });
    const plan = [];
    let synthesized = 0;
    for (const scene of raw.scenes) {
      if (sceneFilter && scene.id !== sceneFilter) continue;
      const texts = [scene.voiceover];
      if (scene.kind === 'pause-predict') texts.push(scene.revealVoiceover);
      for (let i = 0; i < texts.length; i++) {
        const suffix = i === 0 ? '' : '-reveal';
        const out = path.join(dir, `${scene.id}${suffix}.mp3`);
        const spoken = speakable(texts[i]);
        plan.push({
          scene: scene.id + suffix,
          chars: spoken.length,
          spoken,
          out,
        });
        if (!apiKey) continue;
        console.log(`tts ${raw.id}/${scene.id}${suffix}…`);
        await synthesize(spoken, out);
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
    // When regenerating a single scene, merge into any existing plan.json
    // so Remotion / dry-run tooling still see the full episode inventory.
    const planPath = path.join(dir, 'plan.json');
    let fullPlan = plan;
    if (sceneFilter) {
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
    if (!apiKey) {
      console.log(
        `dry-run ${raw.id}: ${plan.length} clips (set ELEVENLABS_API_KEY to generate)`,
      );
    } else {
      console.log(
        `wrote ${synthesized} clip${synthesized === 1 ? '' : 's'} → ${dir}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
