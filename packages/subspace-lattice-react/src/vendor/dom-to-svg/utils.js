/** @typedef {{ x: number, y: number, width: number, height: number }} Box */

const SVG_NS = "http://www.w3.org/2000/svg";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

export { SVG_NS, XHTML_NS };

export function escAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Parse CSS length (px, %, em relative to fontSize) into pixels. */
export function parseLength(value, ref = 0, fontSize = 16) {
  if (value == null || value === "" || value === "auto" || value === "none") return 0;
  const s = String(value).trim();
  if (s.endsWith("%")) return (parseFloat(s) / 100) * ref;
  if (s.endsWith("em")) return parseFloat(s) * fontSize;
  if (s.endsWith("rem")) return parseFloat(s) * 16;
  if (s.endsWith("pt")) return parseFloat(s) * (96 / 72);
  return parseFloat(s) || 0;
}

export function isTransparent(color) {
  if (!color || color === "transparent" || color === "none") return true;
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i);
  if (m && m[4] !== undefined && parseFloat(m[4]) === 0) return true;
  if (/^rgba?\([^)]+\/\s*0\s*\)$/i.test(color)) return true;
  return false;
}

export function parseColor(color) {
  if (!color || isTransparent(color)) return null;
  return color;
}

/** Parse border-radius corner: "10px" | "10px 20px" → {rx, ry} */
export function parseRadiusCorner(value, width, height, fontSize) {
  const parts = String(value).trim().split(/\s+/);
  const rx = parseLength(parts[0] || "0", width, fontSize);
  const ry = parseLength(parts[1] || parts[0] || "0", height, fontSize);
  return { rx: Math.max(0, rx), ry: Math.max(0, ry) };
}

/**
 * Read all four border-radius corners from computed style.
 * Returns { tl: {rx,ry}, tr, br, bl } clamped so adjacent radii don't overflow.
 */
export function getBorderRadii(style, width, height) {
  const fs = parseLength(style.fontSize) || 16;
  const tl = parseRadiusCorner(style.borderTopLeftRadius, width, height, fs);
  const tr = parseRadiusCorner(style.borderTopRightRadius, width, height, fs);
  const br = parseRadiusCorner(style.borderBottomRightRadius, width, height, fs);
  const bl = parseRadiusCorner(style.borderBottomLeftRadius, width, height, fs);

  const clampPair = (a, b, max) => {
    const sum = a + b;
    if (sum <= max || sum === 0) return [a, b];
    const scale = max / sum;
    return [a * scale, b * scale];
  };

  [tl.rx, tr.rx] = clampPair(tl.rx, tr.rx, width);
  [bl.rx, br.rx] = clampPair(bl.rx, br.rx, width);
  [tl.ry, bl.ry] = clampPair(tl.ry, bl.ry, height);
  [tr.ry, br.ry] = clampPair(tr.ry, br.ry, height);

  return { tl, tr, br, bl };
}

export function hasNonUniformRadius(radii) {
  const { tl, tr, br, bl } = radii;
  const same =
    tl.rx === tr.rx &&
    tr.rx === br.rx &&
    br.rx === bl.rx &&
    tl.ry === tr.ry &&
    tr.ry === br.ry &&
    br.ry === bl.ry &&
    tl.rx === tl.ry;
  return !same && (tl.rx > 0 || tr.rx > 0 || br.rx > 0 || bl.rx > 0 || tl.ry > 0 || tr.ry > 0 || br.ry > 0 || bl.ry > 0);
}

export function isUniformRadius(radii) {
  const { tl, tr, br, bl } = radii;
  return (
    tl.rx === tr.rx &&
    tr.rx === br.rx &&
    br.rx === bl.rx &&
    tl.ry === tr.ry &&
    tr.ry === br.ry &&
    br.ry === bl.ry &&
    tl.rx === tl.ry
  );
}

/** CSS matrix / matrix3d → SVG 2D matrix string, or null if identity/none. */
export function cssTransformToSvg(transform) {
  if (!transform || transform === "none") return null;

  const m3 = transform.match(/matrix3d\(([^)]+)\)/i);
  if (m3) {
    const v = m3[1].split(",").map((n) => parseFloat(n.trim()));
    // matrix3d(a1..a16) → 2D: a,b,c,d,e,f = a1,a2,a5,a6,a13,a14
    const [a, b, , , c, d, , , , , , , e, f] = v;
    if (a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0) return null;
    return `matrix(${a} ${b} ${c} ${d} ${e} ${f})`;
  }

  const m2 = transform.match(/matrix\(([^)]+)\)/i);
  if (m2) {
    const v = m2[1].split(",").map((n) => parseFloat(n.trim()));
    const [a, b, c, d, e, f] = v;
    if (a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0) return null;
    return `matrix(${a} ${b} ${c} ${d} ${e} ${f})`;
  }

  return null;
}

/**
 * getBoundingClientRect is viewport-relative; SVG coords should be root-relative.
 * Also account for transform-origin when applying matrices on groups.
 */
export function relativeBox(elRect, rootRect) {
  return {
    x: elRect.left - rootRect.left,
    y: elRect.top - rootRect.top,
    width: elRect.width,
    height: elRect.height,
  };
}

export function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function shouldSkipElement(el, style) {
  if (!(el instanceof Element)) return true;
  const tag = el.tagName.toLowerCase();
  if (tag === "script" || tag === "style" || tag === "noscript" || tag === "template" || tag === "head" || tag === "link" || tag === "meta") {
    return true;
  }
  if (style.display === "none") return true;
  if (style.visibility === "hidden") return true;
  if (parseFloat(style.opacity) === 0) return true;
  return false;
}

/** Visible overflow creates a clip region. */
export function needsOverflowClip(style) {
  const vals = [style.overflow, style.overflowX, style.overflowY];
  return vals.some((v) => v && v !== "visible");
}

export function serializeAttrs(attrs) {
  return Object.entries(attrs)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}="${escAttr(v)}"`)
    .join(" ");
}

export function tag(name, attrs, children = "") {
  const a = serializeAttrs(attrs);
  if (children === null || children === undefined || children === "") {
    return `<${name}${a ? " " + a : ""}/>`;
  }
  return `<${name}${a ? " " + a : ""}>${children}</${name}>`;
}
