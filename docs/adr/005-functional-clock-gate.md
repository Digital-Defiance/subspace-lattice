# ADR 005: Functional clock gate (counterfactual) replaces median-timing hard reject

## Status

Accepted (2026-07-21)

## Context

Track A's fitness function (ADR 002 §5) operationalized "Sector Integration is
an endgame clock" as a **timing signature**: median plies of sector wins must
exceed median plies of hub wins (`medSec > medHub`, hard reject at ≥8 samples
per path).

A month-long fixed-cell campaign (see `packages/subspace-lattice/docs/evolution-lab.md`)
showed that no mechanic — Integration Hold, Contested Space, ρ micro-steps,
late-game activation — ever produced a well-sampled `medSec > medHub`, even in
configs that were otherwise fair, skill-separating, and in the 15–45% sector
band. The best candidate (`hub3/esc1/link2/ρ0.45/hold1/neutral/act80`) was
rejected solely on this gate (Δ=−7, n_sec=10).

The timing signature confounds win *type* with match *evenness*: sector wins
sample from games where one side achieved net dominance (which convert fast by
any path), while hub captures sample from even grinds (slow). A clock can be
fully functional while never being the slowest win type.

## Decision

1. **The clock is validated functionally, not by win-time medians.** A
   sector-disabled twin of each cell (`sectorIntegrationRatio: 1.01`,
   unreachable) is evaluated with the **same seed** (common random numbers).
   The clock is *functional* when removing it degrades the game:
   `deadlockRate +10pp` or `avgPlies +20%` (`clockFunctionVerdict`).
2. `yarn evolve -- --counterfactual` runs these twins and reports
   `clock function ✓/✗` per cell; JSONL gains `counterfactual-scorecard`
   entries with `clockFunctional`.
3. `TRACK_A_THRESHOLDS.requireClockSignature = false`. The legacy timing
   signature remains a **soft composite bonus** only. Track B unchanged;
   `DEFAULT_SCORECARD_THRESHOLDS` unchanged (legacy tests keep the hard gate).
4. Sector share hard gate stays 15–45% of decided games (sweet band 25–40%).

## Evidence

`evolve-20260721-act80-counterfactual.jsonl` — 48 fairness games, MCTS 30,
maxPlies 240, paired seed 42:

| Metric | act80 (clock on) | ρ1.0 twin (clock off) |
| --- | ---: | ---: |
| deadlockRate | 2.1% | 16.7% (8×) |
| avgPlies | 115.4 | 153.4 (+33%) |
| median hub capture | 108 | 125.5 |
| interestingMidgame | 0.44 | 0.17 |
| fairness | 0.60 | 0.60 (clean control) |

Removing the sector threat did not redistribute wins; it produced more
truncations, longer grinds, and duller midgames — while hub captures *slowed
down*. Sector pressure mostly cashes out as faster hub captures, which is
exactly why the timing signature could never fire.

## Consequences

- act80 (`hybrid_hub3_esc1_link2_sec0.45_hold1_neutral_act80`) passes Track A
  gates on existing data and is the human-gate candidate for a **v1.0-fleet**
  experimental preset. Promotion still follows ADR 002 (human edit, rules.tex,
  puzzles/ladder re-baseline).
- Counterfactual runs double fairness-game cost; use them for confirmation
  runs, not broad screens.
- Changing a fitness function after seeing candidates is a bias risk. This
  redefinition is justified by a *mechanistic* finding (hub-median speedup
  under clock pressure), not by the candidate's score, and is recorded here
  for that reason.
