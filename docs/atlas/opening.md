# Atlas — Opening

Ruleset: **`hybrid-fleet`** unless noted. Regenerable facts come from
`yarn atlas:census` → [`census.json`](./census.json).

---

## Board & ply 0

- Board: **11×11** with center Gravity Well (blocks movement).
- White has the **Initiative Relay** Escort (extra piece vs Black’s mirrored 8).
- Sector clock is **disarmed** until activation ply (default **100**).

## Branching (ply 0)

White to move at the starting setup. “With Escort” = legal moves whose mover is
an Escort.

Surprise for chess players: **Infiltrators dominate the ply-0 movelist**
(166 / 183) — high fan-out, not “most important.” Escort share is small but
strategically loud (Relay).

| Metric | Value | Source |
| --- | ---: | --- |
| Legal moves (White) | **183** | `atlas:census` 2026-08-01 |
| Legal moves that are Escorts | **9** | same |
| Escort share | **4.9%** | 9/183 |
| Infiltrator moves | **166** | same |
| Can fire EMP at ply 0 | no | charge 0 |

Full mover-type breakdown: [census](./census).

Historical Lockout note (2026-07-28): heavy wing presets raised opening
branching ≈ **183 → 184 → 188** White legal moves — see
[Lockout impossibility](../lockout-impossibility). Re-run census after any setup
change; do not trust that band forever.

## What we still want

- Top first moves by visit count under Strong / Deep (opening book seed).
- Black’s reply tree after White’s three most common first moves.
- Effect of removing Initiative Relay on White’s ply-0 branching (counterfactual).
