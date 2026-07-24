import { shapeElement, renderBorders } from "./borders.js";
import {
  formatSvgFontFamily,
  rasterizeTextLine,
  resolveSvgFontFamily,
  shouldRasterizeText,
} from "./fonts.js";
import { backgroundLayers, renderBackgroundLayers } from "./gradients.js";
import {
  getBorderRadii,
  isTransparent,
  parseColor,
  relativeBox,
  tag,
  uid,
  parseLength,
} from "./utils.js";

/**
 * Render element background + border (the "box" chrome).
 */
export function renderBox(el, style, rootRect, defs, options = {}) {
  const rect = options.rect || el.getBoundingClientRect();
  const box = relativeBox(rect, rootRect);
  if (box.width <= 0 && box.height <= 0) return "";

  const radii = getBorderRadii(style, box.width, box.height);
  const parts = [];

  const filterUrl = maybeBoxShadow(style, defs);
  const bgColor = parseColor(style.backgroundColor);
  const layers = backgroundLayers(style);

  const shapeFn = (attrs) =>
    shapeElement(box.x, box.y, box.width, box.height, radii, {
      ...attrs,
      ...(filterUrl && !attrs.filter ? { filter: filterUrl } : {}),
    });

  // Solid background color (below image layers per CSS)
  if (bgColor) {
    parts.push(
      shapeElement(box.x, box.y, box.width, box.height, radii, {
        fill: bgColor,
        ...(filterUrl ? { filter: filterUrl } : {}),
      })
    );
  }

  if (layers.length) {
    parts.push(
      renderBackgroundLayers(style, box, radii, shapeFn, defs)
    );
  } else if (!bgColor && filterUrl) {
    // shadow-only still needs a shape for feDropShadow to attach to — skip transparent
  }

  const borders = renderBorders(box.x, box.y, box.width, box.height, radii, style);
  if (borders) parts.push(borders);

  const outlineW = parseFloat(style.outlineWidth) || 0;
  if (outlineW > 0 && style.outlineStyle !== "none" && !isTransparent(style.outlineColor)) {
    const off = parseFloat(style.outlineOffset) || 0;
    const o = outlineW / 2 + off;
    parts.push(
      shapeElement(box.x - o, box.y - o, box.width + o * 2, box.height + o * 2, radii, {
        fill: "none",
        stroke: style.outlineColor,
        "stroke-width": outlineW,
      })
    );
  }

  return parts.join("");
}

function maybeBoxShadow(style, defs) {
  const shadow = style.boxShadow;
  if (!shadow || shadow === "none") return null;

  // Support multiple shadows — compose feDropShadows (first non-inset only for simplicity:
  // SVG filters can chain; we chain up to 3 non-inset shadows)
  const shadows = splitShadows(shadow).filter((s) => !s.inset).slice(0, 3);
  if (!shadows.length) return null;

  const id = uid("shadow");
  let filterBody = "";
  let input = "SourceAlpha";
  const merges = [];

  shadows.forEach((s, i) => {
    const blur = `blur${i}`;
    const offset = `offset${i}`;
    const flood = `flood${i}`;
    const comp = `comp${i}`;
    filterBody += tag("feGaussianBlur", { in: i === 0 ? "SourceAlpha" : "SourceAlpha", stdDeviation: Math.max(0, s.blur / 2), result: blur });
    filterBody += tag("feOffset", { in: blur, dx: s.dx, dy: s.dy, result: offset });
    filterBody += tag("feFlood", { "flood-color": s.color, result: flood });
    filterBody += tag("feComposite", { in: flood, in2: offset, operator: "in", result: comp });
    merges.push(comp);
    void input;
  });
  merges.push("SourceGraphic");
  const mergeNodes = merges.map((r) => tag("feMergeNode", { in: r })).join("");
  filterBody += tag("feMerge", {}, mergeNodes);

  defs.push(
    tag("filter", { id, x: "-50%", y: "-50%", width: "200%", height: "200%" }, filterBody)
  );
  return `url(#${id})`;
}

/** Exported for tests */
export function splitShadows(shadow) {
  const parts = [];
  let cur = "";
  let depth = 0;
  for (const ch of shadow) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());

  return parts.map((p) => {
    const inset = /\binset\b/i.test(p);
    const colorMatch =
      p.match(/(rgba?\([^)]+\)|hsla?\([^)]+\)|\#[0-9a-fA-F]{3,8}|\b[a-z]+\b)\s*$/i) ||
      p.match(/(rgba?\([^)]+\)|hsla?\([^)]+\)|\#[0-9a-fA-F]{3,8})/i);
    const color = colorMatch ? colorMatch[1] : "rgba(0,0,0,0.3)";
    const nums = [...p.matchAll(/-?[\d.]+px/g)].map((m) => parseFloat(m[0]));
    return {
      inset,
      dx: nums[0] || 0,
      dy: nums[1] || 0,
      blur: nums[2] || 0,
      spread: nums[3] || 0,
      color,
    };
  });
}

/**
 * Render ::before / ::after as an extra box + optional text content.
 * @param {{ rasterizeFonts?: boolean }} [options]
 */
export function renderPseudo(el, which, rootRect, defs, options = {}) {
  const style = window.getComputedStyle(el, which);
  const content = style.content;
  if (!content || content === "none" || content === "normal") return "";

  const parentRect = el.getBoundingClientRect();
  const w = parseLength(style.width, parentRect.width) || 0;
  const h = parseLength(style.height, parentRect.height) || 0;

  const text = parseCssContent(content);
  if (w <= 0 && h <= 0 && isTransparent(style.backgroundColor) && style.backgroundImage === "none" && !text) {
    return "";
  }

  const fakeRect = {
    left: parentRect.left,
    top: parentRect.top,
    width: w || (text ? parentRect.width : 0) || 0,
    height: h || (text ? parseLength(style.fontSize) || 16 : 0),
    right: 0,
    bottom: 0,
  };

  if (style.position === "absolute" || style.position === "relative") {
    const top = style.top !== "auto" ? parseLength(style.top, parentRect.height) : 0;
    const left = style.left !== "auto" ? parseLength(style.left, parentRect.width) : 0;
    const right = style.right !== "auto" ? parseLength(style.right, parentRect.width) : null;
    const bottom = style.bottom !== "auto" ? parseLength(style.bottom, parentRect.height) : null;
    fakeRect.left += left;
    fakeRect.top += top;
    if (right != null && style.left === "auto") {
      fakeRect.left = parentRect.right - right - fakeRect.width;
    }
    if (bottom != null && style.top === "auto") {
      fakeRect.top = parentRect.bottom - bottom - fakeRect.height;
    }
  }

  if (fakeRect.width <= 0 && fakeRect.height <= 0 && !text) return "";

  const parts = [];
  if (fakeRect.width > 0 || fakeRect.height > 0) {
    parts.push(renderBox(el, style, rootRect, defs, { rect: fakeRect }));
  }

  if (text) {
    const box = relativeBox(fakeRect, rootRect);
    const fontSize = parseLength(style.fontSize) || 16;
    const family = resolveSvgFontFamily(style);
    if (options.rasterizeFonts && shouldRasterizeText(text, style, family)) {
      const img = rasterizeTextLine(
        {
          text,
          x: fakeRect.left,
          y: fakeRect.top,
          width: fakeRect.width || fontSize,
          height: fakeRect.height || fontSize * 1.4,
        },
        style,
        rootRect,
        family
      );
      if (img) {
        parts.push(img);
        return parts.join("");
      }
    }
    parts.push(
      tag(
        "text",
        {
          x: box.x,
          y: box.y + fontSize * 0.8,
          fill: style.color || "#000",
          "font-size": fontSize,
          "font-family": formatSvgFontFamily(family),
          "font-weight": style.fontWeight || "normal",
        },
        escapeXml(text)
      )
    );
  }

  return parts.join("");
}

function parseCssContent(content) {
  const m = content.match(/^["'](.*)["']$/s);
  if (m) return m[1].replace(/\\([n"\\])/g, (_, c) => (c === "n" ? "\n" : c));
  if (content === "open-quote") return "\u201C";
  if (content === "close-quote") return "\u201D";
  return "";
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
