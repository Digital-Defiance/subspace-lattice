# Atlas — Middlegame (Volume II)

Plans and conflicts after the Infiltrator Overture — **sim-provisional** until
human LPGN overlays arrive. Companion: [Playbook](./playbook) ·
[Win paths](./win-paths) · [Opening](./opening).

Ruleset: **`hybrid-fleet`**. Prefer search corpora (MvM / MvH / MvR), not HvH.

---

## Plan families (working)

| Plan | Win fiction | Teach surface |
| --- | --- | --- |
| **Surgical Strike** | Hub capture | `/drills` `drill-surgical-strike` · `/puzzles` `puzzle-find-strike` |
| **Sector Integration** | Coverage clock + hold | `/drills` `drill-expand-net-45`, `drill-integration-hold` |
| **Overload / Lockout** | EMP freeze → no-moves | Terminal drills + goldens |
| **Hub discipline** | Fail mode: Hub wandering | `/drills` `drill-hold-the-hub` · `/puzzles` `puzzle-refuse-bait`, `puzzle-secure-then-claim` |

## How we mine it

```bash
yarn atlas:observe --games 120 --jobs 12 --seed 42 \
  --white mcts --black mcts --sims 40 \
  --out docs/atlas/runs/observe-MvM-mid-s42-n120.jsonl
yarn atlas:book --in docs/atlas/runs/observe-MvM-mid-s42-n120.jsonl \
  --opening-end 12 --late-start 120 --top 20
```

Read **middlegame.moverShare** (Hub% is the Hub-wandering canary),
**empRate / captureRate**, and **endgame.finishMix**.

## Themes queue

- [x] Hub wandering (playbook §1) — mid Hub share **4.7%** on MvM@40 n=120
- [x] Strike vs Sector under search — sector plurality (52.5% / 3.3% hub) on same corpus
- [x] Relay on/off — see playbook; no White win% boost at n=40
- [ ] Contested-net stall (needs coverage fields on ply events)
- [ ] Soft-EMP cadence under MvM (not HvH canary)

### Corpus snapshot (2026-08-03)

| Corpus | n | sims | hub / sec / lock / trunc | mid Hub% |
| --- | ---: | ---: | --- | ---: |
| MvM mid s42 | 120 | 40 | 3% / 53% / 2% / 43% | 4.7 |
| MvM open s41 | 40 | 200 | 3% / **80%** / 0% / 18% | 7.1 |

Fill new rows only with dated observe artifacts.
