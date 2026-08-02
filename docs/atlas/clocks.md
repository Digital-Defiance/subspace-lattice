# Atlas — Clocks & Terminal

## Sector clock (`hybrid-fleet` defaults)

| Knob | Typical shipping value | Role |
| --- | --- | --- |
| Activation ply | **100** | Clock disarmed before this |
| Integration ratio ρ | **0.45** | Coverage threshold |
| Hold | **1** ply | Must hold coverage across the reply |

Contested (overlapping) net cells count for **neither** side. Simultaneous
both-ready at activation does not double-award — ADR 006.

## Terminal Overclock & EMP

Normative / dial notes: [Terminal Overclock](../terminal-overclock).

Empirics live in dated probes under
`packages/subspace-lattice/docs/sim-runs/` and
`packages/subspace-lattice/docs/terminal-overclock*.md`.

Heuristic AI treats **EMP that immediately Lockouts** as a tactical nuke
(+50k). As of 2026-08-01, MCTS / heuristic also reject moves that **leave the
opponent** an immediate Lockout EMP (`moveLeavesEmpLockout` in
`packages/subspace-lattice/src/lib/ai/tactical.ts`; ablation
`LATTICE_EMP_LOCKOUT_FILTER=0`). Soft midgame EMP that does **not** Lockout
is still rewarded by the heuristic leaf — equal-heuristic mirrors therefore
soft-EMP shuffle for hundreds of plies (see [Win paths](./win-paths) lab
note). That is an **agent** pathology for population sims, not proof the
clock is broken.

## Wishlist

- [ ] Distribution of ply when TO arms (not only worst case)
- [ ] Plies from TO-armed → Lockout or Strike under Deep vs Deep
- [x] EMP fires per game by matchup (observe: HvR ~1.4, HvH ~23 @400 / ~49 @800)
- [ ] EMP fires by phase (pre-activation / mid / TO)
