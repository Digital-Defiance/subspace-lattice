import { parseLength, tag, uid } from "./utils.js";
import { roundedRectPath } from "./borders.js";

/**
 * Parse CSS clip-path into an SVG clipPath definition + url reference.
 * Supports: none, inset(), circle(), ellipse(), polygon(), path().
 *
 * @returns {{ def: string, url: string } | null}
 */
export function buildClipPath(style, box, defs) {
  const raw = style.clipPath || style.webkitClipPath;
  if (!raw || raw === "none") return null;

  const geom = parseClipPath(raw, box, parseLength(style.fontSize) || 16);
  if (!geom) return null;

  const id = uid("clip");
  defs.push(tag("clipPath", { id }, geom));
  return { def: geom, url: `url(#${id})` };
}

/**
 * Pure parser — exported for unit tests.
 * @returns {string|null} SVG geometry element markup
 */
export function parseClipPath(raw, box, fontSize = 16) {
  if (!raw || raw === "none") return null;

  const { x, y, width: w, height: h } = box;

  const circle = raw.match(/circle\(\s*([^)]+)\)/i);
  const ellipse = raw.match(/ellipse\(\s*([^)]+)\)/i);
  const inset = raw.match(/inset\(\s*([^)]+)\)/i);
  const polygon = raw.match(/polygon\(\s*([^)]+)\)/i);
  const path = raw.match(/path\(\s*(?:([a-z]*)\s*,\s*)?['"]?([^'")]+)['"]?\s*\)/i);

  if (circle) {
    const parts = circle[1].trim().split(/\s+at\s+/i);
    const r = parseLength(parts[0], Math.hypot(w, h) / 2, fontSize);
    let cx = x + w / 2;
    let cy = y + h / 2;
    if (parts[1]) {
      const [px, py] = parts[1].trim().split(/\s+/);
      cx = x + parseLength(px, w, fontSize);
      cy = y + parseLength(py, h, fontSize);
    }
    return tag("circle", { cx, cy, r });
  }

  if (ellipse) {
    const parts = ellipse[1].trim().split(/\s+at\s+/i);
    const radii = parts[0].trim().split(/\s+/);
    const rx = parseLength(radii[0], w, fontSize);
    const ry = parseLength(radii[1] || radii[0], h, fontSize);
    let cx = x + w / 2;
    let cy = y + h / 2;
    if (parts[1]) {
      const [px, py] = parts[1].trim().split(/\s+/);
      cx = x + parseLength(px, w, fontSize);
      cy = y + parseLength(py, h, fontSize);
    }
    return tag("ellipse", { cx, cy, rx, ry });
  }

  if (inset) {
    const tokens = inset[1].trim().split(/\s+/);
    const roundIdx = tokens.findIndex((t) => t.toLowerCase() === "round");
    const boxTokens = roundIdx >= 0 ? tokens.slice(0, roundIdx) : tokens;
    const top = parseLength(boxTokens[0] || "0", h, fontSize);
    const right = parseLength(boxTokens[1] || boxTokens[0] || "0", w, fontSize);
    const bottom = parseLength(boxTokens[2] || boxTokens[0] || "0", h, fontSize);
    const left = parseLength(boxTokens[3] || boxTokens[1] || boxTokens[0] || "0", w, fontSize);

    let roundRadii = null;
    if (roundIdx >= 0) {
      const rTokens = tokens.slice(roundIdx + 1);
      const r = parseLength(rTokens[0] || "0", w, fontSize);
      roundRadii = {
        tl: { rx: r, ry: r },
        tr: { rx: r, ry: r },
        br: { rx: r, ry: r },
        bl: { rx: r, ry: r },
      };
    }

    const ix = x + left;
    const iy = y + top;
    const iw = Math.max(0, w - left - right);
    const ih = Math.max(0, h - top - bottom);
    if (roundRadii) {
      return tag("path", { d: roundedRectPath(ix, iy, iw, ih, roundRadii) });
    }
    return tag("rect", { x: ix, y: iy, width: iw, height: ih });
  }

  if (polygon) {
    let body = polygon[1].trim();
    let rule = "nonzero";
    const fillRule = body.match(/^(nonzero|evenodd)\s*,?\s*/i);
    if (fillRule) {
      rule = fillRule[1].toLowerCase();
      body = body.slice(fillRule[0].length);
    }
    const pts = body.split(",").map((pair) => {
      const [px, py] = pair.trim().split(/\s+/);
      return `${x + parseLength(px, w, fontSize)},${y + parseLength(py, h, fontSize)}`;
    });
    return tag("polygon", { points: pts.join(" "), "fill-rule": rule });
  }

  if (path) {
    const d = path[2].trim();
    return tag("path", { d, transform: `translate(${x} ${y})` });
  }

  return null;
}

/**
 * Overflow clip as a simple rect clipPath.
 */
export function buildOverflowClip(box, defs, radii = null) {
  const id = uid("ovclip");
  let inner;
  if (radii && (radii.tl.rx || radii.tr.rx || radii.br.rx || radii.bl.rx)) {
    inner = tag("path", { d: roundedRectPath(box.x, box.y, box.width, box.height, radii) });
  } else {
    inner = tag("rect", { x: box.x, y: box.y, width: box.width, height: box.height });
  }
  defs.push(tag("clipPath", { id }, inner));
  return `url(#${id})`;
}
