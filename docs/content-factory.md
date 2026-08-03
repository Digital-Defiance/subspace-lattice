# Content factory — drills & puzzles

Two player-facing packs. Drills teach; puzzles test.

## Player-facing

| Surface | URL | What |
| --- | --- | --- |
| Rules | `/rules` | Full rules tour; **Sensor Net lab** (live board + Power Relay) on the Net panel |
| Fleet drills | `/drills` | Intro before game 1 — obvious, highlighted, full arc |
| Puzzles | `/puzzles` | Thinking positions — 1–5 moves, solution **not** highlighted |
| First local game | `/play?local=1&ai=fast` | Auto-starts offline Fast AI |
| Entry | Lobby **Local** · Practice on `/play` · Landing | path above |
| Academy | `/tutorial` | Full graded curriculum |

EMP steps use **Fire EMP** on the Objective HUD (puzzles enable it when `canFireEmp`).

## Drills arc (`/drills`)

| Phase | Drills |
| --- | --- |
| Opening | Capture Escort · Push net fringe |
| Midgame | Capture Refractor · Beam lane · Hold the Hub · Refuse fringe Infiltrator · **Rolling Storm** |
| Sector | Hit Integration marker (**45%**) · Finish Integration Hold |
| Strike | Surgical Strike |
| Terminal | Fire Lockout · Refuse miss · Close for blast |

## Puzzles (`/puzzles`)

Graded lines with optional AI replies between human plies. Soft `focusCells` for theatre only — no destination highlights. Use `presentation: 'puzzle'` and `alternateMoves` when several solves are fair.

## Sources

| Source | Role |
| --- | --- |
| `…/tutorial/fleet-drills.ts` | Intro pack |
| `…/tutorial/fleet-puzzles.ts` | In-game thinking pack |
| `…/sim/terminal-goldens.ts` | Terminal CI goldens |
| `…/sim/puzzles.ts` → `FLEET_PUZZLES` | AI / `yarn sim` (separate from UI pack) |

## Add a drill

1. Author position + exact `playerMove` in `fleet-drills.ts` with a `phase`.
2. Assert legality / outcome in `fleet-drills.spec.ts`.

## Add a puzzle

1. Author 1–5 plies in `fleet-puzzles.ts` (`presentation: 'puzzle'`). Prefer soft focus over spoiler destinations.
2. Assert the full line (and alternates) in `fleet-puzzles.spec.ts`.
3. Optionally mirror hard Terminal ideas into goldens / ManualMission / Remotion.

## Annotate a real match (LPGN → PDF)

**In browser (your CPU):** open `/annotate`, paste the LPGN, wait for the
progress bar, then Print / Save as PDF.

**CLI (content factory):**

```bash
yarn annotate:lpgn ~/Downloads/your-game.lpgn
# → docs/lpgn-reports/<id>/<id>.pdf
# Boards = live Board capture (Sensor Net + EMP/TO + Subspace Lattice pieces)
```

Offline glyph fallback (no net/EMP colouring): `--letter-svg`.
Use branch points as seeds for new drills/puzzles. See [`docs/LPGN.md`](./LPGN.md) §14.
