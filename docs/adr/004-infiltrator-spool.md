# ADR 004: Infiltrator Navigational Target Lock (hybrid-spool)

## Status

Accepted (experimental `rulesVersion`; A/B vs `hybrid`)

## Context

MCTS fairness on promoted hybrid knobs (`R_hub=3`, `L=2`, `ρ=0.45`) showed Sector Integration working as an endgame clock, but White win rate ≈27%. Diagnosis: second-mover reactive Infiltrator warps and Detection Trap from first-mover overextension.

## Decision

1. Promote structural hybrid defaults to sim-backed knobs (see `HYBRID_RULES`).
2. Add `rulesVersion: hybrid-spool` with `infiltratorSpoolUp: true` (**Navigational Target Lock**):
   - Turn 1: announce a legal warp destination (piece does not move; turn ends).
   - Turn 2: only that destination is legal; if still legal, warp (and capture); if illegal, stay and consume the turn.
3. Keep instantaneous warps on `hybrid` for A/B.
4. Match telemetry records captures by mover type, spool announces, and spool failures.

## Consequences

- Online/local defaults stay on `hybrid` until spool A/B passes the human gate.
- UI should eventually show spool targets; engine is authoritative.
- Measure: White WR, hub/sector/clock, `infiltratorCapturesPerGame`.
