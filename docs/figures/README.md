# Rules figures

SVG sources (hand-captured via DOM→SVG). PDF companions are generated for
`pdflatex` (`yarn build:rules` runs `rsvg-convert` when available).

## Regenerate

1. `yarn serve:web` → **http://localhost:4200/harness/figures**
2. Click a figure → DOM→SVG **`#figure-capture-root`**
3. Save as `docs/figures/<id>.svg`
4. `yarn build:rules` (converts SVG→PDF and rebuilds `docs/rules.pdf`)

| id | Rules section |
| --- | --- |
| `opening-hybrid` | The fleet |
| `opening-fleet-relay` | The fleet / Initiative Relay |
| `sensor-net-sovereign` | Sensor Net |
| `broken-escort` | Sensor Net (unlinked Escort) |
| `target-lock` | Target Lock |
| `beam-lane` | Movement (Beam) |
| `surgical-strike` | Victory |
| `contested-space` | Fleet Contested Space |
| `objective-hud` | Fleet sector clock HUD |

Presets: `@subspace-lattice/core` → `RULES_FIGURES`.
