# Vendored: dom-to-svg converter

True-vector DOM→SVG mapper from the Digital Defiance `dom-to-svg` browser
extension (MIT, see `LICENSE`). Source of truth: `/Volumes/Code/dom-to-svg`
(`src/converter/`). Re-copy the `*.js` files to update; do not hand-edit here.

Used by the mission-figures capture harness (`/harness/mission-figures`) to
export per-ply board SVGs for the advanced manual.

```ts
import { elementToSvg } from './index.js';
const svg = await elementToSvg(document.querySelector('#figure-capture-root'));
```
