# ADR 006: Color-neutral Sector Integration ties

**Status:** Accepted  
**Date:** 2026-07-21

## Context

Late Sector Integration activation exposed a large color split. The paired-color
harness removed agent-strength noise, but the engine still awarded a
simultaneous completed hold to the player who made that ply. White always moves
on odd plies and Black on even plies, so an `act80` ruleset embedded a Black
tiebreak while `act79` or `act81` embedded a White tiebreak.

This was a deterministic rules asymmetry, not evidence that one color's
starting position or AI policy was inherently stronger.

## Decision

If both fleets satisfy Sector Integration at the same time, neither fleet wins
while that tie persists. This applies to instant integration and Integration
Hold. The sector victory resolves only when one fleet satisfies the requirement
and the other does not.

Hub capture and no-legal-moves victory remain available during a tied sector.

## Consequences

- Activation-ply parity no longer acts as an implicit color tiebreak.
- Contested late positions may continue until one fleet disrupts the other's
  network, reinforcing tactical counterplay.
- The post-fix 48-game run split sector wins 4–3, but total wins 10–36 because
  Hub captures split 6–33. The tie rule is corrected, but `act80` remains
  rejected while first-player disadvantage is addressed separately.
- Engine tests cover simultaneous activation and one-sided hold completion.
