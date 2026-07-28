# Heavy-unit Fleet Draft experiment (Refractor / Carrier)

Research track for optional bishop/queen equivalents as **add-on modules**, not
shipping-default changes. Promotion still requires ADR 002 human gate.

## Pieces

| Piece | Chess analog | Hybrid movement |
| --- | --- | --- |
| **Refractor** | Bishop | Clear diagonal slide; entire path + dest in own Sensor Net |
| **Carrier** | Queen | Orthogonal or diagonal slide under the same net constraint |

Universal EW rules:

- **Target Lock** (in enemy net) → one orthogonal step only (same as Beam).
- Optional **`carrierRequiresHubAnchor`**: full Carrier slide only while starting
  inside own Hub radiation (`hubSensorRadius`); outside → one king-step.

## RulesConfig knobs

| Knob | Values | Default |
| --- | --- | --- |
| `heavyUnitDraft` | `standard` \| `refractor-pair` \| `refractor-beam` \| `carrier-beam` \| `refractor-carrier` | `standard` (2× Beam) |
| `carrierRequiresHubAnchor` | boolean | `false` |
| `heavyUnitFiles` | `[left, right]` wing files | `[2, 8]` |

Wing piece ids are `w-h1`/`w-h2` / `b-h1`/`b-h2` (replacing former `w-b1`/`w-b2`).

## Opening geometry (2026-07-27)

Command: `yarn heavy-draft:geometry`

Artifact: `sim-runs/heavy-draft-geometry-20260727.jsonl`

| Finding | Implication |
| --- | --- |
| Files **`3-7`** maximize opening diagonal + corner-bypass destinations while keeping all heavies in the opening net | Best first placement candidate vs legacy `2-8` |
| Files **`0-10` / `1-9`** leave heavies **outside** the opening Hub radiation → 0 ply-0 slides for net-bound heavies | Reject for opening unless midgame repositioning is the fantasy |
| At `3-7` / `2-8`, Carriers already sit inside Hub r=3 → **`anchor` does not change ply-0 mobility** | Anchor is a midgame leash, not an opening nerf |
| `refractor-carrier` @ `3-7` tops the geometry score | Primary storyline candidate for fairness deepen |

## Fairness / skill protocol

Use Track A gates from `evolution-lab.md` (color balance, sector 15–45%, clock
signature, OpenSkill cal/sep). Prefer MCTS fairness — pure heuristic deadlocks
under fleet hold/neutral/act100.

```bash
# Opening geometry
yarn heavy-draft:geometry -- --out docs/sim-runs/heavy-draft-geometry-$(date +%Y%m%d).jsonl

# MCTS screen (quote --fixed; cwd packages/subspace-lattice)
bash scripts/evolve.sh --track A --ai-trials 0 --jobs 14 \
  --fairness-games 24 --skill-games 8 --fairness-mcts 30 --max-plies 240 \
  --seed 42 \
  --fixed 'hub3,esc1,link2,0.45,hold1,neutral,act100,relay1;…' \
  --out docs/sim-runs/evolve-$(date +%Y%m%d)-heavy-draft-mcts-screen.jsonl
```

`--fixed` tokens: `draft=refractor-carrier`, `anchor`, `files=3-7`.

## Status (post MCTS-root fix)

- Engine + unit tests: landed.
- Hub-safety regression (`83109c9` mate-filter on MCTS root) fixed; baseline Track A OK again.
- Post-fix screen: `evolve-20260727-heavy-draft-post-fix-screen.jsonl`
- Production confirm (48 games + counterfactual):
  `evolve-20260727-heavy-draft-post-fix-confirm.jsonl`

### Production confirm (48 fairness / 16 skill / MCTS@30 / seed 42)

| Cell | Gate | Fair | Hub% | Sec% | Comp | Clock | CF clock |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| baseline | OK | 0.95 | 80 | 20 | 0.648 | ✗ | ✗ |
| **`refractor-beam` @ `files=3-7`** | **OK** | **0.98** | 71 | **29** | **0.739** | **✓** | **✓** |
| `refractor-carrier`+`anchor` @ `3-7` | OK | 0.96 | 69 | 31 | 0.665 | ✗ | ✓ |
| `refractor-carrier` @ `2-8` | OK | 0.98 | 78 | 22 | 0.665 | ✗ | ✗ |
| `carrier-beam`+`anchor` @ `2-8` | REJECT | 0.73 | 82 | 18 | — | ✗ | ✗ |

**Recommended first storyline module:** `draft=refractor-beam,files=3-7`
(swap one Beam for a Refractor on files 3–7). Only cell with both Track A
clock signature and functional counterfactual clock; sector in the 25–40%
sweet band; fairness near even.

**Full Fleet Draft (`refractor-carrier`+`anchor` @ `3-7`):** passes Track A
hard gates with excellent fairness and sector ~31%, but clock signature is
soft-fail (sector finishes slightly earlier than hub). Still a viable module
candidate with a note that clock timing needs playtest / possible retune.

**Carrier Surgical Strike risk:** not observed — hub remains primary
(~69–80%). Unanchored Carrier @ default files is OK but weaker on clock than
the Refractor-beam module.

### Next steps

1. Human gate / playtest the `refractor-beam@3-7` module (ADR 002).
2. Optional: lobby wiring for Fleet Draft storylines (do not change shipping
   default).
3. Optional: retune activation/hold if shipping full `refractor-carrier`+anchor.
