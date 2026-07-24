/**
 * Matrix helpers for CSS → SVG transforms.
 * CSS matrix(a,b,c,d,e,f) maps to SVG matrix(a b c d e f).
 */

export function parseMatrix(transform) {
  if (!transform || transform === "none") return null;

  const m3 = transform.match(/matrix3d\(([^)]+)\)/i);
  if (m3) {
    const v = m3[1].split(",").map((n) => parseFloat(n.trim()));
    if (v.length < 16) return null;
    return { a: v[0], b: v[1], c: v[4], d: v[5], e: v[12], f: v[13] };
  }

  const m2 = transform.match(/matrix\(([^)]+)\)/i);
  if (m2) {
    const v = m2[1].split(",").map((n) => parseFloat(n.trim()));
    if (v.length < 6) return null;
    return { a: v[0], b: v[1], c: v[2], d: v[3], e: v[4], f: v[5] };
  }

  return null;
}

export function isIdentityMatrix(m) {
  if (!m) return true;
  return m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0;
}

export function matrixToSvg(m) {
  if (!m || isIdentityMatrix(m)) return null;
  return `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
}

/** Multiply 2D matrices: result = A × B (apply B first, then A). */
export function multiply(A, B) {
  return {
    a: A.a * B.a + A.c * B.b,
    b: A.b * B.a + A.d * B.b,
    c: A.a * B.c + A.c * B.d,
    d: A.b * B.c + A.d * B.d,
    e: A.a * B.e + A.c * B.f + A.e,
    f: A.b * B.e + A.d * B.f + A.f,
  };
}

export function translateMatrix(tx, ty) {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

/**
 * CSS transform is applied around transform-origin.
 * SVG equivalent: T(origin) × M × T(-origin)
 */
export function matrixWithOrigin(m, originX, originY) {
  if (!m || isIdentityMatrix(m)) return null;
  return multiply(translateMatrix(originX, originY), multiply(m, translateMatrix(-originX, -originY)));
}

/**
 * Measure element's border-box as if it had transform:none,
 * while keeping ancestor transforms intact.
 */
export function measureUntransformedRect(el) {
  const inline = el.style;
  const prevTransform = inline.getPropertyValue("transform");
  const prevPriority = inline.getPropertyPriority("transform");
  inline.setProperty("transform", "none", "important");

  let rect;
  try {
    rect = el.getBoundingClientRect();
  } finally {
    if (prevTransform) {
      inline.setProperty("transform", prevTransform, prevPriority);
    } else {
      inline.removeProperty("transform");
    }
  }
  return rect;
}

/**
 * Parse transform-origin into px relative to the untransformed border box.
 */
export function parseTransformOrigin(style, width, height, fontSize = 16) {
  const raw = style.transformOrigin || "50% 50%";
  const parts = raw.trim().split(/\s+/);
  const parse = (token, ref) => {
    if (token === "left" || token === "top") return 0;
    if (token === "right" || token === "bottom") return ref;
    if (token === "center") return ref / 2;
    if (token.endsWith("%")) return (parseFloat(token) / 100) * ref;
    return parseFloat(token) || 0;
  };
  const ox = parse(parts[0] || "50%", width);
  const oy = parse(parts[1] || "50%", height);
  void fontSize;
  return { ox, oy };
}

/**
 * Build SVG transform attribute for an element, using untransformed box
 * position in root space as the basis for origin.
 */
export function elementSvgTransform(el, style, untransformedBox, rootRect) {
  const m = parseMatrix(style.transform);
  if (!m || isIdentityMatrix(m)) return null;

  const { ox, oy } = parseTransformOrigin(style, untransformedBox.width, untransformedBox.height);
  // Origin in root-relative coordinates
  const originX = untransformedBox.left - rootRect.left + ox;
  const originY = untransformedBox.top - rootRect.top + oy;

  // CSS matrix e,f are already in px; combined with origin dance
  const combined = matrixWithOrigin(m, originX, originY);
  return matrixToSvg(combined);
}
