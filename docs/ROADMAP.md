# Subspace Lattice Roadmap

Goal: a **complete hybrid game**, a **strong AI**, and a **simulation loop** that can evolve both rules and AI toward a better game.

Invariant: every rules change is a versioned `RulesConfig`. Online play, local AI, and sims all call the same `@subspace-lattice/core` engine.

---

## Phase 0 — Simulation substrate

Measurable lab against current **classic** rules. Do this before finishing Sensor Net or MCTS.

- [x] **0.1** Add `RulesConfig` + `rulesVersion` (`classic` default; stub `hybrid` equal to classic for now)
- [x] **0.2** Persist `rulesVersion` on `GameState`; engine constructor / `fromState` respect it
- [x] **0.3** Fast `clone()` (or guaranteed clone-before-branch) for search and sims
- [x] **0.4** Seeded / deterministic RNG utilities shared by agents and match runner
- [x] **0.5** Pluggable `Agent` interface (`chooseMove(state, …)`)
- [x] **0.6** `RandomLegalAgent` baseline
- [x] **0.7** Wrap existing `HeuristicAi` as an `Agent`
- [x] **0.8** Match runner: play A vs B to terminal; emit winner, length, basic stats, replay
- [x] **0.9** Ladder / Elo harness: random → heuristic (and later MCTS@N); report win rates
- [x] **0.10** Puzzle format + suite (hub mate-in-1, hanging hub, forced recapture)
- [x] **0.11** CLI or Nx target to run sims / ladders (`core:sim` or similar)
- [x] **0.12** Unit tests for match runner, agents, puzzles

---

## Phase 1 — Complete hybrid rules (`rulesVersion: hybrid`)

Implement README design; keep `classic` for A/B and regression.

- [x] **1.1** Spec ADR: Sensor Net link radius, sovereign space, detection, piece movement under net
- [x] **1.2** Wire `calculateSensorNet` (or enclosure logic) into legal moves
- [x] **1.3** Escort: relay / expand net per spec
- [x] **1.4** Beam: move only within own Sensor Net
- [x] **1.5** Infiltrator: warp / move rules vs enemy net (perfect-info first)
- [x] **1.6** Detection: enemy in sovereign space loses specials / limited mobility
- [x] **1.7** Win: Sector Integration (≥51% coordinates) in addition to hub capture
- [x] **1.8** Gravity wells: confirm blockers-only vs geometry modifiers
- [x] **1.9** Rules tests + puzzles for net, detection, 51%
- [x] **1.10** UI RulesDialog + sovereign overlay match engine
- [x] **1.11** Functions/rooms store and enforce `rulesVersion`

---

## Phase 2 — Strong AI (perfect information)

- [x] **2.1** Position eval features aligned to hybrid (hub safety, net size, mobility, 51% progress)
- [x] **2.2** MCTS (UCT): expand legal moves, rollouts, time/sim budget, seedable
- [x] **2.3** Optional shallow minimax for tactical hub mates
- [x] **2.4** Strength ladder: include MCTS@N budgets; re-baseline Elo after hybrid lands
- [x] **2.5** Local play: AI strength slider = search budget
- [x] **2.6** Wire same agents into sim harness (no duplicate AI paths)

---

## Phase 3 — Evolution loop (better game + better AI)

- [x] **3.1** Define scorecard metrics (decisiveness, first-move fairness, skill discrimination, interesting midgames)
- [x] **3.2** Parameterize evolvable knobs in `RulesConfig` (hub/escort radius, link distance, sector ratio; board size fixed at 11)
- [x] **3.3** Batch sims: sample configs × agent pairs → scorecard
- [x] **3.4** Selection: keep Pareto-good configs; reject broken (instant wins, deadlocks)
- [x] **3.5** Human gate before promoting a new default `rulesVersion`
- [x] **3.6** Evolve AI hyperparameters separately against a frozen rules version
- [x] **3.7** Persist sim outputs (JSONL / replays) for analysis

---

## Phase 4 — Product completeness

- [x] **4.1** Online: `rulesVersion` on room create; clients show matching rules
- [x] **4.2** Modes: local AI + online PvP (async deferred)
- [x] **4.3** Desktop / web parity for AI and overlays
- [x] **4.4** E2E: local AI path
- [ ] **4.5** (Later) Imperfect info / fog / cloak → **ISMCTS** only if information sets exist

---

## Order (do not invert)

1. Phase 0 — lab  
2. Phase 1 — full rules  
3. Phase 2 — MCTS + eval  
4. Phase 3 — evolution  
5. Phase 4 / ISMCTS as needed  

---

## Status

| Phase | Status |
| ----- | ------ |
| 0 Simulation substrate | Done |
| 1 Hybrid rules | Done (see `docs/adr/001-hybrid-sensor-net.md`) |
| 2 Strong AI | Done (MCTS + eval; Fast/Normal/Strong local slider) |
| 3 Evolution | Done (`yarn evolve`; human gate — see ADR 002) |
| 4 Product | Mostly done (ISMCTS / async / online e2e deferred) |

---

## Phase 5 — Stabilize the player ruleset

The simulator has identified a promising fleet game, but the product must not
teach or promote it until color balance and its player-facing state are clear.
This phase is intentionally short and blocks only the mechanics-dependent
parts of the tutorial—not the tutorial shell or basic movement lessons.

- [x] **5.1 Fairness transparency.** Lead every scorecard with raw White and
      Black win rates; tighten the normal acceptance band to at least 40–60%
      (`fairness >= 0.80`).
- [x] **5.2 Color-safe harness.** Break outcomes down by winner × win path and
      run fairness games in color-swapped pairs using the same two agent RNG
      streams.
- [x] **5.3 Activation diagnosis.** Engine inspection found a deterministic
      parity bug: simultaneous holds were awarded to the mover, so even
      activation plies favored Black and odd plies favored White. Sector ties
      now remain unresolved until only one fleet maintains its hold (ADR 006).
- [x] **5.4 Post-fix seat diagnosis.** The corrected 48-game run still produced
      White 22% / Black 78%, but sector wins were 4–3 while Hub captures were
      6–33. Heuristic-only play reproduced 21–79, and random play showed the
      same weaker second-player edge in both fleet and classic rules. The
      remaining problem is first-seat disadvantage, not activation.
- [x] **5.4a First-player compensation.** Initiative Relay (`firstPlayerRelayCount`)
      gives White one additional Escort at `(5,3)`, linked through the opening
      formation. Screens: heuristic 17→40%, random stays ~40–60 either way,
      MCTS@10 29→51%. Two relays overshoot (67%).
- [x] **5.4b Fleet preset decision.** Production confirm of
      `hold1 / neutral / act100 / relay1` passed Track A (W 45% / B 55%,
      sector 30%, sep 13.3). Soft-ship as `FLEET_V1_RULES`; human playtest
      still required before replacing shipping `HYBRID_RULES`.
- [x] **5.5 Objective HUD.** In every hybrid game show both players’ Sensor Net
      coverage, Integration Hold, sector activation countdown, contested-space
      meaning, current turn, and immediate victory threats.
- [x] **5.6 Rules parity.** Keep the engine preset, Rules dialog, tutorial copy,
      player overview, and `rules.tex` synchronized. (Figures inlined in the
      official rules PDF; overview + Rules dialog match soft-ship hybrid-fleet.
      Introductory manual is separate from normative `rules.tex`.)

## Phase 6 — Interactive academy

Build a no-auth, restartable, deterministic simulated match against a scripted
opponent. Assume the player has never seen chess, Go, grid coordinates, or the
idea of alternating turns. Never require external game vocabulary to proceed.

### Product principles

- Teach one decision at a time, then let the player perform it.
- Explain *why* a move matters before naming the mechanic.
- Highlight selectable ships and legal destinations; explain invalid clicks in
  plain language.
- Script tutorial responses. Do not let MCTS make a lesson unwinnable.
- Use the real core engine for legality and outcomes—no tutorial-only copy of
  the rules.
- Each lesson supports Back, Restart, Skip, and replay after completion.
- Persist lesson progress locally; require no account or network.
- The final lesson becomes a forgiving AI game with contextual hints rather
  than a fixed solution.

### Lesson sequence

- [x] **6.1 Your first turn.** Board orientation, the two fleets, selecting a
      ship, highlighted destinations, moving, captures, alternating turns.
- [x] **6.2 Protect the Hub.** Command Hub movement, Surgical Strike, and why
      losing the Hub ends the battle.
- [x] **6.3 Build the signal.** Escorts, links, Sensor Net radiation, broken
      links, and Sovereign Space.
- [x] **6.4 Lock their systems.** Target Lock and its one-step orthogonal
      movement restriction.
- [x] **6.5 Fire through the net.** Beam movement, clear paths, friendly
      coverage requirement, pieces and Gravity Wells as blockers.
- [x] **6.6 Infiltrate the gaps.** Warp destinations, enemy-net exclusion,
      captures, and the difference between being free and Target Locked.
- [x] **6.7 Contest the lattice.** Overlapping nets, neutral contested cells,
      coverage percentages, and counterplay against integration.
- [x] **6.8 The sector clock.** Activation, Integration Hold, breaking a hold,
      Sector Integration victory, and no-legal-moves victory.
- [ ] **6.9 Command exercise.** A short guided battle combining every shipping
      mechanic against a deterministic opponent.
- [ ] **6.10 First live simulation.** A forgiving AI match with optional
      contextual hints, followed by clear routes to normal local AI and online
      play.

### Delivery slices

- [x] **6.A Foundation.** `/tutorial` route, lesson data model, scripted
      positions/opponent, tutorial controller, progress persistence.
- [x] **6.B Guidance UI.** Coach panel, objective HUD, board highlights,
      legal-move previews, invalid-action explanations, keyboard/accessibility
      semantics, roving grid focus, and arrow/Enter/Space controls.
- [ ] **6.C Core curriculum.** Lessons 6.1–6.6 have a first interactive pass;
      capture and broken-link recovery drills are live; blockers and free
      exploration remain before calling the curriculum complete.
- [ ] **6.D Fleet curriculum.** Lessons 6.7–6.8 are live; 6.9–6.10 remain.
- [ ] **6.E Graduation.** Guided battle, hinted AI match, splash-page CTA,
      completion state, analytics events that contain no game/account secrets.
- [ ] **6.F Verification.** Unit tests for lesson transitions and scripted
      responses; Playwright coverage for first move, restart, completion, and
      resuming saved progress.

### Definition of done

A new player can open `/tutorial`, complete the curriculum without signing in,
explain both victory paths and every ship’s role, finish a guided battle, and
start a normal match. Every demonstrated move is accepted by the production
engine, and the tutorial remains deterministic in CI.

### Phase 0–3 quick start

```bash
yarn nx test core
yarn sim -- --games 6 --mcts 40 --rules hybrid
yarn evolve -- --candidates 5 --seed 1 --out docs/sim-runs/evolve.jsonl
# Ladder report leads with TEI grades (E97), then Elo legacy
yarn build:rules
```

