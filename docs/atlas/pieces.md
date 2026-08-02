# Atlas — Pieces & wings

Shipping default: **standard Beams** on the heavy-wing files (`heavyUnitDraft:
standard`). Refractor / Carrier are research modules — see the heavy-draft lab
note in-repo (`packages/subspace-lattice/docs/heavy-draft-experiment.md`).

---

## Starting inventory (`hybrid-fleet`)

Exact counts are in [`census.json`](./census.json) (`opening.inventory`).

Typical fleet fantasy:

| Role | Chess analog (loose) | Notes |
| --- | --- | --- |
| Command Hub | King + win condition | Capture = Surgical Strike |
| Escort | Short-range screen / net | White Relay Escort is the Initiative edge |
| Infiltrator | Soft knight / sneak | Spool / cloak rules — ADR 004 |
| Beam | Long orthogonal under net | Default wing |
| Refractor / Carrier | Bishop / Queen under net | Optional draft modules |

## Heavy wings (research)

Opening geometry command: `yarn heavy-draft:geometry`.

Known (2026-07-27 lab):

- Files **`3-7`** maximize opening diagonal / corner-bypass while staying in
  opening Hub radiation.
- Files **`0-10` / `1-9`** leave heavies **outside** opening net → 0 ply-0 slides.
- Recommended first storyline module after fairness screens:
  **`refractor-beam` @ `files=3-7`**.

Those are **lab** numbers. Promote into this chapter only after an evolve
scorecard with date, seed, and n.

## Wishlist

- [ ] Move share by piece type over 1k decided games (heuristic / MCTS / Deep)
- [ ] Capture share by mover type (already partially on `MatchResult`)
- [ ] Survival curves: median ply when each piece type leaves the board
