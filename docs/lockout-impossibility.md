# Lockout under hybrid-fleet (and EMP)

Technical note on the third win condition (`winnerReason: 'no-moves'`).
Shipping ruleset: **`hybrid-fleet`**. Without EMP, Lockout is structurally
unreachable against a live Hub; **Command Overload (EMP)** restores a rare
but legal path. Empirics and engine probes as of 2026-07-28.

---

## 1. What Lockout is

After a legal move, `finishTurn` checks whether the opponent has any legal
reply. If not, the mover wins:

```text
winnerReason = 'no-moves'   // fiction: Lockout / “Frozen”
```

See `SubspaceLatticeEngine.finishTurn` in
`packages/subspace-lattice/src/lib/game-engine.ts`. Fiction and overview copy
still list three finishes — Surgical Strike, Sector Integration, Lockout
(`docs/story.md`, ADR 001).

The predicate is simple: `listLegalMoves(opponent).length === 0` while that
side still has pieces on the board (in particular, still has a Command Hub —
capturing the Hub ends the game earlier as `hub-capture`).

---

## 2. Empirical picture

With the sector clock deferred (so Strike / Lockout can decide):

| Setup | Games | Lockouts |
| --- | ---: | ---: |
| Random vs Random, standard beams | 400 | **0** |
| Heuristic vs Random, standard beams | 80 | **0** |
| Random vs Random × Standard / Refractor Wing / Fleet Draft | 100 each | **0** |
| Heuristic vs Random × those three presets | 30 each | **0** |

Mobility-pressure agents can drive an opponent down to a **handful** of legal
replies (Academy Ep. 11 used a position with **3**). They do not finish at
zero. Heavy wing presets **raise** opening branching (≈183 → 184 → 188 legal
White moves) and do not create Lockout finishes.

Sample size is not the bottleneck. The rest of this note is why zero is
structurally unavailable while both Hubs remain.

---

## 3. Movement facts that block freeze

Under hybrid movement (unlocked unless noted):

| Piece | Mobility that matters for Lockout |
| --- | --- |
| **Command Hub** | King-step: any of up to **8** adjacent squares (`dx,dy ≤ 1`). Target Locked → **one orthogonal** step only. |
| **Escort** | One orthogonal step (locked or not). |
| **Infiltrator** | Warp to many squares if unlocked; one orthogonal if locked. |
| **Beam / Refractor / Carrier** | Long slides in net if unlocked; one orthogonal if locked. |

Landing on an enemy piece is a **capture** whenever the movement rule allows
that destination — including a Target-Locked Hub crawling onto an adjacent
Escort.

There is **no chess-style check filter**: a side may move into enemy net,
adjacent to enemy attack, etc. Mobility is not pruned by “safety.”

---

## 4. Structural argument

Fix Black as the side we hope to Lock out. White has just moved; Black to
reply. Black still has a Command Hub (otherwise White already won by Strike).

Consider any Black piece and each orthogonally/diagonally relevant neighbor
(per that piece’s move set). For the Hub especially, every king-adjacent
square is one of:

| Neighbor cell | Effect on Hub mobility |
| --- | --- |
| Off-board or Gravity Well | Blocked |
| **Empty** | **Legal step** |
| **Enemy piece** | **Legal capture** |
| Friendly piece | Blocked for the Hub — but that friendly is another Black piece that needs its *own* replies denied |

So:

1. **Empty perimeter ⇒ moves.**  
   Any proper subset of the board occupied by Black has a frontier. On an
   11×11 with a single central Gravity Well (which does **not** bipartition
   the grid), that frontier always touches empty cells or White cells unless
   Black occupies essentially everything left.

2. **White contact ⇒ captures, not a wall.**  
   Surrounding a Hub with White material does not freeze it — it feeds it.
   Probes:

   - Lone Hub, corner, open board → **3** moves.  
   - Lone Hub, corner, White on all three king-exits → **3 captures**.  
   - Lone Hub, midboard, White on all eight neighbors → **8 captures**.  
   - Same Hub Target Locked in the corner with White nearby → still **≥ 2**
     orthogonal replies (empty and/or capture).

3. **Fill the board around White’s Hub ⇒ Strike, not Lockout.**  
   If Black occupies every non-Well cell except White’s Hub, some Black piece
   is adjacent to that Hub and can capture it → `hub-capture` for Black (or
   the reverse if White is the packed side). The game ends as Surgical Strike
   the moment the Hub falls; you never score `no-moves` for “no pieces left.”

4. **Friendly self-smother fails on the surface.**  
   Packing Black’s own pieces so the Hub has no empty king-step only pushes
   the problem to the outer Escorts/Heavies: those surface units step into
   empty space or capture White. There is no “pocket” sealed only by board
   edge + Gravity Well that leaves White a legal Hub square elsewhere.

Together: while a Hub exists, Black almost always has at least one legal
origin×destination. Removing the Hub is Strike. Therefore
`winnerReason: 'no-moves'` does not occur in reachable hybrid-fleet play.

---

## 5. “Lone Hub vs huge White material”

This is the intuitive Lockout endgame (Black blundered away the fleet). It
still fails.

White’s extra ships do not act as impassable walls. They are capturable
destinations for a king-Hub (or ortho-crawl destinations when locked). The
only way that lone Hub stops generating legal moves is when White **captures
it** — which is Surgical Strike.

Target Lock does not close the gap today: locked units may still capture on
their single orthogonal step.

---

## 6. Heavy wing does not help

Refractor Wing and Fleet Draft add diagonal / omni slides for unlocked
heavies. That **increases** the set of moves that must be extinguished.
When locked, heavies reduce to the same one-step orthogonal crawl as Escorts.
The Hub, capture-as-escape, and empty-perimeter arguments are unchanged.
Empirically: **0** Lockouts across Standard / Refractor Wing / Fleet Draft
probes above.

---

## 7. Why chess “mate / stalemate” works here and Lattice does not

Chess can force zero legal moves because:

- Mobility is filtered by **check** (many king steps are illegal).  
- Adjacent enemy pieces often cannot be captured if protected (again via check).  
- The king is short-range **and** constrained.

Lattice Lockout uses the raw legal-move list with **no safety filter**, and
the Hub **may capture** adjacent unit. Surround patterns that look like a
“freeze” in fiction are free captures in the engine.

ADR 001 inherited `no-moves` from `classic` as a second win beside Hub
capture. Sector Integration later covered dig-in games. Lockout remained in
the victory table and story glossary without a movement regime that can
produce it.

---

## 8. Consequences (pre-EMP)

- **Rated / AI play (historical):** Strike and Sector Integration were the live
  win paths; Lockout was implemented but not a realistic plan without EMP.  
- **Academy / fiction:** “immobility is defeat” is true as an engine rule;
  without EMP it was misleading as a practical third finish.  
- **Evolve / balance targets** that assume a non-trivial `noMovesRate` will
  not be met under hybrid-fleet movement **unless EMP is in the ruleset**.

---

## 9. EMP (Command Overload) — Lockout path (test-shipped)

Adopted as a **lobby-tunable** module on `hybrid-fleet` (defaults on;
classic / hybrid base leave EMP off with radius/target 0):

| Knob | Default | Meaning |
| --- | --- | --- |
| `empRadius` | 3 (max 5) | Chebyshev blast radius from the firing Hub |
| `empChargeTarget` | 15 | Non-Hub plies with a **stationary** Hub to arm EMP |
| `empBlackoutPlies` | 1 (max 3) | Enemy reply plies the blackout survives |

**Rules of thumb:**

1. Non-Hub move → `empCharge[side] += 1`. Hub move → charge resets to 0.  
2. Firing EMP is a full-turn action (`fireEmp` / `{ type: 'emp' }`). Spending
   the whole turn **is** the cost — the blast is directional and never touches
   the firing fleet, so there is no "own Hub is immune" special case.  
3. **Enemy** pieces within radius return no legal moves. The blackout burns one
   `empBlackoutPlies` each time the frozen side commits an action, so the firer
   cannot shorten its own blast by shuffling ships.  
4. If every remaining enemy piece is disabled → `listLegalMoves` is empty →
   `winnerReason: 'no-moves'` (Lockout).

Academy Episode 11 uses composed mission `mission-emp-lockout` (charged
position → EMP → Lockout).

### Balance probe — enemy-only EMP (2026-07-29)

Script: `packages/subspace-lattice/scripts/emp-balance-probe.sh` (full grid
over radius × charge × blackout, then `--confirm` on candidate defaults).
Results in `packages/subspace-lattice/docs/sim-runs/emp-balance-*.json` and
`emp-confirm-*.json`.

**Radius is the only strong lever.** Lockout share of Heuristic-vs-Random
games, pooled over all charge and blackout settings (40 games/cell, max 200
plies):

| `empRadius` | Lockout | Notes |
| ---: | ---: | --- |
| 1 | 0.1% | EMP is decoration |
| 2 | 0.4% | almost never decisive |
| **3** | **1.5%** | rare but real |
| 4 | 3.8% | starts crowding Strike |
| 5 | 6.3% | blast covers most of an 11×11 board |

**Blackout length barely matters:** 30 / 29 / 28 Lockouts per 1200 games at
`empBlackoutPlies` 1 / 2 / 3. A Lockout either exists on the immediate reply or
not at all; extra plies only delay a fleet that already had somewhere to go.
Treat the knob as flavour (recovery time), not balance.

**Confirm run** (120 games/cell, `--confirm`), at `r=3 / t=15 / b=1`:

| Matchup | Clock | Lockout | Strike | Truncated |
| --- | --- | ---: | ---: | ---: |
| H vs Random | deferred | 2 (1.7%) | 118 | 0 |
| H vs Random | fleet | 0 | 120 | 0 |
| H vs H | deferred | 19 (16% of games) | 0 | 101 |
| H vs H | fleet | 22 (18% of games) | 0 | 98 |

**Read the HvH numbers carefully:** equal heuristics stall regardless of EMP —
the `r=0` baseline truncates 117/120 games with no Lockouts. So EMP is not
displacing Strike there, it is *finishing games that otherwise time out*. At
`r=4` that rises to ~30% of HvH games, which is a flood.

**Chosen defaults (unchanged from the friendly-fire probe):** `empRadius=3`,
`empChargeTarget=15`, `empBlackoutPlies=1`. Dropping friendly fire did not
require a compensating nerf: the self-tax was always the lost turn, and against
scattered enemy fleets the firing side's own ships were rarely in the blast
anyway.

Other historical levers (Target-Locked cannot capture, Hub never captures,
chess-like check) are **not** required once EMP ships.

---

## 10. Repro probes

Ad hoc probes used for this note (not checked in):

- Compose lone-Hub / full-pack positions via `SubspaceLatticeEngine.fromState`
  and count `listLegalMoves`.  
- `playMatch` with `sectorActivationPly` deferred; tally `winnerReason`.  
- Compare `resolveFleetLobbyRules({ heavyWingPreset })` for Standard /
  Refractor Wing / Fleet Draft.  
- EMP unit tests: `game-engine.emp.spec.ts`.  
- EMP balance grid: `bash packages/subspace-lattice/scripts/emp-balance-probe.sh`.
  Results under `packages/subspace-lattice/docs/sim-runs/emp-balance-*.json`.

Engine reference: `hasAvailableMoves` / `finishTurn` → `setWinner(..., 'no-moves')`;
`fireEmp` / `isEmpDisabled` / `empActive`.