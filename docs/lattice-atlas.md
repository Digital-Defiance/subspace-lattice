# Lattice Atlas

The long book of Subspace Lattice numbers — openings, pieces, win paths, clocks,
EMP, Terminal Overclock, AI ladders — aimed at people who already know chess
tables by heart and want the same depth for Sector 11.

This is **not** Deep Lattice (the neural player). Deep Lattice trains a brain.
The Atlas measures the **game**. Same engine; different job.

Live site: [docs.lattice.iwgf.org/lattice-atlas](https://docs.lattice.iwgf.org/lattice-atlas)
(after deploy). Local: `yarn handbook:dev`.

---

## How to read the Atlas

| Voice | Meaning |
| --- | --- |
| **Census** | Regenerable from the engine (`yarn atlas:census`) — geometry & opening facts |
| **Observe** | Ply-event JSONL from N games (`yarn atlas:observe`) — raw telemetry |
| **Diff** | Biggest rate deltas across two observe runs (`yarn atlas:diff`) |
| **Scorecard** | Population sims (`yarn evolve` / `yarn sim`) — win paths, fairness, plies |
| **Lab note** | One-off probes with date + seed — Lockout, EMP dial, heavy wings |
| **Gap** | We care about the number but have not frozen a method yet |

Chess has centuries of games. We start with **engine census + controlled sims**,
then fold in LPGN corpora and human TEI as they accrue. Every table should say
**ruleset**, **agent**, **n**, and **date**.

Shipping default ruleset: **`hybrid-fleet`**.

---

## Chapters

| Chapter | What you get |
| --- | --- |
| [Opening](./atlas/opening) | Branching factor, Relay Escort, piece-type share of ply-0 moves |
| [Pieces & wings](./atlas/pieces) | Inventories, heavy-draft geometry pointers |
| [Win paths](./atlas/win-paths) | Hub / sector / Lockout mix; truncations vs draws |
| [Clocks & Terminal](./atlas/clocks) | Sector activation, Integration Hold, TO / EMP |
| [AI & measurement](./atlas/measurement) | Scorecard, ladders, Deep Lattice vs Atlas |
| [Census data](./atlas/census) | Latest machine-readable dump |

Lab notebooks (keep dating them):

- [Lockout impossibility](./lockout-impossibility) — why Lockout needs EMP
- [Terminal Overclock](./terminal-overclock) — fused endgame
- [Deep Lattice](./deep-lattice) — public status / gateway (player, not encyclopedia)
- [Deep Lattice lab](./deep-lattice-lab) — encoder, datasets, strength bar
- [Game viability testing](./game-viability-testing)
- Heavy draft / EMP / TO probes under `packages/subspace-lattice/docs/`

---

## Regenerate the census

```bash
yarn atlas:census
# → docs/atlas/census.json (+ refreshes the census markdown stub)

yarn atlas:observe --games 20 --seed 7 --white heuristic --black random \
  --out docs/atlas/runs/observe-HvR-s7.jsonl
yarn atlas:observe --games 20 --seed 8 --white heuristic --black heuristic \
  --out docs/atlas/runs/observe-HvH-s8.jsonl
yarn atlas:diff \
  --a docs/atlas/runs/observe-HvR-s7.jsonl \
  --b docs/atlas/runs/observe-HvH-s8.jsonl
```

Cheap census (seconds). Observe burns scale with `--games` / agent strength. Diff does **not** replace evolve scorecards — those need `yarn evolve`.

---

## Question bank (Atlas backlog)

Your examples were the tip. Treat this as the **question inventory** — not a
promise that every row ships tomorrow. When a question gets a method + table,
check it off and link the chapter. Add more freely; the point is that Lattice
should feel as *known* as chess.

### Opening & theory

- [ ] Top-N first moves (and replies) under Heuristic / Strong / Deep
- [ ] Opening “book” stability: how often ply 1–10 agree across seeds
- [ ] Branching factor by ply (mean / p50 / p90) until first capture
- [ ] Moves that leave Hub hanging on reply (rate by strength)
- [ ] Initiative Relay value: White win% with Relay on vs off (counterfactual)
- [ ] First blood: median ply of first capture; by piece type that bled
- [ ] “Quiet opening” rate: N plies with zero captures / zero EMP
- [ ] Escort-forward vs Infiltrator-sprint as first-move families (cluster labels)

### Pieces & material

- [ ] Move share by piece type over full games (by AI tier)
- [ ] Capture share by **mover** type and by **victim** type
- [ ] Survival curves: median ply when each piece type leaves the board
- [ ] Trade quality: material Δ after exchanges that both sides chose
- [ ] Heavy wing Δ (Refractor / Carrier) on hub% / sector% / avg plies / Lockout%
- [ ] Wing file geometry: ply-0 slide counts by `heavyUnitFiles`
- [ ] Infiltrator spool: announce rate, fail rate, capture-after-spool rate
- [ ] Beam “lane” usage: long slides vs one-steps under Target Lock
- [ ] Which piece types deliver Surgical Strike (last mover)

### Sensor Net & space

- [ ] Mean sovereign / contested / empty cell counts by ply band
- [ ] Coverage % trajectories (both colors) until activation
- [ ] How often contested fringe resets an Integration Hold streak
- [ ] Net size vs material: correlation with eventual win path
- [ ] Gravity Well as choke: fraction of paths that route around vs through wings

### Clocks, EMP, Terminal

- [ ] Plies until sector activation (always 100 today — still log when knobs move)
- [ ] Plies from activation → sector win (distribution)
- [ ] Plies until Terminal Overclock armed (distribution + worst case)
- [ ] Plies from TO-armed → Lockout or Strike
- [ ] EMP fires per game by phase (pre-act / mid / TO)
- [ ] Soft EMP vs Terminal EMP (which finishes Lockout)
- [ ] “Suicide miss” rate: Terminal fire out of range
- [ ] Emp-lockout tactical: how often Heuristic’s +50k EMP appears vs MCTS finding it
- [ ] Charge curves: median charge at ply 50 / 100 / 150

### Win paths & length

- [ ] Hub / sector / Lockout mix by matchup (HvH, HvR, MCTS, Deep, human)
- [ ] Truncation vs true draw rates (ply caps must be stated)
- [ ] Game-length histograms (plies) by win path
- [ ] Color split of each win path under Relay
- [ ] “Comedack” rate: side that was behind on material at ply 80 still wins
- [ ] Dual-threat games: both hub hunt and sector race live past ply 120

### AI & human play

- [ ] Calibration table: Fast &lt; Normal &lt; Strong &lt; Deep (fleet)
- [ ] Cross tables: each strength vs each (win% + avg plies)
- [ ] Blunder rates from LPGN annotate (eval shortlist rank)
- [ ] Tip agreement: how often humans match advisor at each strength
- [ ] TEI pool snapshots (localAi / online) linked by date
- [ ] Time-to-move distributions in desktop/web (when instrumented)
- [ ] Puzzle / drill solve rates (academy telemetry, if/when opted in)

### Fairness & rules evolution

- [ ] First-move advantage under `hybrid-fleet` (OpenSkill / raw W-L)
- [ ] Scorecard composite vs individual gates (Pareto front of configs)
- [ ] Sensitivity: Δρ, Δ activation ply, Δ EMP charge target → win-path mix
- [ ] Counterfactual: same seed games under two `RulesConfig`s

### Meta / corpus

- [ ] Human LPGN corpus size, date range, ruleset mix
- [ ] Most common ECO-like opening hashes (position fingerprint)
- [ ] Novelty: % of middlegame positions never seen in sims
- [ ] Tablebase-ish endgames: hubs-only TO positions — outcome under perfect EMP play

---

When a row graduates, it gets a dated table in the right chapter and a row in
the census or a sim-run JSON under `packages/subspace-lattice/docs/sim-runs/`.
New questions belong in this bank first — even half-baked ones.
