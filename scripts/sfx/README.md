# Lattice game SFX (ElevenLabs)

Prompt catalog: [`lattice-sfx.json`](./lattice-sfx.json). Generator: [`../generate-sfx.mjs`](../generate-sfx.mjs).

```bash
export ELEVENLABS_API_KEY=…
yarn sfx                  # all effects
yarn sfx -- --id game-start
yarn sfx -- --stale       # only when prompt / settings changed
yarn sfx -- --force       # re-roll even if fingerprint matches
```

Clips land in `apps/web/public/sfx/<id>.mp3` (served as `/sfx/<id>.mp3`).

| id | Trigger |
|----|---------|
| `game-start` | Local AI / pass-and-play match start |
| `command-overload` | EMP fire |
| `infiltrator-warp` | Infiltrator jump (not spool announce) |
| `target-lock` | Piece newly enters enemy Sensor Net |
| `surgical-strike` | Hub capture win |
| `sector-integration` | Sector Integration win |
| `resignation` | Resign |
| `clock-arm` | Ply crosses `sectorActivationPly` |
| `emp-charged` | EMP charge reaches target |

Playback: `playGameSound` / `playLatticeSoundsAfterPly` / `useLatticeGameSounds` (online).

API: [text-to-sound-effects](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert) (`POST /v1/sound-generation`, model `eleven_text_to_sound_v2`).
