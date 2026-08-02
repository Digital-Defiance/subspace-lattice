# Atlas — AI & measurement

## Two tracks

| Track | Question | Tools |
| --- | --- | --- |
| **Atlas** | What is true of the *rules*? | Census, scorecard, probes |
| **Deep Lattice** | Is the *player* stronger / clearer? | Datasets, value net, strength bar — [gateway](../deep-lattice) · [lab](../deep-lattice-lab) |

Do not judge rules by a broken leaf, or a net by a truncated ladder.

## Standard instruments

| Instrument | Command / module | Output |
| --- | --- | --- |
| Opening census | `yarn atlas:census` | `docs/atlas/census.json` |
| Observe burn | `yarn atlas:observe` | ply-event JSONL under `docs/atlas/runs/` |
| Observe diff | `yarn atlas:diff --a … --b …` | biggest rate deltas (unknown-unknown finder) |
| Rules scorecard | `yarn evolve` / `yarn sim` | JSONL under `packages/subspace-lattice/docs/sim-runs/` |
| AI ladder / TEI | `yarn calibrate:ai`, strength-bar | Ordinals, trunc rates |
| Match export | LPGN + `yarn annotate:lpgn` | Human-readable grades |

## Strength presets (sims)

| Id | Sims (approx) | Notes |
| --- | ---: | --- |
| fast | 0 | Heuristic |
| normal | 50 | |
| strong | 200 | |
| deep | 800 | Deep Lattice product preset |

## Wishlist

- [ ] Published calibration table: Fast &lt; Normal &lt; Strong &lt; Deep on fleet
- [ ] Piece-move histograms by strength id
- [ ] Human TEI pool snapshots linked from the Atlas (federation leaderboard)
