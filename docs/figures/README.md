# Rules figures

SVG sources captured from `/harness/figures`. PDF companions are generated for
`pdflatex` (`yarn build:rules` runs `rsvg-convert` when available).

## Regenerate (headless)

```bash
yarn capture:rules-figures -- --force   # all figures → docs/figures/<id>.svg
yarn capture:rules-figures -- --figure target-lock   # just one
yarn build:rules                        # SVG→PDF + rules.pdf
```

Note: `build:rules` skips entirely when `docs/rules.tex` is unchanged. If only
figures changed, delete `docs/rules.tex.sha256` first (or run `rsvg-convert`
manually) so the embedded figure PDFs are refreshed.

## Regenerate (manual fallback)

1. `yarn serve:web` → **http://localhost:4200/harness/figures**
2. Click a figure → DOM→SVG **`#figure-capture-root`**
3. Save as `docs/figures/<id>.svg`
4. `yarn build:rules`

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
