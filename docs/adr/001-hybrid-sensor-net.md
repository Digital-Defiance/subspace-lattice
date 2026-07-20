# ADR 001: Hybrid Sensor Net rules

## Status

Accepted (Phase 1)

## Context

`classic` is chess-like movement with hub capture / no-moves wins. The design README describes Sensor Net territory, piece-specific net movement, detection, and Sector Integration. We need a concrete, versioned `hybrid` ruleset that sims and the UI can share.

## Decision

### Gravity wells

Blockers only: cannot occupy or path through. No other geometry modifiers.

### Sensor Net (sovereign space)

Chebyshev distance (king-move metric).

| Source | Radiates |
| ------ | -------- |
| Command Hub | Always, radius `hubSensorRadius` (default 2) |
| Escort | Only if **linked** to the hub, radius `escortSensorRadius` (default 1) |
| Beam / Infiltrator | Do not radiate |

**Linking:** BFS from the Command Hub through friendly pieces. Two friendly pieces are adjacent in the graph if Chebyshev distance ≤ `linkDistance` (default 2). Escorts in the connected component radiate.

Sovereign coordinates include squares occupied by any pieces and empty squares. Gravity wells may fall inside a radius but are **excluded** from Sector Integration counting.

### Movement (`hybrid` only)

| Piece | Normal | Detected |
| ----- | ------ | -------- |
| Command Hub | 1 any direction | 1 orthogonal only |
| Escort | 1 orthogonal | 1 orthogonal |
| Infiltrator | Warp to any square that is empty or enemy-occupied and **not** in the enemy Sensor Net (jumps; path ignored) | 1 orthogonal |
| Beam | Rook orthogonal, clear path; **every** step and destination must lie in **own** Sensor Net | 1 orthogonal |

Capture: landing on an enemy piece removes it (same as classic), subject to the movement rules above.

### Detection

A piece is **detected** if its current coordinate is in the opponent’s Sensor Net. While detected, it loses special movement and may only step 1 orthogonal.

### Victory

1. **Surgical Strike** — capture enemy Command Hub  
2. **No moves** — opponent has no legal moves after your move  
3. **Sector Integration** — after your move, your Sensor Net covers ≥ `sectorIntegrationRatio` (default 0.51) of all non–gravity-well coordinates  

`classic` keeps (1) and (2) only, with chess-like piece moves.

### Defaults

- Engine / tests without a version stay on `classic` for regression.  
- New online rooms and local AI games use `hybrid`.

## Consequences

- Legal-move generation must precompute both nets per side (cached per call).  
- UI should show sovereign overlay and updated rules text.  
- Elo / puzzles need hybrid-specific cases; classic puzzles remain for `classic`.  
- Evolution (Phase 3) can vary radii, link distance, and sector ratio via `RulesConfig`.
