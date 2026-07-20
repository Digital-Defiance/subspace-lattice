# Subspace Lattice

A two-player perfect-information fleet game combining the individual piece
agency of Chess with the connected influence and territorial pressure of Go.
It is the quiet strategy game played by the bridge watch between alerts.

Player-facing overview: [`docs/player-overview.md`](../../docs/player-overview.md).
Balance / evolve lab: [`docs/evolution-lab.md`](./docs/evolution-lab.md).

> Extend a relay-linked Sensor Net across the sector while maneuvering a
> specialist fleet to capture the enemy Command Hub before territorial
> integration becomes inevitable.

## The sector

- Board: fixed 11×11 coordinate grid.
- White deploys at `y=0` and moves first; Black mirrors at `y=10`.
- The Gravity Well at `(5,5)` cannot be occupied or crossed.
- Each fleet has one Command Hub, three Escorts, two Infiltrators, and two
  Beams.

The canonical initial setup is generated directly from the engine at:

```text
http://localhost:4200/setup-diagram
```

The harness contains a **Download SVG** action for manuals and diagrams.

## Where Go meets Chess

| Fleet element | Tactical role | Influence role |
| --- | --- | --- |
| **Command Hub** | King-like objective and mover | Projects Sensor Net radius 3 |
| **Escort** | Orthogonal close-range piece | Relays the linked Sensor Net at radius 1 |
| **Infiltrator** | Long-range gap attacker | Warps only outside the enemy Sensor Net |
| **Beam** | Rook-like line piece | Its entire route must remain in friendly Sensor Net |

Friendly pieces form a link graph at Chebyshev distance ≤2. Escorts connected
to the Command Hub expand the fleet’s **Sovereign Space**. An enemy standing
inside that space is **Target Locked**: special movement is suppressed and the
piece may only move one orthogonal coordinate.

## Victory

1. **Surgical Strike** — capture the enemy Command Hub.
2. **Sector Integration** — cover at least 45% of non-well coordinates with
   your Sensor Net.
3. **No legal moves** — leave the opposing fleet without an action.

Surgical Strike is the primary tactical payoff. Sector Integration is an
endgame clock that forces fleets out of permanent defensive formations.

## Rules versions

- `classic` — regression/reference movement without Sensor Net effects.
- `hybrid` — current main rules (`hub3 / escort1 / link2 / ρ0.45`).
- `hybrid-spool` — experimental **Navigational Target Lock**: an Infiltrator
  announces a warp coordinate, then executes or fails on its next action.

Shipping changes remain human-gated after equal-strength MCTS scorecards.
Normative rules are in `docs/rules.tex`; decisions are recorded under
`docs/adr/`.

Evolve supports two design tracks, OpenSkill skill ladders, and fixed-cell
evals (no random sampling). Methodology and campaign findings:
[`docs/evolution-lab.md`](./docs/evolution-lab.md).

```bash
yarn evolve -- --track A --candidates 8 ...   # fleet / Surgical Strike primary
yarn evolve -- --track B --candidates 8 ...   # territory co-equal

# Track A 4-cell matrix (link2 bridge)
yarn evolve -- --track A --ai-trials 0 --jobs 14 \
  --fairness-games 24 --skill-games 16 --fairness-mcts 30 \
  --fixed hub3,esc1,link2,0.51 \
  --fixed hub3,esc1,link2,0.6 \
  --fixed hub2,esc1,link2,0.51 \
  --fixed hub3,esc1,link2,0.7 \
  --out docs/sim-runs/evolve-$(bdate -s '%Y%m%d')-trackA-matrix.jsonl

# Integration Hold matrix: coverage must persist `hold` consecutive plies
# before Sector Integration wins (hold0 = instant, legacy behavior).
# Raise --max-plies so late sector clocks can finish (deadlockRate = truncations).
yarn evolve -- --track A --ai-trials 0 --jobs 14 \
  --fairness-games 24 --skill-games 16 --fairness-mcts 30 \
  --max-plies 240 \
  --fixed "hub3,esc1,link2,0.45,hold8;hub3,esc1,link2,0.45,hold10;hub3,esc1,link2,0.45,hold12" \
  --out docs/sim-runs/evolve-$(bdate -s '%Y%m%d')-hold-long.jsonl

# Contested Space (`neutral`): cells covered by both nets count for neither,
# so projecting into the enemy net directly stalls their territorial clock.
yarn evolve -- --track A --ai-trials 0 --jobs 14 \
  --fairness-games 24 --skill-games 16 --fairness-mcts 30 \
  --max-plies 240 \
  --fixed "hub3,esc1,link2,0.45,neutral;hub3,esc1,link2,0.45,hold4,neutral;hub3,esc1,link2,0.45,hold8,neutral" \
  --out docs/sim-runs/evolve-$(bdate -s '%Y%m%d')-neutral-matrix.jsonl

# Late-game activation (`activation`/`act`): sector wins are disarmed before
# that ply, keeping viable territory geometry but filtering early paint wins.
yarn evolve -- --track A --ai-trials 0 --jobs 14 \
  --fairness-games 24 --skill-games 16 --fairness-mcts 30 \
  --max-plies 240 \
  --fixed "hub3,esc1,link2,0.45,hold1,neutral,act80;hub3,esc1,link2,0.45,hold1,neutral,act100;hub3,esc1,link2,0.45,hold1,neutral,act120" \
  --out docs/sim-runs/evolve-$(bdate -s '%Y%m%d')-activation-matrix.jsonl

# Functional clock test (ADR 005): each cell also gets a sector-disabled twin
# (ρ=1.01, same seed); report shows deadlock/length deltas and clock function ✓/✗.
yarn evolve -- --track A --ai-trials 0 --jobs 14 \
  --fairness-games 48 --skill-games 16 --fairness-mcts 30 \
  --max-plies 240 --counterfactual \
  --fixed "hub3,esc1,link2,0.45,hold1,neutral,act100,relay1" \
  --out docs/sim-runs/evolve-$(bdate -s '%Y%m%d')-fleet-confirm.jsonl
```

Console reports `clock✓/✗/?` plus `medHub` / `medSec` / `Δ` (sector−hub median plies).
Skill is scored via a mini OpenSkill ladder (calibration + ordinal separation).

Harness guarantees: fixed-cell matrices are evaluated with **paired seeds**
(common random numbers — cells differ only by rules). Fairness games also run
in color-swapped pairs: the same two seeded agent streams play once per side.
Reports lead with raw White/Black win rates and winner × win-path counts; the
fairness hard gate requires a 40–60% color band (`fairness >= 0.80`). Track A
hard-gates sector share of decided games to 15–45% (25–40% stays the composite
sweet band).
Track A validates the sector clock **functionally** (`--counterfactual`
ablation) rather than by win-time medians — see
`docs/adr/005-functional-clock-gate.md`. The current Track A candidate is
exported as `FLEET_V1_RULES` (`hold1 / neutral / act100 / relay1`), human
gate pending. Use `--fairness-agent heuristic|random|mcts` to pin the
equal-strength agent family during screens.
