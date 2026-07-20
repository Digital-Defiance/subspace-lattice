# ADR 002: Evolution human gate

## Status

Accepted (Phase 3)

## Context

Batch sims can score alternate `RulesConfig` and MCTS hyperparameters. Auto-promoting winners into shipped defaults would silently change gameplay for players and invalidate Elo/puzzles.

## Decision

1. `runEvolution` / `yarn evolve` **only** emit scorecards and JSONL candidates.
2. `humanGateRequired: true` is always set on run results.
3. Default `HYBRID_RULES` and `AI_STRENGTH_PRESETS` change **only** via explicit human (or PR) edit after reviewing Pareto / composite winners.
4. AI hyperparameter trials always freeze the current hybrid rules so rule changes and AI changes are not confounded.
5. Scorecards track win-path telemetry (`hubCaptureRate` / `sectorIntegrationRate` / clock signature). Sector Integration is treated as an **endgame clock** (~25–40% of decided wins, later median plies than hub capture), not a forced 50/50 primary goal. Asymmetric Komi stays out of v1 until White win rate evidence isolates high-reach first-mover skew.
6. Fairness self-play defaults to modest **MCTS** (`--fairness-mcts`) so Sensor Net races are explored; unit tests keep `fairnessMctsSims: 0` (heuristic). Clock hard-reject requires ≥8 samples of *both* hub and sector wins; thinner samples only soft-downrank composite.
7. Win-path and piece-activity telemetry use **equal-strength fairness matches only**. Strong-vs-random games contribute only skill discrimination and general runtime metrics; their intentionally lopsided finishes must not bias the sector clock.
8. `yarn evolve -- --rules <version>` evaluates one exact version for matched A/B runs instead of sampling the parameter space.

## Consequences

- CI may run evolve smoke tests; it must not rewrite `rules-config.ts`.
- Promotion checklist: update config → update `docs/rules.tex` → `yarn build:rules` → re-baseline puzzles/ladder.
- Hyper-territorial / cosmetic-net / well-sampled early-sector configs are rejected before Pareto selection.
