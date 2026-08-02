# ADR 007: Deep Lattice neural leaf eval

## Status

Proposed (Phase 2b — Strong AI continuation)

## Context

Deep Lattice today is UCT MCTS with hand-written `evaluatePosition` and
heuristic-guided rollouts (`AI_STRENGTH_PRESETS.deep` ≈ 800 sims). That path:

- Hits diminishing returns on skill as sims increase.
- Burns CPU wall-clock (annotate Deep ≈ 20+ min on a long game).
- Cannot use Apple Neural Engine / GPU — there is no tensor model.
- Powers both **play** (local AI) and **explain** (advisor / LPGN annotate).
  Explainer quality is capped by the same weak leaf eval and generic reason strings.

Product intent: Deep Lattice must get **stronger as a player** and **clearer as
an explainer**, with annotate consuming the same agent — not a parallel coach.

## Decision

1. Add a **versioned position encoder** and a pluggable **value** (± later
   **policy**) evaluation path beside the heuristic.
2. Train offline; ship inference first as portable CPU weights; accelerate with
   Core ML / WebGPU only after a model beats heuristic Deep on the strength bar.
3. **One agent** for local Deep, in-game advisor, and annotate tips/grades.
4. Promoting a neural Deep preset into defaults requires the same **human gate**
   spirit as ADR 002 (ladder / goldens evidence in the PR).
5. Heuristic eval remains the default fallback until neural is gated on.
6. Phase A wiring (landed): `encodePosition`, JSONL dataset dump
   (`yarn dataset:jsonl`), `setNeuralValueEvaluator` / stub proving
   `evaluatePosition` → `neural ?? heuristic`, smoke
   `yarn neural:stub-ladder`.

Public product charter: lattice.iwgf.org/deep-lattice ·
Handbook status: [`docs/deep-lattice.md`](../deep-lattice.md).
Living engineering plan: [`docs/deep-lattice-lab.md`](../deep-lattice-lab.md).

## Consequences

- New modules under `packages/subspace-lattice/src/lib/ai/` (encoder, neural
  hook); training scripts may live outside the Vite graph.
- Datasets and weight artifacts are versioned with `ENCODING_VERSION`.
- Annotate / TEI / puzzles must re-baseline when Deep’s brain changes.
- Explainer work (contrastive plan text) lands with policy / Phase C, not as a
  separate “chat model.”
