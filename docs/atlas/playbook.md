# Atlas — Playbook (bootstrap)

**Provisional theory** for Subspace Lattice while the human corpus is still thin.
This is how Chess opening books started too: **strong-play frequencies and
failure modes first**, human taste later.

| Voice | Meaning |
| --- | --- |
| **Sim-provisional** | Supported by MCTS / observe / goldens — may shift when humans arrive |
| **Canary** | True of a weak agent (e.g. equal heuristics) — not population theory |
| **Normative** | Rules / engine — not strategy |

Do **not** cite equal-heuristic mirrors as playbook. Prefer **MvR / MvH / MvM**
(and Deep when honest). Every entry needs: ruleset, agents, n, date, artifact.

Companion: [Lattice Atlas](../lattice-atlas) · [Win paths](./win-paths) ·
[Classical readiness](../classical-readiness) · [Content factory](../content-factory)

---

## Three volumes (classical names)

| Volume | Lattice name | What goes in it | How we mine it |
| --- | --- | --- | --- |
| **I. Opening** | First development | Named lines + reply trees (ply 0–8+) | `atlas:observe` → `atlas:book` |
| **II. Middlegame** | Plans / conflicts | Strike vs Sector vs Overload vs Contested net | Themes from autopsy + mid-band movers |
| **III. Endgame** | Technique / closers | Thin fleets, TO, Lockout, Integration Hold finish | Goldens + late-band + finish mix |

Call volume III **Endgame** (or **Technique**), not “closers” — same job as Chess
endgame manuals: forced plans when little material / clock / Overload remains.

---

## Bootstrap factory (no humans required)

```text
yarn atlas:observe / strength-bar / goldens
        ↓
yarn atlas:diff  (or autopsy scripts)
        ↓
Atlas fact row (what happened)
        ↓
Playbook theme (plan + fail mode)   ← this file
        ↓
Drill / puzzle seed (content-factory)
```

**Promotion rule:** a theme graduates from “lab note” → playbook only when it
reproduces under **search** agents (MCTS@≥40), not only under heuristic spam.

**Demotion rule:** when humans later contradict a theme, mark it
`human-revised` — do not silently delete; keep the sim provenance.

---

## Epistemic stack

1. **Geometry & legality** — census (`yarn atlas:census`)
2. **Population paths** — observe path mix under MCTS (hub / sector / lockout)
3. **Tactical themes** — recurring win/loss signatures (Hub wander, EMP cadence)
4. **Opening tree** — top plies by visit / play rate under MCTS (todo)
5. **Endgame technique** — Terminal goldens (partially done)
6. **Human overlay** — later; veto and rename, don’t bootstrap-block

---

## Themes in hand (2026-08-01)

### 1. Hub wandering (sim-provisional)

**Claim:** Midgame Command Hub walks (non-Terminal) reset EMP charge and walk
into Surgical Strike. Search that rewards Hub approach without a Hub penalty
loses to a heuristic that keeps the Hub still.

**Evidence:**

- MCTS@200 vs heuristic, seed 31, n=4 (`observe-M200vH-s31-deepish.jsonl`):
  White Hub ~60% of White plies in the hub-mate game; Black Hub ~3%; loss by
  Hub×Hub capture. Other games: EMP Lockout / trunc with the same Hub-heavy
  White profile.
- HeuristicAi already scored midgame Hub moves **−15** and non-Hub while
  charging **+8**; MCTS `cheapScoreMove` did not — fixed 2026-08-01
  (Hub **−25**, no midgame Hub approach credit).

**Playbook:**

- **Do:** Hold Hub ground while charging Overload; hunt with Escorts /
  Infiltrators / Beams.
- **Don’t:** “Close distance” with the Hub before Terminal Overclock or a
  forced capture.
- **Tell:** If your Hub is the most-moved piece midgame, you are probably
  losing the charge race and the Strike race.

**Next measure:** re-run seed 31 after Hub-prior fix
(`observe-M200vH-s31-hubprior.jsonl`).

**Result (2026-08-01):** score **0–3–1 → 1–2–1** (MCTS won one EMP Lockout).
White Hub share dropped in most games (e.g. trunc game **31% → 6%**; hub-loss
game **61% → 31%**). One game still Hub-heavy (50%) and lost on Lockout; still
one hub-capture loss (Escort Strike, not Hub×Hub). Prior helps; does not clear
the yardstick. Keep the prior; next integrity check is a short `@200` strength
bar, not more Hub-constant tuning.

### 2. Soft-EMP canary (canary — not theory)

**Claim:** Equal heuristics soft-EMP shuffle (high EMP/game, ~95% trunc). After
soft-EMP score damp: EMP/game **23 → 5.4**, trunc **95% → 80%**, still
**0 hub / 0 sector**.

**Playbook use:** Regression canary for the leaf only. **Not** a model of good
play. Population path mix comes from MvR/MvH (sector band appears there).

### 3. Three finishes under search (sim-provisional)

**Claim:** Under MCTS, all three fiction wins appear; sector can sit in the
playtest band (~25–40%).

| Matchup | Hub | Sector | Lockout | Trunc | Source |
| --- | ---: | ---: | ---: | ---: | --- |
| MvR @40 | 65% | **35%** | 0% | 0% | observe-MvR-s13 |
| MvH @40 | 31% | **38%** | 25% | 6% | observe-MvH-s11 |
| MvM @40 | 8% | 17% | 25% | 50% | observe-MvM-s12 |

**Playbook:**

- Strike remains the plurality plan vs weak opposition.
- Sector is a real second plan once nets stabilize past activation — teach
  Integration Hold, don’t treat the clock as flavor.
- Lockout is uncommon but legal; charge + blast geometry matter (see Terminal
  goldens).

### 4. Overload timing (sim-provisional / partial)

**Claim:** Immediate Lockout EMP is decisive (+50k heuristic / eval in-one).
Charged soft EMP is a tactic when freeze geometry is real — not a default
shuffle.

**Playbook:**

- **Fire** when Lockout-in-one (or near-total freeze) is on the board.
- **Hold charge** rather than specious one-ship ticks that reset the race.
- **Defend** so you never leave Lockout-in-one to the opponent (tactical
  filter + eval threat).

Technique pages: [Clocks & Terminal](./clocks) · Terminal goldens in core.

---

## Volume I — Opening

### How to read `atlas:book` output

| Block | Do this |
| --- | --- |
| **Opening ply-0** | If ≥90% one mover across corpora → name a family |
| **Top opening lines** | Promote lines with n≥3; treat n=1 as noise |
| **Middlegame movers** | Feed Volume II (plan feel), not opening names |
| **Endgame / finish mix** | Feed Volume III + [win paths](./win-paths) — high trunc means “don’t overclaim” |

### Infiltrator Overture (`sim-provisional`)

**Claim:** Under MCTS, White’s first move is an **Infiltrator** in essentially
every game sampled; Black answers Infiltrator; the first four plies are usually
an Infiltrator duel. White’s 5th ply often introduces **Beam** (or keeps
Infiltrator / brings Escort).

**Evidence (mover-only observe):**

| Corpus | n | Ply-0 | Top depth-6 line (share) |
| --- | ---: | --- | --- |
| MvM s12 | 12 | 100% W:I | `I–I–I–I–Beam–Escort` 25% |
| MvH s11 | 16 | 100% W:I | `I–I–I–I–Beam–Beam` / `I–I–I–Beam–I–I` 25% each |
| MvR s13 | 20 | 100% W:I | `I–I–I–I–I–I` 40% |

**Evidence (Deep-leaf ply-0 map, 2026-08-01):** every legal White open scored with
its own Deep-shaped MCTS@800 (`opening-rate-deep-leaf-d1-s800.json`, n=183).

| Rank | deep | Move |
| ---: | ---: | --- |
| 1 | −0.040 | **Infiltrator (7,0) → (5,4)** |
| 2 | −0.046 | Infiltrator (7,0) → (3,3) |
| 3 | −0.051 | Infiltrator (7,0) → (4,2) |
| 4 | −0.053 | Infiltrator (3,0) → (4,2) |
| 10 | −0.059 | Escort (5,3) → (6,3) (first non-I in top 10) |

Top-40 band is **32 Infiltrator / 5 Escort / 3 Beam**. Hub opens rank near the
bottom of the useful band. All deep values slightly negative (second-player
pressure in the leaf) — rank order matters more than sign.

**Evidence (Deep-leaf ply-1 replies, 2026-08-02):** top-12 White opens × all
Black legal @400, keep top-12 (`opening-rate-deep-leaf-d2-s800.json`).

Principal **I (7,0)→(5,4)** — Black elite band (spread ≈0.01):

| Rank | deep | Move |
| ---: | ---: | --- |
| 1 | −0.211 | Beam (2,10) → (2,9) |
| 2 | −0.216 | **Infiltrator (7,10) → (6,7)** (best I) |
| 3–9 | ≈−0.22 | mostly Infiltrator hops |
| 11–12 | ≈−0.22 | Beam continues |

Across the 12 White opens, best Black reply mover is **I×6 / Escort×3 / Beam×3** —
not a forced Infiltrator answer. Observe’s I–I practice is the MCTS root prior;
Deep-leaf says the reply **band** is nearly tied and sometimes prefers Beam or
Escort by a hair.

**Trap:** White **I (7,0)→(4,6)** (#11 ply-0) allows Black **I →(4,6)** capture
(deep −0.105) — demote; do not treat as a sound try.

**Practice vs theory (MvM@40, n=80, `observe-MvM-open-s41-n80-book.json`):**

| Share | Practice ply-0 (left I) |
| ---: | --- |
| 15% | → **(5,2)** |
| 13.8% | → **(6,4)** |
| 12.5% | → (4,2) / **(5,4)** / (6,3) / (3,3) |

Six-way central band — no single practice ECO. By **square** (any wing),
**(5,2)** 12 · **(5,4)** 11 · **(6,4)** 11 lead. Right-I opens are rare in
practice (2/80) despite Deep-leaf ranking them #1.

**Named depth-2 practice pairs** (n≥3):

| n | Line |
| ---: | --- |
| 4 | left I→(6,4) · Black I→(3,7) |
| 3 | left I→(6,3) · Black I→(4,8) |
| 3 | left I→(5,4) · Black I→(6,8) |
| 3 | left I→(4,2) · Black I→(5,7) |
| 3 | left I→(5,2) · Black I→(5,7) |

Depth ≥4 has **zero** repeats at n=80 — full ECO codes need either much larger
n or higher-sims practice (sharper priors). Finish: 64% sector / 32% trunc /
2.5% hub / 1 lockout.

**Playbook:**

- **Principal try:** right-wing Infiltrator into **(5,4)** (central hop).
- **Principal reply:** Infiltrator into **(6,7)** is the knight-war main line;
  Beam (2,9) / Escort (5,8) are live equals in the Deep-leaf band — teach as
  alternatives, not refutations.
- **Expect** knight-war tempo; Hub walks are not opening theory.
- **Don’t** hang on (4,6); don’t treat static-eval leaders alone.

**Next measure:** stop burning MvM@40 for depth-8 ECO (branching kills repeats).
Treat Volume I as **sim-provisional** with Deep-leaf theory + practice pairs
above. Clear the strength-bar trunc gate, or raise practice sims (MvM@200, n=40)
if you want sharper ply-0 collapse.
---

## Opening book (bootstrap queue)

```bash
# Done: n=80 coordinate practice
# yarn atlas:observe --games 80 --seed 41 --white mcts --black mcts --sims 40 \
#   --out docs/atlas/runs/observe-MvM-open-s41-n80.jsonl
# yarn atlas:book --in …n80.jsonl --depth 8 --top 20 --out …n80-book.json

# Optional sharper practice (expensive):
bgpucap yarn atlas:observe --games 40 --seed 41 --white mcts --black mcts --sims 200 \
  --out docs/atlas/runs/observe-MvM-open-s41-m200.jsonl
```

Mover-only drafts already mined: `observe-MvM-s12-book.json`, etc.

---

## Wishlist (sim-first)

- [x] `yarn atlas:book` miner (openings + phase bands)
- [x] Named family: Infiltrator Overture (mover-type)
- [x] Deep-leaf ply-0 + ply-1 square map (principal I→5,4 / reply band)
- [x] Opening visit tree under MCTS@40 with **coordinates** (n=80; left-I six-way band)
- [x] Named depth-2 practice pairs (n≥3) — depth≥4 ECO blocked by branching
- [ ] Optional: MvM@200 practice for sharper ply-0 collapse
- [ ] Theme: Contested-net stall — need coverage fields on ply events
- [ ] Theme: Relay value (counterfactual Relay on/off observe)
- [ ] Auto-extract “tip vs played” from annotate CLI into playbook stubs
- [ ] Drill links from each theme → `/drills` / `/puzzles` ids

---

## How to add a theme

1. Run or cite an observe/ladder artifact under **search** agents.
2. Write **Claim / Evidence / Playbook / Next measure** (copy a section above).
3. Mark voice: `sim-provisional` | `canary` | `human-revised`.
4. Optionally add a drill seed in [content-factory](../content-factory).
