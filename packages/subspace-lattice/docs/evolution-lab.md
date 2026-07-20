# Evolution lab — Track A / Track B rule search

Living notes for the self-play rule-evolution campaign. Normative rules stay in
[`docs/rules.tex`](../../../docs/rules.tex); the player-facing explanation of
what we built is [`docs/player-overview.md`](../../../docs/player-overview.md);
promotion policy is [ADR 002](../../../docs/adr/002-evolution-human-gate.md).
This document explains **how we train and test**, what we learned, and where
the JSONL evidence lives.

Raw runs: [`sim-runs/`](./sim-runs/).

---

## 1. What we are optimizing for

Subspace Lattice has two win paths under hybrid rules:

1. **Surgical Strike** — capture the enemy Command Hub.
2. **Sector Integration** — cover enough non-well cells with your Sensor Net.

Design intent for the public “fleet” game (**Track A**):

| Gate | Target |
| --- | --- |
| Color balance | White win rate ~45–55% among decided games (`fairness ≥ 0.4`) |
| Sector as clock | Sector share of decided wins in **15–45%** (sweet band **25–40%**) |
| Clock signature | Median plies of sector wins **>** median plies of hub wins (hard reject only when both paths have ≥8 samples) |
| Skill | OpenSkill calibration and ordinal separation on a mini ladder |
| Length | Few truncations (`deadlockRate ≤ 0.4`); interesting midgame share |

**Track B** treats territory as co-equal (looser sector ceiling, no clock hard
reject). Track B’s soft-ship candidate remains the territorial default
`hub3 / esc1 / link2 / ρ0.45` (no hold, no neutral, no activation).

Nothing in this lab auto-promotes defaults. Evolve always sets
`humanGateRequired: true`.

---

## 2. How a run works

```text
yarn evolve -- --track A|B [cells or --candidates N] …
       │
       ▼
  resolve fixed cells / sample RulesConfig
       │
       ▼
  for each config (paired seeds if --fixed):
       ├─ fairness self-play  (equal-strength MCTS @ --fairness-mcts)
       ├─ OpenSkill mini-ladder (skill games; optional)
       └─ scorecard → reject / composite / Pareto
       │
       ▼
  console report + optional JSONL
```

### Agents and matches

- **Fairness matches** drive win-path telemetry (hub vs sector rates, clock Δ,
  infiltrator captures, truncations). Default depth is modest MCTS
  (`--fairness-mcts 30` in most lab runs).
- **Skill** is a small OpenSkill ladder over agents ordered by expected
  strength (e.g. `mcts-N > heuristic > random-legal`). Reported as
  `cal=` (pairwise order accuracy), `sep=` (mean adjacent ordinal gap),
  `σ=` (mean rating uncertainty).
- **Deadlock rate** = share of fairness games hitting `--max-plies`
  (truncation), not “no legal moves”.
- **AI hyperparameter trials** freeze the selected rules so rule search and AI
  search are not confounded. Lab runs usually pass `--ai-trials 0`.

### Scorecard hard gates (Track A, current)

Roughly: instant-win and deadlock ceilings, minimum decisive rate, fairness
floor, OpenSkill calibration floor, **sector share ∈ [0.15, 0.45]**, and
clock-signature hard reject when both paths are well-sampled. Composite
bonuses reward the 25–40% sector sweet band and a soft clock preference.

Track B keeps a higher sector ceiling and does not hard-reject on clock.

### Harness guarantees added during this campaign

1. **`--fixed` cells** — evaluate exact knob combinations (no random sampling).
2. **Paired seeds** — every cell in a fixed matrix shares the same seed so cells
   differ only by rules (common random numbers). Random candidate sweeps still
   use per-index seeds.
3. **`engine.clone()` preserves full `RulesConfig`** — MCTS rollouts previously
   rebuilt rules from `rulesVersion` alone and silently discarded custom knobs.
4. **`--max-plies`** — expose the truncation budget (hold/activation games need
   room past the old hard-coded 120).
5. **`--track A|B`** — dual fitness functions for the two design intents.

---

## 3. Experimental knobs

All are fields on `RulesConfig`. Defaults preserve legacy hybrid behavior.

| Knob | Meaning | Default | `--fixed` token |
| --- | --- | --- | --- |
| Geometry | `hubSensorRadius`, `escortSensorRadius`, `linkDistance`, `sectorIntegrationRatio` | hub3 / esc1 / link2 / ρ0.45 | `hub3,esc1,link2,0.45` |
| `sectorHoldPlies` | Coverage must persist K consecutive plies before a sector win | `0` (instant) | `hold10` |
| `contestedCellsNeutral` | Cells in *both* nets count for neither side’s coverage | `false` | `neutral` |
| `sectorActivationPly` | Sector clock disarmed until this ply (no wins, no hold accrual) | `0` | `act80` / `activation100` |
| Spool | Infiltrator two-turn warp (`hybrid-spool`) | off on hybrid | `hybrid-spool:…` |

Config ids encode nonzero experimental knobs, e.g.
`hybrid_hub3_esc1_link2_sec0.45_hold1_neutral_act80`.

---

## 4. Campaign chronology (2026-07-21)

Unless noted, budget was `seed=42`, `jobs=14`, `fairness-games=24`,
`fairness-mcts=30`, `max-plies=240` (120 before `--max-plies` existed).

### 4.1 Baseline: pure geometry

| Result | Artifact |
| --- | --- |
| Hybrid & spool both ~88–90% sector → Track A reject (hyper-territorial) | `evolve-20260721-hybrid-fair.jsonl`, `…-spool-fair.jsonl` |
| Track B accepts ρ0.45 (fair, but weak skill sep ~2.4 under territory race) | `…-trackB-hybrid.jsonl` |
| Random Track A candidate sweep: all reject (cosmetic net or deadlock) | `…-trackA.jsonl` |
| Fixed link2 × ρ∈{0.51,0.6,0.7} matrix: bimodal cliff (sector ~0% or races) | `…-trackA-matrix.jsonl`, `…-rho-focus.jsonl` |

**Lesson:** `link1` starves the net; `link2` + ρ0.45 auto-paints. There is no
smooth ρ dial between “hyper-territorial” and “cosmetic” under legacy rules.

### 4.2 Integration Hold (`sectorHoldPlies`)

| Cell | Outcome |
| --- | --- |
| hold4 @ ρ0.45 | Sector 56%, clock✗ (Δ=−35) |
| hold8 / hold10 / hold12 @ maxPlies=120 | Truncation “deadlocks”; near-misses |
| hold8 @ maxPlies=240 | Sector 50%, clock✗ |
| hold10 @ 24 games | Appeared OK (thin samples) |
| hold10 @ **48 games confirm** | Sector **27%**, skill excellent, **clock✗** (Δ=−12, n_sec=12) |

Artifacts: `…-hold-matrix.jsonl`, `…-hold-long.jsonl`, `…-hold10-confirm.jsonl`.

**Lesson:** Hold fixes *frequency* of sector wins but not *timing*. Territory is
still established early; hold only delays declaring the win.

### 4.3 Contested Space (`contestedCellsNeutral`)

| Cell | Outcome |
| --- | --- |
| neutral, hold0 | Sector 42%, clock✗ badly (Δ=−58) — earlier paint |
| neutral + hold4/8 | Sector collapses to cosmetic / 0% |
| neutral + hold1 (**unpaired** seeds) | Misleading OK at 50% with clock✓ |
| same matrix **paired** | hold1: 50% hyper-territorial (clock✓); hold2: 17% OK but Δ=−15 thin; hold3: cosmetic |

Artifacts: `…-neutral-matrix.jsonl`, `…-neutral-hold123.jsonl`,
`…-neutral-hold123-paired.jsonl`.

**Lesson:** Neutral + short hold creates a real bridge, but ρ0.45 / hold1 sits
just above Track A’s 45% sector ceiling.

### 4.4 Integer coverage cliff

Non-well cells = 120. Required coverage = ⌈ρ × 120⌉.

| ρ | Cells | Sector share (hold1 + neutral) |
| --- | ---: | --- |
| 0.45 | 54 | **50%**, clock✓ |
| 0.455 | 55 | **13%**, cosmetic |
| 0.46 | 56 | **13%**, cosmetic |
| 0.47 | 57 | **9%**, cosmetic |
| ≥0.51 | ≥62 | ~0% |

Artifacts: `…-neutral-hold1-rho.jsonl`, `…-neutral-threshold55-56.jsonl`.

**Lesson:** There is **no integer threshold** between 50% and 13% sector share.
Static geometry alone cannot hit Track A’s band on this board.

### 4.5 Late-game activation (`sectorActivationPly`)

Base geometry held fixed: `hub3,esc1,link2,0.45,hold1,neutral` (the proven
clock✓ cell that was only 5 points over the sector ceiling).

| Cell | Sector | Clock | Skill | Deadlock | Notes |
| --- | ---: | --- | --- | ---: | --- |
| act80 | **25%** | ? Δ≈−3 (n_sec=6) | sep 9.6 | 0% | Sweet band; best composite |
| act100 | 27% | ? Δ≈−4 (n_sec=6) | sep 10.6 | 8% | Longer, weaker midgame |
| act120 | 17% | ? Δ≈−3 (n_sec=4) | sep 10.6 | 0% | Hub-heavy |

Artifact: `…-activation-matrix.jsonl`.

**Lesson:** Activation cuts the early territorial wins that inflated the 50%
rate. Hub and sector now finish nearly together (Δ≈0) rather than inverted.

### 4.6 The counterfactual — clock works, metric was wrong

The 48-game act80 confirm still failed `medSec > medHub` (Δ=−7, n_sec=10). So
we falsified the design directly: same cell vs a sector-disabled twin
(ρ=1.0, unreachable), paired seeds, 48 games each
(`…-act80-confirm.jsonl`, `…-act80-counterfactual.jsonl`).

| Metric | act80 (clock on) | clock off |
| --- | ---: | ---: |
| Deadlock rate | **2.1%** | **16.7%** (8×) |
| Avg plies | 115 | 153 (+33%) |
| Median hub capture | 108 | 125.5 |
| Interesting midgame | 0.44 | 0.17 |
| Fairness | 0.60 | 0.60 |

Removing the sector threat degraded everything except fairness — and hub
captures got *slower*. Sector pressure cashes out as **faster hub captures**,
so it can never dominate the late-ply medians. The timing signature confounded
win type with match evenness.

**Decision (ADR 005):** Track A drops the `medSec > medHub` hard reject. The
clock is validated functionally via `yarn evolve -- --counterfactual`, which
evaluates a paired sector-disabled twin per cell and requires deadlock +10pp or
length +20% degradation (`clock function ✓`). With that gate, **act80 passes
Track A** and is the v1.0-fleet human-gate candidate.

### 4.7 Activation parity — the rules contained a color tiebreak

Paired-color reporting revealed a large color split that aggregate `fair`
scores had obscured. Inspection found a deterministic cause: if both fleets had
completed Integration Hold when the clock armed, the engine awarded the win to
the mover. Because White owns odd plies and Black owns even plies, `act80`
implicitly favored Black while `act79` and `act81` favored White.

**Decision (ADR 006):** simultaneous sector holds no longer award either fleet
the win. The tie persists until only one fleet maintains integration. This
removes activation parity as a color rule and creates a real counterplay window.

The post-fix production run then separated two effects:

- overall result: White 10 wins (22%), Black 36 (78%);
- Sector Integration: White 4, Black 3 — no activation-color signal;
- Hub capture: White 6, Black 33 — the dominant seat imbalance.

A 48-game heuristic-only control reproduced White 21% / Black 79% with every
decision by Hub capture. Random-play probes were less extreme but still gave
White about 35% under both fleet and classic rules. Therefore the remaining
problem predates the sector clock: moving first is structurally disadvantaged,
and current policies amplify it.

The investigation also found that MCTS selected opponent nodes as if the
opponent maximized the root player's reward. That cooperative-tree bug is now
adversarially corrected and unit-tested, but it cannot explain the heuristic
and random controls.

### 4.8 Initiative Relay — visible first-player compensation

Instead of invisible score bonuses or seat randomization, White receives
`firstPlayerRelayCount` extra Escorts at setup. One forward relay at `(5,3)`
is linked through the opening central Escort.

| Agent family | Baseline White WR | + relay1 White WR |
| --- | ---: | ---: |
| Heuristic (200 games) | 17% | **40%** (fair=0.80) |
| Random (200 games) | 41% | 59% |
| Corrected MCTS@10 (48) | 29% | **51%** |

Two relays overshoot (heuristic 67%). With `act80`, relay1 pushed sector share
to 47% (just over Track A's hard cap). Retuning activation to **act100** kept
the seat fix and brought sector share back into band.

**Production confirm (`…-initiative-relay-production-confirm.jsonl`):**
`hub3/esc1/link2/ρ0.45/hold1/neutral/act100/relay1` → White 45% / Black 55%,
sector 30%, sep 13.3, composite 0.755, Track A **OK**. Soft-ship as
`FLEET_V1_RULES`; do not replace shipping `HYBRID_RULES` without playtest.

### 4.9 TEI anchors (UI strengths → rated opponent)

Local AI Fast / Normal / Strong update humans in Firestore **`latticeTei`**
(Lattice-only pool on `warp-12`). Anchors were **Lattice-calibrated** on
2026-07-21 under `hybrid-fleet` (`yarn calibrate:ai`,
`docs/sim-runs/evolve-20260721-ai-tier-calibration.jsonl`):

| UI strength | Search budget | Officer track | $(\mu,\sigma)$ | Anchor TEI |
| --- | --- | --- | --- | --- |
| Fast | Heuristic | Ensign | 13.5 / 4.0 | **P0** |
| Normal | MCTS 50 | Lieutenant | 24.5 / 3.5 | **I10** |
| Strong | MCTS 200 | Commander | 40.0 / 3.0 | **I52** |

Self-play order Strong ≻ Normal ≻ Fast passed (100% adjacent pairs) with
large ordinal gaps (~15 / ~12). Combined win rates: Strong beat Normal
14–2, Normal beat Fast 13–3, Strong swept Fast 16–0. Re-run
`yarn calibrate:ai` after changing MCTS budgets, eval, or shipping rules.

---

## 5. Current status

| Track | Soft-ship / candidate | Status |
| --- | --- | --- |
| **B** | `hub3/esc1/link2/ρ0.45` (legacy hybrid) | Soft-ship OK for internal territorial play; weak skill sep under territory race |
| **A** | `hub3/esc1/link2/ρ0.45/hold1/neutral/act100/relay1` | **Passes Track A** at production budget; soft-ship `FLEET_V1_RULES`; human playtest before shipping default |
| Spool | `hybrid-spool` | Benched — improves fairness slightly, craters infiltrator lethality without fixing win-path |

Clock-function verification for any future candidate:

```bash
yarn evolve -- --track A --ai-trials 0 --jobs 14 \
  --fairness-games 48 --skill-games 16 --fairness-mcts 30 \
  --max-plies 240 --counterfactual \
  --fixed "hub3,esc1,link2,0.45,hold1,neutral,act80" \
  --out docs/sim-runs/evolve-$(bdate -s '%Y%m%d')-<name>.jsonl
```

Promotion still means: human edit of `HYBRID_RULES` → update `docs/rules.tex`
→ `yarn build:rules` → re-baseline puzzles/ladder (ADR 002).

---

## 6. How to read a console line

```text
OK/REJECT  <configId>  composite=… fair=… cal=… sep=… σ=… mid=…
           avgPlies=… hub=% sec=% clock✓|✗|? medHub=… medSec=… Δ=…
           (n_hub=… n_sec=…) infilCap/g=…
```

- `clock✓` — both paths ≥8 samples and medSec > medHub.
- `clock✗` — both paths ≥8 samples and medSec ≤ medHub (hard reject on Track A).
- `clock?` — too few samples on one path; soft signal only.
- `Δ` — medSec − medHub (positive = sector later = desired clock).

---

## 7. CLI cheat sheet

```bash
# Dual-track random search
yarn evolve -- --track A --candidates 8 --jobs 14 …

# Exact cells (paired seeds)
yarn evolve -- --track A --fixed "hub3,esc1,link2,0.45,hold1,neutral,act80" …

# Semicolon lists or repeatable --fixed
yarn evolve -- --fixed "a;b;c" …
yarn evolve -- --fixed a --fixed b …

# Budget knobs
--fairness-games N --skill-games N --fairness-mcts N --max-plies N --jobs N --ai-trials 0

# Functional clock test (ADR 005): paired sector-disabled twin per cell
--counterfactual
```

Do **not** wrap evolve in `sudo`. Prefer plain `yarn evolve` (or your `fast`
alias) so output JSONL stays user-owned. `nice -n 19` is *lowest* priority —
omit it when you want the machine to prioritize the run.

---

## 8. Artifact index (2026-07-21)

| File | Role |
| --- | --- |
| `evolve-20260721-hybrid-fair.jsonl` | Baseline hybrid fairness |
| `evolve-20260721-spool-fair.jsonl` | Spool A/B |
| `evolve-20260721-trackA.jsonl` | Random Track A sweep |
| `evolve-20260721-trackB-hybrid.jsonl` | Track B soft-ship |
| `evolve-20260721-trackA-matrix.jsonl` | Fixed ρ bridge attempt |
| `evolve-20260721-rho-focus.jsonl` | ρ focus |
| `evolve-20260721-hold-matrix.jsonl` | Hold @ maxPlies=120 |
| `evolve-20260721-hold-long.jsonl` | Hold @ maxPlies=240 |
| `evolve-20260721-hold10-confirm.jsonl` | Hold10 rejected on clock |
| `evolve-20260721-neutral-matrix.jsonl` | Contested Space screen |
| `evolve-20260721-neutral-hold123.jsonl` | hold1–3 (unpaired seeds) |
| `evolve-20260721-neutral-hold123-paired.jsonl` | hold1–3 (paired seeds) |
| `evolve-20260721-neutral-hold1-rho.jsonl` | ρ 0.47/0.49/0.51 |
| `evolve-20260721-neutral-threshold55-56.jsonl` | 55–56 cell cliff |
| `evolve-20260721-activation-matrix.jsonl` | act80/100/120 survivors |
| `evolve-20260721-act80-confirm.jsonl` | act80 @48 games (failed legacy clock gate) |
| `evolve-20260721-act80-counterfactual.jsonl` | Clock ablation — headline result (ADR 005) |
| `evolve-20260721-act80-color-neutral-confirm.jsonl` | Post-ADR-006 production run; sector parity fixed, Hub-capture seat imbalance remains |
| `evolve-20260721-act80-heuristic-parity.jsonl` | Heuristic control reproducing the second-player advantage |
| `evolve-20260721-initiative-relay-count-screen.jsonl` | relay0/1/2 heuristic dose response |
| `evolve-20260721-initiative-relay-forward-screen.jsonl` | relay1 at (5,3) hits fair=0.80 under heuristic |
| `evolve-20260721-initiative-relay-random-screen.jsonl` | Random-agent control (no stomp) |
| `evolve-20260721-initiative-relay-mcts10-screen.jsonl` | Corrected MCTS@10: 29%→51% with relay1 |
| `evolve-20260721-initiative-relay-clock-screen.jsonl` | act100 + relay1 wins narrow retune |
| `evolve-20260721-initiative-relay-production-confirm.jsonl` | Production confirm — Track A OK |

---

## 9. Methodology principles we learned the hard way

1. **Random sampling misses cliffs.** Prefer `--fixed` matrices once a
   structural hypothesis exists.
2. **Paired seeds or you are not comparing rules.** Unpaired indices confounded
   the first hold1–3 “OK” call.
3. **Thin sector samples lie.** Confirm any `clock?` survivor at ≥48 fairness
   games before soft-shipping.
4. **Truncation ≠ interesting late game.** Raise `--max-plies` when adding hold
   or activation, or “deadlocks” are just the ply cap.
5. **Integer geometry has no continuum.** Board size 11 ⇒ 120 controllable
   cells; ρ only moves in discrete cell steps.
6. **Persistence delays declaration; activation filters earliness.** Hold alone
   could not invent a late clock. Activation + contested + short hold is the
   first combination that lands in Track A’s sector band with strong skill.
7. **Validate mechanics by ablation, not by folklore metrics.** The clock's
   real job (deadlock prevention) was invisible in win-time medians because
   its wins cash out through the *other* win column. When a gate rejects every
   otherwise-healthy candidate, counterfactual the mechanic before trusting
   the gate (ADR 005).
8. **Turn parity is part of the rules.** Any threshold checked on a numbered
   ply must define simultaneous outcomes explicitly. Paired agents cannot
   correct a mover-favored tiebreak in the engine (ADR 006).
9. **Separate win-path parity from seat parity.** A nearly even 4–3 sector split
   did not make the game fair because Hub captures split 6–33. Diagnose by
   winner × path and by multiple agent families before changing the clock.
10. **Prefer visible seat compensation over hidden komi.** One forward Escort
    (Initiative Relay) moved White from ~20–30% to ~45–52% across heuristic and
    MCTS screens without inventing invisible score rules. Dose carefully: two
    relays overshoot.
