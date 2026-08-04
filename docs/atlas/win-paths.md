# Atlas — Win paths

Three fiction finishes (engine `winnerReason`):

| Reason | Fiction |
| --- | --- |
| `hub-capture` | Surgical Strike |
| `sector-integration` | Sector Integration (clock) |
| `no-moves` | Lockout / Frozen |

Meta terminations (also LPGN `Termination`):

| Reason | Meaning |
| --- | --- |
| `resign` | Human / online resign — opponent wins |
| `ai-resigned` | Local AI conceded a forced loss (Grandmaster resignation) |

**Truncation** (ply cap in sims) is not a draw rule — it is a measurement
artifact. True draws are rare; report them separately from truncations.

---

## Where the population numbers live

`packages/subspace-lattice/src/lib/sim/scorecard.ts` via **`yarn evolve`** /
**`yarn sim`**:

- Hub / sector / Lockout rates among **decided** games
- EMP fire rate and EMP→Lockout signature
- Median plies to hub vs sector
- Fairness (color) and skill ladders

Playtest target feel (fleet checklist): hub-hunt still large; sector roughly
**25–40%** of decided sims.

## Lab note — Heuristic mirrors (2026-08-01)

`yarn atlas:observe` / `yarn atlas:diff` under **`hybrid-fleet`**:

| Matchup | n | Cap | Hub | Sector | Lockout | Trunc | Mean plies | EMP/game |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Heuristic vs random | 40 | 400 | **100%** | 0% | 0% | 0% | 63 | 1.4 |
| Heuristic vs heuristic | 40 | 400 | 0% | 0% | 5% | **95%** | 393 | **23** |
| Heuristic vs heuristic | 20 | **800** | 0% | 0% | 5% | **95%** | 793 | **49** |

Artifacts: `docs/atlas/runs/observe-HvR-s7.jsonl`, `observe-HvH-s8.jsonl`,
`observe-HvH-s9-p800.jsonl`.

**Read:** equal heuristics do not “need more plies.” Doubling the cap leaves
truncation at 95%. Soft-EMP fires repeatedly (~Beam-heavy mover share in the
diff) without Surgical Strike or Sector Integration. HvR is a weak-baseline
steamroll (hub-only), not a population model of human play.

Do **not** judge rules fairness from HvH trunc alone — use mixed ladders /
evolve scorecards for decided-game path mix.

## Lockout without EMP

Structurally unreachable while both Hubs live — see
[Lockout impossibility](../lockout-impossibility). EMP restores a legal Lockout
path (soft freeze or Terminal Overclock).

## Wishlist

- [x] Decided vs truncated rates for HvH / HvR (same observe seeds; see table above)
- [ ] Color split of each win path under Initiative Relay
- [ ] “Quiet” games: plies with zero captures before first blood
- [ ] Decided vs truncated for Deep vs heur (post EMP-lockout filter)
