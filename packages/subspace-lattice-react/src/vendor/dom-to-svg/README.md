# Vendored: dom-to-svg converter

True-vector DOM→SVG mapper from the Digital Defiance `dom-to-svg` browser
extension (MIT, see `LICENSE`). Source of truth:
[Digital-Defiance/dom-to-svg](https://github.com/Digital-Defiance/dom-to-svg)
(`src/converter/`). Re-copy the `*.js` files from a tagged release to update.

Pinned behavior includes CSS `-webkit-text-stroke` → SVG `stroke` /
`stroke-width` / `paint-order` (extension ≥ 0.1.1), used so outlined Black
piece glyphs stay visible on dark / Black-net cells in captured mission
figures.

Used by the mission-figures capture harness (`/harness/mission-figures`) to
export per-ply board SVGs for the advanced manual.

```ts
import { elementToSvg } from './index.js';
const svg = await elementToSvg(document.querySelector('#figure-capture-root'));
```
