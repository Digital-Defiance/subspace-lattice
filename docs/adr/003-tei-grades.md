# ADR 003: TEI grades on OpenSkill

## Status

Accepted

## Context

Warp uses **TEI** (`E97`-style) as a gamified presentation layer over OpenSkill. Subspace Lattice should share that universe so AI/human ratings read the same way across products.

## Decision

1. Store / compute raw OpenSkill `(μ, σ)` as the source of truth.
2. Present **TEI** via `getTeiDisplay` from **`warp12-engine`** — letter from σ (confidence), 0–99 from μ−3σ (skill), with hysteresis on the letter.
3. Persist ratings in Lattice’s own Firestore collection **`latticeTei`** (shared `warp-12` project, separate docs from Warp `playerStats`). Same alphabet; separate skill pool.
4. Ladder reports lead with TEI; Elo remains legacy secondary.
5. Do not vendor a second TEI *formula*; `@subspace-lattice/core` re-exports Warp’s rating/TEI API (`sim/tei-grade.ts`).

## Consequences

- UI should show TEI primarily; μ/σ in tooltips only.
- Module / ruleset switches that spike σ will visibly drop the letter grade (intended).
- TEI thresholds/calibration live in Warp; bump `warp12-engine` to pick up changes.
