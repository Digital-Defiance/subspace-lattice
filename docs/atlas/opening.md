# Atlas — Opening

Ruleset: **`hybrid-fleet`** unless noted. Regenerable facts come from
`yarn atlas:census` → [`census.json`](./census.json). Strategy (named lines):
[Playbook · Volume I](./playbook#volume-i--opening).

**Board size:** shipping stays **11×11**. 9×9 lab ditched (2026-08-02) — see
[board-size lab](./board-size-lab).

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

---

## Volume I status (sim-provisional, frozen 2026-08-02)

| Claim | Status | Artifact |
| --- | --- | --- |
| White ply-0 ≈ always Infiltrator (practice) | Done | MvM@40 n=80 book |
| Deep-leaf principal `I (7,0)→(5,4)` | Done | `opening-rate-deep-leaf-d1-s800.json` |
| Black reply band (I / Beam / Escort nearly tied) | Done | `opening-rate-deep-leaf-d2-s800.json` |
| Named depth-2 practice pairs (n≥3) | Done | playbook table |
| Depth ≥4 ECO codes | **Blocked** | branching; do not burn MvM@40 for this |
| Sharper ply-0 under MvM@200 | **Done** | `observe-MvM-open-s41-m200` — (6,3)/(5,4)/(4,3) band; 80% sector |

Do not expand Volume I further unless humans contradict the Overture.

## Still open (not opening theory)

- Initiative Relay value: measured (see playbook) — small win% Δ; keep shipping.
- Branching factor by ply until first capture (census extension).
