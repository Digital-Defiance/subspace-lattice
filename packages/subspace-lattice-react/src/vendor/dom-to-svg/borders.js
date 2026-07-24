import { tag } from "./utils.js";

/**
 * Build an SVG path for a rounded rectangle with per-corner elliptical radii.
 * Uses absolute Arc commands. Coordinates are relative to (x, y).
 *
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {{ tl: {rx:number,ry:number}, tr: {rx:number,ry:number}, br: {rx:number,ry:number}, bl: {rx:number,ry:number} }} radii
 */
export function roundedRectPath(x, y, w, h, radii) {
  const { tl, tr, br, bl } = radii;

  const arc = (rx, ry, x2, y2) => {
    if (rx <= 0 || ry <= 0) return `L ${x2} ${y2}`;
    return `A ${rx} ${ry} 0 0 1 ${x2} ${y2}`;
  };

  // Start after top-left corner on top edge
  let d = `M ${x + tl.rx} ${y}`;
  d += ` L ${x + w - tr.rx} ${y}`;
  d += ` ${arc(tr.rx, tr.ry, x + w, y + tr.ry)}`;
  d += ` L ${x + w} ${y + h - br.ry}`;
  d += ` ${arc(br.rx, br.ry, x + w - br.rx, y + h)}`;
  d += ` L ${x + bl.rx} ${y + h}`;
  d += ` ${arc(bl.rx, bl.ry, x, y + h - bl.ry)}`;
  d += ` L ${x} ${y + tl.ry}`;
  d += ` ${arc(tl.rx, tl.ry, x + tl.rx, y)}`;
  d += " Z";
  return d;
}

/**
 * Render a filled / stroked rounded shape.
 * Uses <rect> when radii are uniform circular; otherwise <path>.
 */
export function shapeElement(x, y, w, h, radii, attrs = {}) {
  const { tl, tr, br, bl } = radii;
  const anyRadius = tl.rx || tr.rx || br.rx || bl.rx || tl.ry || tr.ry || br.ry || bl.ry;
  const uniform =
    tl.rx === tr.rx &&
    tr.rx === br.rx &&
    br.rx === bl.rx &&
    tl.ry === tr.ry &&
    tr.ry === br.ry &&
    br.ry === bl.ry &&
    tl.rx === tl.ry;

  if (!anyRadius || uniform) {
    return tag("rect", {
      x,
      y,
      width: w,
      height: h,
      ...(anyRadius ? { rx: tl.rx, ry: tl.ry } : {}),
      ...attrs,
    });
  }

  return tag("path", {
    d: roundedRectPath(x, y, w, h, radii),
    ...attrs,
  });
}

/**
 * Approximate CSS borders as four sides (or a single stroke when uniform).
 * For non-uniform radius + borders we fill the border area as a path ring.
 */
export function borderStrokeAttrs(style) {
  const widths = {
    t: parseFloat(style.borderTopWidth) || 0,
    r: parseFloat(style.borderRightWidth) || 0,
    b: parseFloat(style.borderBottomWidth) || 0,
    l: parseFloat(style.borderLeftWidth) || 0,
  };
  const colors = {
    t: style.borderTopColor,
    r: style.borderRightColor,
    b: style.borderBottomColor,
    l: style.borderLeftColor,
  };
  const styles = {
    t: style.borderTopStyle,
    r: style.borderRightStyle,
    b: style.borderBottomStyle,
    l: style.borderLeftStyle,
  };

  const visible = (side) =>
    widths[side] > 0 && styles[side] !== "none" && styles[side] !== "hidden";

  const sides = ["t", "r", "b", "l"].filter(visible);
  if (!sides.length) return null;

  const uniform =
    sides.length === 4 &&
    widths.t === widths.r &&
    widths.r === widths.b &&
    widths.b === widths.l &&
    colors.t === colors.r &&
    colors.r === colors.b &&
    colors.b === colors.l &&
    styles.t === styles.r &&
    styles.r === styles.b &&
    styles.b === styles.l;

  return { widths, colors, styles, sides, uniform };
}

/** Inset radii for the inner edge of a border ring. */
export function insetRadii(radii, widths) {
  const shrink = (c, wx, wy) => ({
    rx: Math.max(0, c.rx - wx),
    ry: Math.max(0, c.ry - wy),
  });
  return {
    tl: shrink(radii.tl, widths.l, widths.t),
    tr: shrink(radii.tr, widths.r, widths.t),
    br: shrink(radii.br, widths.r, widths.b),
    bl: shrink(radii.bl, widths.l, widths.b),
  };
}

/**
 * Draw borders. Prefers a single stroke when uniform; otherwise a filled
 * evenodd path (outer rounded rect minus inner) or four edge paths.
 */
export function renderBorders(x, y, w, h, radii, style) {
  const info = borderStrokeAttrs(style);
  if (!info) return "";

  const { widths, colors, uniform } = info;

  if (uniform) {
    const bw = widths.t;
    // Stroke is centered on the path; inset by half border width.
    const hx = x + bw / 2;
    const hy = y + bw / 2;
    const hw = Math.max(0, w - bw);
    const hh = Math.max(0, h - bw);
    const hr = {
      tl: { rx: Math.max(0, radii.tl.rx - bw / 2), ry: Math.max(0, radii.tl.ry - bw / 2) },
      tr: { rx: Math.max(0, radii.tr.rx - bw / 2), ry: Math.max(0, radii.tr.ry - bw / 2) },
      br: { rx: Math.max(0, radii.br.rx - bw / 2), ry: Math.max(0, radii.br.ry - bw / 2) },
      bl: { rx: Math.max(0, radii.bl.rx - bw / 2), ry: Math.max(0, radii.bl.ry - bw / 2) },
    };
    return shapeElement(hx, hy, hw, hh, hr, {
      fill: "none",
      stroke: colors.t,
      "stroke-width": bw,
    });
  }

  // Non-uniform: evenodd ring
  const inner = insetRadii(radii, widths);
  const ix = x + widths.l;
  const iy = y + widths.t;
  const iw = Math.max(0, w - widths.l - widths.r);
  const ih = Math.max(0, h - widths.t - widths.b);
  const outerD = roundedRectPath(x, y, w, h, radii);
  const innerD = roundedRectPath(ix, iy, iw, ih, inner);

  // If colors differ per side, approximate with dominant / top color for the ring.
  // Per-side color accuracy would need four separate trapezoids.
  const fill = colors.t || colors.r || colors.b || colors.l;
  return tag("path", {
    d: `${outerD} ${innerD}`,
    fill,
    "fill-rule": "evenodd",
  });
}
