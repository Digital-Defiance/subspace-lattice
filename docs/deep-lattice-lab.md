# Deep Lattice lab notebook

Engineering plan for making **Deep Lattice** strong as a **player** and as an
**explainer** (in-game advisor + LPGN annotate). Annotate quality follows the
same brain; PDF layout is secondary.

Product charter: [lattice.iwgf.org/deep-lattice](https://lattice.iwgf.org/deep-lattice) ·
Status log: [Deep Lattice](./deep-lattice) ·
[ADR 007](./adr/007-deep-lattice-neural.md) · [ROADMAP Phase 2b](./ROADMAP.md)

---

## Charter

| Role | Success looks like |
|------|--------------------|
| **Player** | Beats today’s Deep@800 on terminal goldens + local ladder / TEI sample |
| **Explainer** | Same agent tips annotate; contrastive “you vs tip” plans, not generic “closes distance” spam |
| **Hardware** | Leaf eval can batch on CPU first; Core ML (ANE) / WebGPU later — no ANE until there is a net |

One agent path for local AI, advisor, and annotate. No mute strong engine + chatty weak tipper.

---

## Why not “more sims”

Current Deep is heuristic MCTS. Extra simulations burn CPU and barely use the
M4 Max Neural Engine / GPU. Strength ceiling needs a **learned leaf value**
(± policy), then fewer smarter sims.

---

## Phases

### Phase A — Metrics & data spine (now)

1. Freeze a **strength bar**: terminal goldens + short Deep-vs-candidate ladder.
2. **Position encoder** (`encodePosition`) → fixed `Float32Array` (versioned).
3. Dataset sketch: self-play / evolve / LPGN → `(features, outcome | search_value)` JSONL.
4. Keep heuristic eval as fallback; neural is opt-in behind a flag.

### Phase B — Value net v0

1. Train a small MLP/CNN offline (Python or TS) on Phase A labels.
2. Export weights JSON (CPU matmul in core) for shippable baseline — no native deps yet.
3. Wire `evaluatePosition` path: `neural ?? heuristic`.
4. Retune Deep preset (sims ↓ if value is strong); human-gate like evolve (ADR 002).
5. Pass strength bar or iterate data/architecture.

**Status:** Phase B value net is live. Prefer GPU weights
`packages/subspace-lattice/src/lib/ai/weights/value-mlp-v5-gpu.json`
(trained on `dataset-q-combined-v6` = q + v3 + v5 + mcts-random). Hook via
`createMlpNeuralValue` + `setNeuralValueEvaluator`
(still opt-in; shipping Deep remains heuristic leaf until human gate).

**Note:** `dataset-q-v4.jsonl` is a byte-identical redo of v3 (same `--seed 42`).
Use v5 (`--seed 43`) for new games.

**Strength bar (2026-07-31):** candidates vs heuristic + random (skip mirrors).
`--deep-sims 40 --games 2` PASS (13% trunc). MLP leaf beat deepish-40 on that
sample (ordinal gap −2.70; vs-heur 75% vs 50%). Not a ship signal — need larger
bar + Deep@800. Calibration no longer assumes deepish > mlp.

**Deep@800 gate (2026-08-01, pre-filter):** FAIL (38% trunc + floor miss).
Deep@800 went **0–3 vs heuristic**, mostly `heuristic/no-moves`. Autopsy:
heuristic EMP Lockout (+50k); MCTS lacked opponent lockout-EMP reply filter.

**EMP Lockout reply filter (2026-08-01):** `moveLeavesEmpLockout` wired into
`moveIsTacticallyUnsafe` (heuristic + MCTS root). Ablation
`LATTICE_EMP_LOCKOUT_FILTER=0`.

**Strength bar (2026-08-01, post soft-EMP damp, v5 @40):** FAIL floor.
Trunc healthy (6%). Heuristic ordinal **14** above both candidates (~7) —
damp made the yardstick *finish games* (hub + Lockout) instead of soft-EMP
shuffle; @40 search looks weaker against that cleaner heuristic, not stronger.

**EMP Lockout-in-one + charged blast threat in eval** (same day): marginal MLP
nudge at @40; deepish Lockout skeleton unchanged.

**Strength bar @200 / maxPlies=400 / games=2 (2026-08-01, post Hub-prior):** floor
looked **OK** but trunc **38%** made it inconclusive.

**Strength bar @200 / maxPlies=600 / games=4 (2026-08-02):** trunc **fixed**
(2/32 = **6%**). Floor **MISS** hard — the longer bar unmasked heuristic wins:

| Agent | ordinal | vs heur | vs random |
| --- | ---: | --- | --- |
| heuristic | **18.77** | — | — |
| mcts-200-mlp | 11.09 | 2–4–2 (33%) | 8–0 |
| deepish-200 | 9.15 | 2–6 (25%) | 8–0 |
| random-legal | −10.38 | — | — |

Color skew: **heuristic as White** beat deepish **4–0** and mlp **3–0–1**.
Candidates as White only split or slight edge. Calibration 50%. MLP still
outranks deepish (−1.94) but both sit under the yardstick.

Do **not** treat the earlier floor-OK sample as real. Soft-EMP damp + longer
games made heuristic a much harder bar.

**Autopsy note (2026-08-02):** HvM200 observe abandoned — games finish as
`no-moves` EMP lockouts either way and don’t explain the bar. Strength-bar
damage was mostly **heuristic-White hub-capture** (3/4), not lockout rate.

**Hub defense leaf (2026-08-02):** `hangingPressure` now includes Command Hub;
added `enemyPressureOnHub` soft geometry.

**Strength bar @200 / maxPlies=600 / games=4 (post hub-defense leaf):**

| Agent | ordinal | vs heur | notes |
| --- | ---: | --- | --- |
| heuristic | 14.50 | — | was 18.77 |
| deepish-200 | **13.35** | **3–3–2 (50%)** | was 9.15 / 25% |
| mcts-200-mlp | 9.98 | 2–4–2 (33%) | still under yardstick |
| random-legal | −9.86 | — | 8–0 both candidates |

Trunc **13%** (OK). Heuristic-as-White vs deepish **2–2** (was **4–0**). Floor
still **MISS** only because `min(candidates)` is **mlp** — deepish nearly ties
heur (Δ −1.15). Keep the leaf fix. Do **not** chase another bar burn; MLP leaf
is a separate track (retrain / more data), not more Hub constants.

**Harness:** `yarn neural:strength-bar … --jobs N` and
`yarn dataset:jsonl … --jobs N` parallelize games across workers.

### Phase C — Policy + explainer

1. Policy head over legal moves (or move-type / from-to encoding).
2. MCTS uses policy prior at expand; annotate tip = same search.
3. **Contrastive coaching**: name plan delta (Escort screen vs Infiltrator tempo, EMP vs piece play, etc.) using phase tags + tip vs played.
4. Annotate / advisor share one `suggestAdvisorMove` / grade path.

### Phase D — Device acceleration

1. Core ML export for Tauri/CLI on Apple Silicon (ANE).
2. WebGPU or ONNX Runtime Web for browser when worth it.
3. Batch leaf eval in MCTS (collect N leaves → one forward).

---

## Encoder sketch (v1)

Fixed board **11×11**. Side-to-move relative (always encode “me = side to move”).

**Planes (binary / density):** per piece type × mine/theirs; sovereign / contested
net if cheap; EMP-disabled mask; gravity well; Hub positions.

**Scalars:** EMP charge / target (both); Terminal flags; sector clock % both;
material tally; ply index norm; can-fire-EMP.

`ENCODING_VERSION` bumps when layout changes; datasets tagged with version.

---

## Non-goals (this track)

- Replacing hybrid-fleet rules via neural play.
- Auto-promoting neural Deep without human gate + ladder evidence.
- Blocking annotate UX fixes on training — annotate uses whatever Deep is *today*.

---

## Immediate next commits

- [x] This plan + ADR 007
- [x] `encodePosition` + spec in `@subspace-lattice/core`
- [x] JSONL dump helper from match runner / LPGN replay (features + result)
- [x] Tiny CPU value stub proving the `evaluatePosition` hook (`neural ?? heuristic`)
- [x] Ladder script: heuristic-MCTS vs neural-stub (`yarn neural:stub-ladder`)

Commands:

```bash
# Decisive labels (default matchup = heuristic vs random, colors swapped)
yarn dataset:jsonl --games 40 --out docs/sim-runs/dataset.jsonl

# Mirror self-play (often truncates — fleets disengage; EMP can't finish)
yarn dataset:jsonl --games 40 --matchup mirror --out docs/sim-runs/mirror.jsonl

yarn neural:stub-ladder --sims 40 --games 2 --max-plies 400
yarn train:value --data docs/sim-runs/dataset.jsonl \
  --out packages/subspace-lattice/src/lib/ai/weights/value-mlp-v1.json
yarn neural:stub-ladder --weights packages/subspace-lattice/src/lib/ai/weights/value-mlp-v1.json \
  --sims 40 --games 2 --max-plies 400

# Search-value bootstrap (q) + blend train + strength bar
yarn dataset:jsonl --games 16 --label-sims 50 --jobs 10 --out docs/sim-runs/dataset-q.jsonl
yarn train:value --data docs/sim-runs/dataset-q.jsonl --target blend \
  --out packages/subspace-lattice/src/lib/ai/weights/value-mlp-v2.json
yarn neural:strength-bar --weights packages/subspace-lattice/src/lib/ai/weights/value-mlp-v4-gpu.json \
  --vs-deep --games 2 --jobs 12
# Deep@800 vs mlp@800 (equal budget) vs heuristic+random — M4 Max overnight-ish gate

# GPU train (Apple MPS) — this is what lights up the GPU
yarn train:value:gpu --data docs/sim-runs/dataset-q-combined.jsonl --target blend \
  --hidden 128,64 --batch 512 --epochs 80 \
  --out packages/subspace-lattice/src/lib/ai/weights/value-mlp-v3-gpu.json
```

Deleted `mirror.jsonl` — not useful for outcome training.

**Why mirror dumps were all `z=0`:** Heuristic omitted charged EMP unless a
soft freeze looked great — games sat at full charge forever. EMP is always a
candidate now, and Terminal Lockout still refuses suicide misses. Separately,
mirror fleets often reach **zero legal captures** (disengaged); midgame EMP is
only a 1-ply blackout, so it does not force trades. Terminal Overclock finishes
**hubs-only** endgames; getting there still needs captures. Prefer
`heuristic-random` (or LPGN) for outcome labels until the hunter AI improves.

---

## Open choices (decide at Phase B)

| Choice | Options |
|--------|---------|
| Train stack | Python (PyTorch) vs pure TS |
| Label | Game outcome vs Deep search value bootstrap |
| Policy target | Full move set vs piece-type + destination heat |
| Ship format | Weight JSON → Core ML / ONNX |

Default lean: **PyTorch MPS/CUDA train** (`yarn train:value:gpu`) + JSON weights
loaded by portable CPU matmul in core; bootstrap labels from Deep/MCTS search
values. Pure-TS `yarn train:value` remains for CI without Python.

**Hardware today:** training can use Apple GPU (MPS). MCTS self-play labeling
and in-game leaf eval are still CPU until Phase D (Core ML / WebGPU batch).
