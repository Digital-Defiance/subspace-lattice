# Academy videos (Remotion)

YouTube Fleet Academy series mirroring
[`docs/advanced-manual.pdf`](../../docs/advanced-manual.pdf):

| Composition | Episode | Source | Authoring |
|---|---|---|---|
| `Episode00` | **Intro to Subspace Lattice** | Beginner overview | hand-written |
| `Episode01` | Tactical Mindset | Advanced Manual Part I (incl. Heavy wings / Anomaly Slice) | hand-written |
| `Episode02` | Surgical Strike | Mission 1 (7 plies) | hand-written |
| `Episode03` | Midgame Control | Mission 2 (57 plies, scrubbed) | hand-written |
| `Episode04` | Sector Clock | Mission 3 (115 plies, scrubbed) | hand-written |
| `Episode05` | Every Ply: Standard Battle | Mission 2, all 57 plies | **generated** |
| `Episode06` | Every Ply: Sector-Clock Siege | Mission 3, all 115 plies | **generated** |
| `Episode07` | Playing Black | Second seat / Initiative Relay | hand-written |
| `Episode08` | Playing the Heavy Wing | Refractor Wing + Fleet Draft | hand-written |
| `Episode09` | Practical AI Skirmish | Fleet Draft midgame (MCTS replay) | hand-written + AI gen |
| `Episode10` | Infiltrator Deep Dive | Warp + Target Lock (Heuristic replay) | hand-written + AI gen |
| `Episode11` | Lockout, EMP & Terminal Overclock | Mission 4 EMP reel + Mission 5 Terminal board reel (`mission-emp-lockout` / `mission-terminal-overclock`) | hand-written |
| `EpisodeStory01` | **The Battle for Sector 11** (lore) | Story stills in `public/story/ep-story-01/` | hand-written |

Board frames are the **same SVGs** as the advanced manual
(`docs/figures/missions/…`), symlinked into `public/missions`.

Lore / story episodes can set optional `backgroundAsset` on any scene
(filename under `public/story/<episode-id>/`). When present, Remotion uses that
still as the full-bleed visual (board SVGs are skipped for those beats).

AI mission replays (Episodes 9–10) are regenerated from engine play; Mission 4–5
highlight reels are hand-authored (capture figures after editing steps):

```bash
cd packages/subspace-lattice && bash scripts/academy-mission-generate.sh --write
yarn capture:mission-figures -- --mission mission-ai-fleet-skirmish
yarn capture:mission-figures -- --mission mission-ai-infiltrator
yarn capture:mission-figures -- --mission mission-emp-lockout
yarn capture:mission-figures -- --mission mission-terminal-overclock
```

## Generated long-form episodes

Episodes 5–6 are the turn-by-turn walkthroughs. They are **not hand-authored**:
`scripts/seed-mission-episodes.mjs` parses the `\plyfig` entries out of
`docs/advanced-manual.tex`, so the narration, net counts, Target Lock counts and
Hub-en-prise warnings are literally the manual's text for that ply. Rebuild the
manual, re-seed, and the videos follow.

```bash
yarn build:advanced-manual   # regenerate docs/advanced-manual.tex
yarn videos:seed             # → scripts/episodes/ep0{5,6}-*.json + out/chapters-*.txt
```

The seeder also:

- voices a template's teaching sentence **once**, then drops to the
  move-specific sentence (the manual narrates from templates, so unabridged
  repeats would be unwatchable) — captures, hangs, the clock arming and the
  winning move always keep their full text;
- paces each beat from its word count;
- moves engine facts out of the voiceover into the on-screen coverage panel, so
  TTS never reads `net 49–49 · 2 ships locked` aloud;
- writes YouTube chapter markers to `out/chapters-<episode-id>.txt`.

## Pipeline

```
episode JSON  →  Remotion compositions  →  MP4
       ↓
  (optional) ElevenLabs TTS → public/audio/…
```

1. **Ensure mission figures exist** (if missing):

   ```bash
   yarn capture:mission-figures
   yarn build:advanced-manual   # optional PDF rebuild
   ```

2. **Install & Studio**:

   ```bash
   yarn install
   yarn videos:studio          # Remotion Studio preview
   ```

3. **Optional voiceover**:

   ```bash
   export ELEVENLABS_API_KEY=…
   export ELEVENLABS_VOICE_ID=…   # optional
   yarn videos:tts
   ```

   Without a key, `yarn videos:tts` dry-runs and scenes use `durationHintSec`.
   Spoken lines run through `scripts/lib/speakable.mjs` so `(5,9)` becomes
   **column five, row number nine** (not "five comma nine", and not bare
   "row 5" — ElevenLabs often voices "row" as /raʊ/ and garbles the digit).
   Academy jargon pronunciation lives in `scripts/tts/lattice-academy.pls`
   (IPA phonemes for `orthogonal`, verb-stress `contest*`, etc.) — parsed and
   uploaded via ElevenLabs `add-from-rules` and attached on TTS
   (`eleven_flash_v2`). Default voice is `NtS6nEHDYMQC9QczMQuq` (override with
   `ELEVENLABS_VOICE_ID`). Force a lexicon re-upload with
   `yarn videos:tts -- --sync-dictionary`.
   Re-run TTS after script changes; use `--scene <id>` to regenerate one clip.
   Clip loudness is normalized to **−16 LUFS** (`ffmpeg loudnorm`) after each
   synth. To even existing mp3s without re-billing ElevenLabs:

   ```bash
   yarn videos:tts -- --normalize --episode ep11-lockout
   yarn videos:tts -- --normalize --episode ep11-lockout --scene pause-terminal-fire
   ```

4. **Render** (uses TTS clips from `public/audio/<episode-id>/` when present;
   timing follows the MP3 length + a tail pad (about 2.25s after board /
   ply beats so you can read the position, ~0.9s after other scenes);
   falls back to `durationHintSec` if a clip is missing):

   ```bash
   yarn videos:render:ep02     # → apps/academy-videos/out/ep02-surgical-strike.mp4
   yarn videos:render:ep05     # etc.
   ```

   Preview with sound in Studio after TTS: `yarn videos:studio` → pick an
   Episode composition.

## Script schema

`scripts/episodes/*.json` — Zod schema in `src/lib/schema.ts`.

Scene kinds: `title` · `narration` · `story` · `board` · `pause-predict` · `montage` · `outro`.

Optional per-scene `backgroundAsset`: filename under `public/story/<episode-id>/`
(e.g. `"title.png"` → `public/story/ep-story-01/title.png`).

Optional per-scene `bgm` (string path, object, or `null`):

- Prefer Remotion `public/`-relative paths:
  - `soundtrack/Void Pulse.mp3` — fleet OST library
  - `audio/<episode-id>/custom-bed.mp3` — episode-local bed
  - `episode:intro.mp3` — shorthand for `audio/<episode-id>/intro.mp3`
- Bare filenames still map to `soundtrack/<file>`.
- Object form: `{ "src", "volume?", "duck?", "loop?", "key?" }` for mix /
  loop / span-identity control.
- Episode-level `bgm` is the default for every scene; a scene may override
  or set `"bgm": null` to stay silent.
- Consecutive scenes with the same span `key` (default: resolved path) share
  one continuous `<Audio>` mount with ~1s crossfades and VO ducking
  (defaults ≈40% bed / ≈8% ducked; final bed fades out over ~4s).
  See `src/lib/bgm.ts` + `src/components/SmartBgm.tsx`.

`story` beats are lore cards (headline + optional subhead + VO) over art — no
board SVG.

Overlays: `threeQuestions`, `hubEnPrise`, `targetLocked`, `nets`.

`board` scenes also take optional `stats` (`netWhite`, `netBlack`, `locked`,
`capture`, `result`) for the coverage panel.

TTS uses the same default academy narrator for every episode
(`NtS6nEHDYMQC9QczMQuq`, override with `ELEVENLABS_VOICE_ID`) — including lore
episodes like `ep-story-01`.

Do not hand-edit `ep05-*.json` / `ep06-*.json` — they are regenerated by
`yarn videos:seed`. Do not hand-edit `mission-ai-*-replay.ts` moves — regenerate
with `academy-mission-generate.sh`.

Edit JSON → refresh Studio. No remotion recompile of content needed.

## AI production notes

- **LLM step**: regenerate or expand episode JSON from
  `docs/advanced-manual.tex` / academy `why` text (same structure).
- **TTS**: ElevenLabs via `scripts/generate-tts.mjs` — same default voice for
  all episodes (`NtS6nEHDYMQC9QczMQuq`).
- **Captions**: Story beats use ElevenLabs `with-timestamps` alignment
  (`*.alignment.json`) via `SyncedCaptions` — active sentence + upcoming,
  no caption box. Re-run `yarn videos:tts -- --episode ep-story-01 --stale`
  to refresh sidecars.
- **Atmosphere**: optional per-scene `bgm` (fleet soundtrack beds). Mounted at
  Episode root with consecutive-track grouping, crossfades, and VO ducking.

## Layout

```
apps/academy-videos/
  public/missions → docs/figures/missions
  public/soundtrack → apps/web/public/soundtrack
  public/story/<episode-id>/*.png   # lore stills (backgroundAsset)
  public/audio/<episode-id>/*.mp3   # TTS (gitignored)
  scripts/episodes/*.json
  src/compositions/Episode.tsx
  src/components/Scenes.tsx
  src/components/SmartBgm.tsx
```
