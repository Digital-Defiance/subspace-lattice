# Game viability testing

How we tested whether Subspace Lattice is a **rigorous, playable two-path game** —
not just a rules sketch that happens to terminate.

This page is the product-facing summary. The lab protocol, knob chronology, and
JSONL artifact index live in
[`packages/subspace-lattice/docs/evolution-lab.md`](../packages/subspace-lattice/docs/evolution-lab.md).
Promotion policy is [ADR 002](./adr/002-evolution-human-gate.md).

---

## What “viable” means here

We treat the shipping **hybrid-fleet** design as viable when self-play evidence
shows all of the following:

| Claim | How we measure it |
| --- | --- |
| **Decisive** | Games finish before the ply budget; truncation/deadlock rate stays low |
| **Color-fair** | White win rate among decided games sits near even (Track A band ~40–60%, fairness ≥ 0.80 for soft-ship) |
| **Two real win paths** | Surgical Strike (hub) remains primary; Sector Integration takes ~15–45% of decided wins (sweet band 25–40%) |
| **Clock is functional** | Removing Sector Integration makes games worse — more truncations and longer grinds ([ADR 005](./adr/005-functional-clock-gate.md)) |
| **Skill matters** | Stronger agents beat weaker ones on an TEI mini-ladder (calibration + ordinal separation) |
| **Mechanics are deterministic** | Engine unit tests and color-paired harness catch mover-parity and tiebreak bugs ([ADR 006](./adr/006-color-neutral-sector-ties.md)) |

Sims never auto-ship a ruleset. A candidate can pass every Track A gate and still
require a human edit of `RulesConfig`, rules PDF sync, and playtest
([fleet checklist](./playtest-fleet-checklist.md)).

---

## Layers of testing

```text
Human playtest (checklist)          ← shipping confidence
        ▲
Evolution / scorecards (JSONL)      ← rule search + viability gates
        ▲
Skill ladders + AI calibration      ← strength ordering, TEI anchors
        ▲
Fairness self-play (MCTS / heuristic / random)
        ▲
Puzzles + engine unit tests         ← legality, mates, net, clock edge cases
        ▲
Shared core engine                  ← online, local AI, tutorial, sims
```

### 1. Engine and puzzle suite

Unit tests and puzzle positions cover hub mates, Sensor Net legality, detection,
sector thresholds, hold/activation edge cases, and simultaneous-hold ties.
Online rooms, local AI, and the tutorial all call the same
`@subspace-lattice/core` engine — there is no separate “sim rules” fork.

### 2. Match harness and agent ladder

Seeded match runners play agents to terminal positions:

- **Random-legal** — legality and baseline color skew
- **Heuristic** — fast policy screen and dose-response (e.g. Initiative Relay)
- **MCTS@N** — fairness telemetry and skill discrimination

`yarn sim` and the evolve skill block report win rates, length, and OpenSkill
calibration. Strong-vs-weak games measure skill only; win-path rates come from
**equal-strength fairness** matches so a stomping favorite does not invent a
fake sector clock.

### 3. Evolution scorecards (`yarn evolve`)

Batch search over `RulesConfig` knobs (geometry, hold, contested space,
activation, Initiative Relay, spool). Each cell gets:

1. Fairness self-play (default modest MCTS)
2. Optional TEI mini-ladder
3. Hard rejects + composite / Pareto ranking
4. Optional **counterfactual** twin with Sector Integration disabled

Track **A** optimizes the public fleet game (sector as clock). Track **B** allows
a more territorial soft-ship for internal comparison. Fixed-cell matrices with
**paired seeds** are preferred once a hypothesis exists — unpaired random
sweeps hid cliffs and false OK calls early in the campaign.

Raw evidence:
[`packages/subspace-lattice/docs/sim-runs/`](../packages/subspace-lattice/docs/sim-runs/).

### 4. Ablation and diagnosis (not just “pass the gate”)

Several claims were tested by **removing or isolating** a mechanic:

| Test | Result |
| --- | --- |
| Sector clock off (ρ unreachable twin) | Deadlocks ~8×, games ~33% longer, midgames duller — clock is functional even when sector wins are not the slowest finish ([ADR 005](./adr/005-functional-clock-gate.md)) |
| Winner × path breakdown | After color-tie fix, sector wins were ~even while hub captures carried seat imbalance — seat problem ≠ clock bug |
| Heuristic / random / MCTS screens | Same seat skew across families; Initiative Relay fixed it without hidden komi |
| MCTS opponent-node bug | Cooperative-tree error found and unit-tested; did not explain heuristic/random controls |

### 5. AI strength calibration

Local Fast / Normal / Strong budgets were Lattice-calibrated under hybrid-fleet
(`yarn calibrate:ai`). Self-play confirmed Strong ≻ Normal ≻ Fast with large
ordinal gaps; anchors map into the `latticeTei` officer track (see evolution-lab
§4.9).

### 6. Human playtest gate

Automated Track A OK is necessary, not sufficient. Soft-shipped `FLEET_V1_RULES`
still waits on the
[fleet playtest checklist](./playtest-fleet-checklist.md) (≥5 human games with
no broken clock moments, HUD clarity, relay feel) before replacing documented
defaults in `rules.tex`.

---

## What the 2026-07 campaign established

Condensed from the evolution lab chronology:

1. **Pure geometry fails Track A.** `link2` + ρ0.45 is hyper-territorial; raising
   ρ jumps to a cosmetic net. Integer cell counts leave no smooth dial.
2. **Hold alone fixes frequency, not timing.** Territory still forms early;
   hold only delays declaring the win.
3. **Contested Space + short hold + late activation** is the first combo that
   lands sector share in the Track A band with strong skill separation.
4. **Timing medians were the wrong clock metric.** Functional ablation replaced
   `medSec > medHub` as a hard gate.
5. **Activation parity was a rules bug**, not an AI quirk (ADR 006).
6. **First-seat disadvantage predates the sector clock**; one visible Initiative
   Relay Escort restores ~45–55% White WR across agent families. Two relays
   overshoot.
7. **Production confirm** of
   `hub3 / esc1 / link2 / ρ0.45 / hold1 / neutral / act100 / relay1` passes
   Track A (White 45% / Black 55%, sector ~30%, strong separation) and soft-ships
   as fleet / `FLEET_V1_RULES`.

---

## What we have *not* claimed

- Human meta and opening theory are not yet established.
- Online Elo/TEI pools are thin relative to the sim ladder.
- Imperfect-information / fog variants are out of scope (no ISMCTS yet).
- Passing Track A does not mean every agent family or every seed budget looks
  identical — always re-confirm at ≥48 fairness games before soft-shipping.

---

## Reproduce a confirmation run

```bash
yarn nx test core

yarn evolve -- --track A --ai-trials 0 --jobs 14 \
  --fairness-games 48 --skill-games 16 --fairness-mcts 30 \
  --max-plies 240 --counterfactual \
  --fixed "hub3,esc1,link2,0.45,hold1,neutral,act100,relay1" \
  --out packages/subspace-lattice/docs/sim-runs/evolve-$(date +%Y%m%d)-confirm.jsonl
```

See the evolution lab CLI section for Track B, matrices, and how to read a
scorecard line.

---

## Related documents

| Doc | Role |
| --- | --- |
| [evolution-lab.md](../packages/subspace-lattice/docs/evolution-lab.md) | Full methodology, chronology, artifact index |
| [ADR 002](./adr/002-evolution-human-gate.md) | No auto-promotion; telemetry rules |
| [ADR 005](./adr/005-functional-clock-gate.md) | Counterfactual clock gate |
| [ADR 006](./adr/006-color-neutral-sector-ties.md) | Simultaneous hold ties |
| [playtest-fleet-checklist.md](./playtest-fleet-checklist.md) | Human gate before official default |
| [ROADMAP.md](./ROADMAP.md) | Phase 0–5 lab and fleet stabilization |
| [player-overview.md](./player-overview.md) | Player-facing design intent |
