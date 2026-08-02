# Deep Lattice

**Deep Lattice** is the mind that plays Sector 11 with you — and the one that
will eventually teach the board back.

It is the flagship AI for [Subspace Lattice](https://lattice.iwgf.org): a
searching fleet tactician today, a learned neural player tomorrow, and one
brain shared by local play, the in-game advisor, and match annotation.

> **Product charter** (claim + how we research):
> [lattice.iwgf.org/deep-lattice](https://lattice.iwgf.org/deep-lattice)
>
> **Play now:** pick **Deep Lattice** on the local AI strength ladder · climb
> TEI on
> [iwgf.org/leaderboard/lattice](https://iwgf.org/leaderboard/lattice)

This handbook page is the living **status log** — field reports, gates, and
dated autopsies. The product page carries the research charter; the
[lab notebook](./deep-lattice-lab) carries engineering knobs.

---

## Why Deep Lattice exists

Subspace Lattice is not a puzzle you solve once. It is chess-piece tactics
under Go-like territorial pressure: Sensor Nets, Target Locks, EMP freeze,
Terminal Overclock. The board rewards long plans and punishes soft mistakes
that look fine for twenty plies.

Deep Lattice exists so that:

1. **You have a rival worth hunting** — a local opponent that does not fold to
   shallow threats or forget that the sector clock is running.
2. **You can ask why** — the same agent that moves can tip, grade, and annotate
   an [LPGN](./LPGN) replay. One brain; no mute strong engine with a chatty
   weak tipper bolted on.
3. **The game keeps getting sharper** — neural leaf eval, then policy, then
   device acceleration — without forking the rules or the product AI path.

If you only read one sentence: Deep Lattice is how we turn Sector 11 from a
beautiful board into a **living opponent and coach**.

---

## What it can do today

Honest snapshot — not vapor.

| Capability | Status |
| --- | --- |
| **Local AI opponent** | Shipping. Strength ladder includes **Deep Lattice** (~800 MCTS sims, heuristic leaf + guided rollouts). |
| **Think-time caps** | Interactive play caps wall-clock so the board stays responsive on desktop / web. |
| **Advisor / annotate path** | Same MCTS agent tips and grades LPGN; reason text is still mostly generic plan labels. |
| **Position encoder** | Landed. Fixed, versioned board → feature vector for training. |
| **Value net (lab)** | Trained MLP leaf (`value-mlp-v4-gpu`) exists; **opt-in only**. Product Deep still uses the heuristic leaf until a human-gated ladder pass. |
| **Strength bar harness** | `yarn neural:strength-bar` — short ladders vs heuristic / Deep candidates. |
| **Neural Engine / WebGPU** | Not yet. Training can use Apple GPU (MPS); in-game inference is portable CPU until the net earns promotion. |

**Bottom line for players:** Deep Lattice on the slider is a serious search
engine. The neural chapter is open in the lab and not yet the default brain.

---

## The goal

| Role | Success looks like |
| --- | --- |
| **Player** | Beats today’s Deep@800 on terminal goldens and a published local ladder / TEI sample. |
| **Explainer** | Tips name the *plan* — Escort screen vs Infiltrator tempo, EMP vs piece play — not “closes distance” spam. |
| **Hardware** | Batch leaf eval on CPU first; Core ML (Apple Neural Engine) and WebGPU when the net is worth accelerating. |

Rules stay human-designed (`hybrid-fleet`). Neural play does not rewrite the
game; it learns to *see* it. Promoting a neural Deep into shipping defaults
requires the same **human gate** spirit as evolve winners
([ADR 002](./adr/002-evolution-human-gate), [ADR 007](./adr/007-deep-lattice-neural)).

---

## Status log

Newest first. This section is the blog — date entries when something real
moves (ladder result, ship decision, explainer leap). Engineering knobs and
yarn recipes live in the [lab notebook](./deep-lattice-lab).

### 2026-08-01 — EMP Lockout reply filter + short bar PASS (v5)

`moveLeavesEmpLockout` is in the shared tactical layer (heuristic + MCTS).
Short strength bar with `value-mlp-v5-gpu.json` @40 sims: **PASS** (floor OK,
trunc at 25% cap). Candidates no longer get stomped by heuristic Lockout on
this sample. Deep@800 re-gate pending.

Atlas observe same day: equal-heuristic mirrors soft-EMP shuffle (95% trunc
even at 800 plies) — agent pathology for population sims, documented under
[Win paths](./atlas/win-paths).

### 2026-08-01 — Deep@800 gate: FAIL (and a useful autopsy)

Equal-budget neural vs shipping Deep@800 did not clear the bar (high truncate
rate + floor miss). More interesting: shipping Deep itself went **0–3 vs
heuristic** on that sample — mostly lockouts. Probe: HeuristicAi often wins by
an EMP that **immediately Lockouts**; MCTS takes its own winning EMP but did
not yet filter moves that hand the opponent a lockout-EMP reply (fixed same
day — entry above).

**Was:** fix that tactical hole before more neural bars.

### 2026-07-31 — Value net v0 + short strength bar PASS

Phase B value net is live in the lab. Prefer GPU weights
`value-mlp-v4-gpu.json` (`128→64→1`, trained on combined search-value dumps).
Short bar (`--deep-sims 40`, tiny sample): MLP leaf beat deepish-40 on ordinal
gap — **not** a ship signal. Need larger bars and a clean Deep@800 comparison.

Also: dataset / strength-bar harnesses parallelize across workers. Mirror
self-play dumps proved useless for outcome labels (disengaged fleets, `z=0`);
prefer heuristic-vs-random and LPGN corpora.

### 2026-07 — Spine lands

Position encoder, JSONL dataset dump, pluggable `neural ?? heuristic` leaf,
stub ladder, ADR 007. Charter locked: one agent for play, advisor, and
annotate.

---

## Roadmap at a glance

| Phase | Theme | State |
| --- | --- | --- |
| **A** | Metrics & data spine (encoder, JSONL, strength bar) | Done / iterating |
| **B** | Value net v0 + human gate | Lab live; not shipping default |
| **C** | Policy head + contrastive explainer | Next major product leap |
| **D** | Core ML / WebGPU batch leaf | After the net earns it |

Full checklist: [ROADMAP Phase 2b](./ROADMAP.md) · commands & architecture:
[lab notebook](./deep-lattice-lab).

---

## Pull into the sector

Deep Lattice only matters if the board is worth mastering.

| | |
| --- | --- |
| **Play** | [lattice.iwgf.org](https://lattice.iwgf.org) — local AI, online rooms, TEI |
| **Learn the fantasy** | [Player overview](./player-overview) · [Sector 11 briefing](./story) |
| **Read the numbers** | [Lattice Atlas](./lattice-atlas) — openings, win paths, clocks (the *game*, not the brain) |
| **Classical bar** | [Classical readiness](./classical-readiness) — rules freeze, AI honesty, corpus |
| **Export & study** | [LPGN](./LPGN) — portable match notation + annotate path |
| **Standings** | [iwgf.org/leaderboard/lattice](https://iwgf.org/leaderboard/lattice) |

Challenge Deep on Local AI. Export the LPGN when something feels wrong or
brilliant. That corpus is how the next brain learns what Sector 11 actually
rewards.

---

## For builders

| Doc | Audience |
| --- | --- |
| [Lab notebook](./deep-lattice-lab) | Encoder, datasets, train/strength-bar commands, open choices |
| [ADR 007](./adr/007-deep-lattice-neural) | Decision record: neural leaf, one agent, human gate |
| [Atlas — AI & measurement](./atlas/measurement) | How we separate “rules truth” from “player strength” |

```bash
yarn handbook:dev   # this site locally
# Lab: yarn dataset:jsonl · yarn train:value:gpu · yarn neural:strength-bar
```
