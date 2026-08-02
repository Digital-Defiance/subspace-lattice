# Classical readiness

The bar for Subspace Lattice if it is to stand next to **Chess** and **Go**:
stable laws, depth that rewards study, and a corpus the community can argue
with for decades — not a good ladder week.

This page is the **integrity gate** above day-to-day shipping. Soft-ship
`hybrid-fleet` may proceed while rows here stay open; calling the game
*classical* or “solved enough for eons” requires them green.

Companion docs:

| Doc | Role |
| --- | --- |
| [Playtest checklist](./playtest-fleet-checklist) | Human / UI gate before “official hybrid” |
| [Game viability](./game-viability-testing) | Sim viability protocol (evolve / scorecards) |
| [Lattice Atlas](./lattice-atlas) | What is true of the *rules* (numbers) |
| [Deep Lattice](./deep-lattice) | Whether the *player* is honest |
| [ADR 002](./adr/002-evolution-human-gate) | No auto-ship of evolve winners |

**Discipline:** three books stay separate — **Rules** (normative) · **Atlas**
(facts) · **Deep Lattice** (strength). Conflating them is how you ship
confusion.

---

## Status snapshot (2026-08-01)

| Gate | State | Note |
| --- | --- | --- |
| Rules freeze candidate | **Provisional** | Bias: do not retune EMP/clock off heuristic-mirror trunc |
| Path integrity (search agents) | **Promising** | MvR/MvH path mix in band; see [Win paths](./atlas/win-paths) |
| Path integrity (heuristic mirrors) | **Canary only** | HvH soft-EMP shuffle ≠ the game |
| AI honesty | **Improving** | Hub-defense leaf: deepish ≈ heur (13.4 vs 14.5); floor MISS is mlp (10.0); heur-White 2–2 vs deepish |
| Human corpus | **Open** | Playtest ≥5 still unchecked; need dozens for theory |
| Theory surface (Atlas) | **Started** | Census + observe/diff + [sim-provisional playbook](./atlas/playbook); human overlay later |
| Principled long finish | **Open** | Lab trunc ≠ classical draw rule |

---

## Non‑negotiable gates

Check a box only with **method + artifact + date**. Vibes do not count.

### 1. Rules freeze candidate

- [ ] Named shipping ruleset (`hybrid-fleet`) + `rulesVersion` treated as
      **frozen by default**
- [ ] Any dial change requires ADR (or dated lab note) + before/after corpus
      (observe/evolve), not a single embarrassing matchup
- [ ] Normative PDF (`docs/rules.tex`) matches engine defaults when promoting

**Embarrassment mode:** monthly radius/charge tweaks after players start opening
books.

### 2. Path integrity

Under **search** agents (MCTS / Deep — not equal-heuristic mirrors):

- [ ] Hub (Surgical Strike) remains the plurality finish among *decided* games
- [ ] Sector Integration ~**25–40%** of decided games (playtest band)
- [ ] Lockout uncommon but reproducible; not an EMP flood
- [ ] Truncation rate low enough that the sample is about the game, not the ply cap

Instruments: `yarn atlas:observe` / `yarn atlas:diff`, `yarn evolve` scorecards.
Prefer **MvR / MvH / MvM**; keep **HvH** as a heuristic-regression canary only.

Lab note in hand (2026-08-01): MvR sector ~35%; MvH finishes with mixed paths;
HvH 95% trunc @400/800 — agent pathology, not a clock fail. See
[Win paths](./atlas/win-paths).

### 3. AI honesty

- [ ] Public strength bar: Fast &lt; Normal &lt; Strong &lt; Deep (ordinal, same
      ruleset, cited seeds)
- [ ] Deep does **not** lose systematically to shallow heuristic on Lockout /
      soft-EMP circus
- [ ] Local AI labels match reality (no “Deep” that a Fast leaf outplays)

Instruments: `yarn neural:strength-bar`, `yarn calibrate:ai`. Status log:
[Deep Lattice](./deep-lattice).

**Embarrassment mode:** shipping Deep that goes 0–N vs heuristic on Lockout.

### 4. Human corpus

- [ ] [Fleet playtest checklist](./playtest-fleet-checklist) green (≥5 games,
      clock moments clear)
- [ ] Dozens of serious human games (LPGN), not only checklist taps
- [ ] Annotated failures: “didn’t see sector,” “EMP felt cheap,” Relay swing

Sims never close this gate alone.

### 5. Theory surface (Atlas)

- [ ] Opening census regenerable (`yarn atlas:census`) — **done**
- [ ] Observe/diff unknown-unknown loop — **v0 done**
- [ ] Population tables (hub/sector/lockout, color, plies) cited from evolve
- [ ] Opening / first-blood / “when EMP is correct” rows a Chess reader would
      respect

Hub: [Lattice Atlas](./lattice-atlas).

### 6. Principled long finish

- [ ] Either search-agent games terminate for good reasons at sane lengths, **or**
- [ ] A documented long-game rule exists (not silent 400-ply trunc as fiction)

Lab truncation remains a **measurement artifact** — say so in every table
([Win paths](./atlas/win-paths)).

---

## Default posture until classical

1. **Freeze rules** unless humans *and* search agree the *game* is wrong.
2. **Fix AI integrity** (heuristic soft-EMP addiction; Deep vs heur losses)
   before more rules dials.
3. **Teach the third win** so Sector Integration is visible in play, not only
   in JSONL.
4. **Grow Atlas** with cited methods; promote surprises from observe/diff into
   chapter rows.
5. **Speak carefully in public** — provisional fleet is honest; “holds up for
   eons” is a claim you earn.

---

## Related

- [Playtest checklist](./playtest-fleet-checklist) — day-to-day human gate
- [Game viability testing](./game-viability-testing) — sim definition of viable
- [ROADMAP](./ROADMAP) — phases; this page outranks phase cheerleading
