# Terminal Overclock probe — balance dial ladder (2026-07-31)

Ran with `--games=40 --max-plies=120`, randomized Hub starts (Chebyshev ≥6).

## Dials (in order)

| Dial | Rule | Hubs-only trunc | Hubs-only White WR | White-lone vs Hub+Esc WR |
| --- | --- | ---: | ---: | ---: |
| **0** lone-any | Terminal if *you* are lone | 0% | **97.5%** | **100%** (lone Overclock wins) |
| **1** both-lone | Terminal only if *both* lone | 0% | 92.5% | **0%** (escort side captures Hub) |
| **2** +shared clock | Both-lone entry resets both charges | 0% | 97.5% | 0% |
| **3** +entry komi=1 | Waiting side starts at charge 1 | 0% | **2.5%** (over-correct) | 0% |
| OFF | No Terminal | **92.5%** | — | — |

## Verdicts

1. **Both-lone (dial 1) — KEEP.** Fixes “losing the fleet gets rewarded.” Lone Hub vs Hub+Escort goes from 100% Lockout for the loner to 100% Surgical Strike for the richer side.
2. **Shared phase clock (dial 2) — KEEP.** Does not fix Heuristic first-mover WR by itself, but prevents banking charge before the opponent joins Phase 3. Correct fiction.
3. **Entry komi=1 (dial 3) — REJECT for shipping.** Flips seat bias (W 97% → 2.5%). Need a fairer tempo rule later (seat-swap eval, leader penalty experiments, etc.).

**Shipping defaults:** dials **1+2**, `terminalPhaseEntryKomi: 0`, `terminalEmpChargeTarget: 10`, plus **thermal runaway** (dial 4, post-ladder): `terminalEmpRadiusGrowthInterval: 5`, `terminalEmpRadiusMax: 10`.

4. **Thermal runaway (X=5) — SHIP.** Shared Terminal age grows blast +1 every 5 plies (cap 10). Closes soft kite; fiction in `terminal-overclock.md`.

## Other

- Midgame HvR: Strike still ~97–100%; Terminal ON Lockout ~2.5%.
- Heuristic/MCTS: still fire only on forced Lockout hits (miss spam 0).
- Geometry: static r=3 still leaves ~72% of Hub pairs out of blast at phase entry; growth forces eventual contact.

Re-run: `yarn nx run core:terminal-overclock-probe -- --games=40 --max-plies=120`
