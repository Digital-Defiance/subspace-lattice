import {
  formatSvgFontFamily,
  rasterizeTextLine,
  resolveSvgFontFamily,
  shouldRasterizeText,
} from "./fonts.js";
import { escText, parseLength, tag } from "./utils.js";

/**
 * Measure wrapped text lines using Range.getClientRects().
 * Returns [{ text, x, y, width, height }] in viewport coordinates.
 */
export function measureTextLinesFast(textNode) {
  const text = textNode.nodeValue;
  if (!text || !/\S/.test(text)) return [];

  const range = document.createRange();
  range.selectNodeContents(textNode);
  const rects = [...range.getClientRects()].filter((r) => r.width > 0 || r.height > 0);
  if (!rects.length) return [];

  const lines = [];
  let cursor = 0;

  for (const rect of rects) {
    let start = cursor;
    while (start < text.length) {
      range.setStart(textNode, start);
      range.setEnd(textNode, start + 1);
      const cr = range.getClientRects()[0];
      if (cr && overlapsLine(cr, rect)) break;
      start++;
    }

    let end = start;
    while (end < text.length) {
      range.setStart(textNode, end);
      range.setEnd(textNode, end + 1);
      const cr = range.getClientRects()[0];
      if (!cr || !overlapsLine(cr, rect)) break;
      end++;
    }

    // Skip pure newline-only advances
    if (end === start && text[start] === "\n") {
      cursor = start + 1;
      continue;
    }

    const slice = text.slice(start, end);
    if (slice.length) {
      lines.push({
        text: slice,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    }
    cursor = Math.max(end, cursor);
  }

  return lines;
}

function overlapsLine(a, b) {
  const mid = (a.top + a.bottom) / 2;
  return mid >= b.top - 0.5 && mid <= b.bottom + 0.5;
}

/**
 * Convert text node to SVG <text> elements (one per visual line).
 * @param {{ rasterizeFonts?: boolean }} [options]
 */
export function renderTextNode(textNode, style, rootRect, options = {}) {
  const lines = measureTextLinesFast(textNode);
  if (!lines.length) return "";

  const fill = style.color || "#000";
  const fontSize = parseLength(style.fontSize) || 16;
  const fontFamily = resolveSvgFontFamily(style);
  const fontFamilyAttr = formatSvgFontFamily(fontFamily);
  const fontWeight = style.fontWeight || "normal";
  const fontStyle = style.fontStyle || "normal";
  const letterSpacing = style.letterSpacing === "normal" ? null : style.letterSpacing;
  const textDecoration = style.textDecorationLine || style.textDecoration || "none";
  const textAnchor = mapTextAlign(style.textAlign, style.direction);
  const baseline = style.dominantBaseline || null;
  void baseline;

  const parts = [];

  for (const line of lines) {
    const content = prepareText(line.text, style);
    if (!content) continue;

    const displayText = applyTextTransform(content, style.textTransform);
    const lineForPaint = { ...line, text: displayText };

    if (options.rasterizeFonts && shouldRasterizeText(displayText, style, fontFamily)) {
      const img = rasterizeTextLine(lineForPaint, style, rootRect, fontFamily);
      if (img) {
        parts.push(img);
        continue;
      }
    }

    const metrics = measureBaseline(textNode, line, style, fontSize);
    let x = line.x - rootRect.left;
    const y = metrics.baseline - rootRect.top;

    // text-anchor adjustment
    if (textAnchor === "middle") x += line.width / 2;
    else if (textAnchor === "end") x += line.width;

    const attrs = {
      x: round(x),
      y: round(y),
      fill,
      "font-size": fontSize,
      "font-family": fontFamilyAttr,
      "font-weight": fontWeight,
      "font-style": fontStyle,
      "xml:space": "preserve",
    };
    if (letterSpacing) attrs["letter-spacing"] = letterSpacing;
    if (textAnchor && textAnchor !== "start") attrs["text-anchor"] = textAnchor;

    let textEl = tag("text", attrs, escText(displayText));

    if (textDecoration.includes("underline")) {
      const uy = y + Math.max(1, fontSize * 0.08);
      textEl += tag("line", {
        x1: round(line.x - rootRect.left),
        y1: round(uy),
        x2: round(line.x - rootRect.left + line.width),
        y2: round(uy),
        stroke: fill,
        "stroke-width": Math.max(1, fontSize * 0.06),
      });
    }
    if (textDecoration.includes("line-through")) {
      const my = y - fontSize * 0.3;
      textEl += tag("line", {
        x1: round(line.x - rootRect.left),
        y1: round(my),
        x2: round(line.x - rootRect.left + line.width),
        y2: round(my),
        stroke: fill,
        "stroke-width": Math.max(1, fontSize * 0.06),
      });
    }

    parts.push(textEl);
  }

  return parts.join("");
}

function prepareText(text, style) {
  const whiteSpace = style.whiteSpace || "normal";
  if (whiteSpace === "pre" || whiteSpace === "pre-wrap" || whiteSpace === "break-spaces") {
    return text;
  }
  if (!/\S/.test(text)) return "";
  return text;
}

function applyTextTransform(text, transform) {
  if (!transform || transform === "none") return text;
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  if (transform === "capitalize") {
    return text.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return text;
}

function mapTextAlign(align, direction) {
  if (align === "center") return "middle";
  if (align === "right") return "end";
  if (align === "left") return "start";
  if (align === "end") return direction === "rtl" ? "start" : "end";
  if (align === "start") return direction === "rtl" ? "end" : "start";
  return "start";
}

/**
 * Prefer Canvas TextMetrics / Range for accurate baseline.
 */
function measureBaseline(textNode, line, style, fontSize) {
  // Try first glyph metrics via Range + getClientRects; approximate alphabetic baseline
  // as top + (height * ascentRatio). Use canvas when available for tighter fit.
  try {
    const canvas = measureBaseline._canvas || (measureBaseline._canvas = document.createElement("canvas"));
    const ctx = canvas.getContext("2d");
    ctx.font = `${style.fontStyle || "normal"} ${style.fontWeight || "normal"} ${fontSize}px ${style.fontFamily || "sans-serif"}`;
    const sample = line.text.trim() || "M";
    const m = ctx.measureText(sample);
    if (m.actualBoundingBoxAscent != null && m.actualBoundingBoxAscent > 0) {
      return { baseline: line.y + m.actualBoundingBoxAscent };
    }
    if (m.fontBoundingBoxAscent != null && m.fontBoundingBoxAscent > 0) {
      return { baseline: line.y + m.fontBoundingBoxAscent };
    }
  } catch {
    /* ignore */
  }
  // Fallback: ~80% of font-size from top of line box is wrong for large line-height;
  // use line box and assume content sits with ascent ≈ 0.8em from content top.
  // Better: baseline ≈ line.y + (line.height + fontSize) / 2 - fontSize * 0.2 — fragile.
  // Use: top + fontSize * 0.8 when line.height ≈ fontSize; else center glyph in line box.
  const lineHeight = line.height || fontSize;
  if (lineHeight > fontSize * 1.2) {
    // vertically centered-ish content in line box
    return { baseline: line.y + (lineHeight + fontSize * 0.6) / 2 };
  }
  return { baseline: line.y + fontSize * 0.8 };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Render text for replaced form controls.
 * @param {{ rasterizeFonts?: boolean }} [options]
 */
export function renderReplacedText(el, style, rootRect, options = {}) {
  const tagName = el.tagName.toLowerCase();
  let value = "";
  if (tagName === "input") {
    const type = (el.type || "text").toLowerCase();
    if (["checkbox", "radio", "file", "hidden", "image"].includes(type)) return "";
    if (["button", "submit", "reset"].includes(type)) {
      value = el.value || "";
    } else {
      value = el.value || "";
    }
  } else if (tagName === "textarea") {
    value = el.value || "";
  } else if (tagName === "button") {
    // button may have element children — only use if no element children
    if (el.children.length) return "";
    value = el.textContent || "";
  } else {
    return "";
  }

  if (!value) return "";

  const rect = el.getBoundingClientRect();
  const fontSize = parseLength(style.fontSize) || 16;
  const padL = parseLength(style.paddingLeft) || 0;
  const padT = parseLength(style.paddingTop) || 0;
  const x = rect.left - rootRect.left + padL;
  const y = rect.top - rootRect.top + padT + fontSize * 0.8;

  const family = resolveSvgFontFamily(style);
  if (options.rasterizeFonts && shouldRasterizeText(value, style, family)) {
    const img = rasterizeTextLine(
      { text: value, x: rect.left + padL, y: rect.top + padT, width: rect.width, height: rect.height },
      style,
      rootRect,
      family
    );
    if (img) return img;
  }

  return tag(
    "text",
    {
      x: round(x),
      y: round(y),
      fill: style.color || "#000",
      "font-size": fontSize,
      "font-family": formatSvgFontFamily(family),
      "font-weight": style.fontWeight || "normal",
      "font-style": style.fontStyle || "normal",
      "xml:space": "preserve",
    },
    escText(value)
  );
}

/**
 * Render ::marker for list items.
 * @param {{ rasterizeFonts?: boolean }} [options]
 */
export function renderMarker(el, rootRect, options = {}) {
  const style = window.getComputedStyle(el, "::marker");
  const content = style.content;
  let text = "";

  if (content && content !== "none" && content !== "normal") {
    const m = content.match(/^["'](.*)["']$/s);
    text = m ? m[1] : "";
  }

  // For numeric markers, content may be empty in some engines — use list value
  if (!text && el.tagName.toLowerCase() === "li") {
    // Approximate: use getClientRects of marker if available — fall back to index
    const list = el.parentElement;
    if (list) {
      const items = [...list.children].filter((c) => c.tagName.toLowerCase() === "li");
      const idx = items.indexOf(el);
      const listStyle = window.getComputedStyle(list).listStyleType || style.listStyleType;
      text = formatListMarker(idx, listStyle || style.listStyleType);
    }
  }

  if (!text) return "";

  // Position: marker is to the left of the principal box
  const rect = el.getBoundingClientRect();
  const fontSize = parseLength(style.fontSize) || parseLength(window.getComputedStyle(el).fontSize) || 16;
  // Rough placement — hanging outside padding edge
  const x = rect.left - rootRect.left - fontSize * 1.2;
  const y = rect.top - rootRect.top + fontSize * 0.8;

  const family = resolveSvgFontFamily(style);
  if (options.rasterizeFonts && shouldRasterizeText(text, style, family)) {
    const img = rasterizeTextLine(
      {
        text,
        x: rect.left - fontSize * 1.2,
        y: rect.top,
        width: fontSize * 1.5,
        height: fontSize * 1.4,
      },
      style,
      rootRect,
      family
    );
    if (img) return img;
  }

  return tag(
    "text",
    {
      x: round(x),
      y: round(y),
      fill: style.color || window.getComputedStyle(el).color || "#000",
      "font-size": fontSize,
      "font-family": formatSvgFontFamily(family),
      "xml:space": "preserve",
    },
    escText(text)
  );
}

export function formatListMarker(index, listStyleType) {
  const n = index + 1;
  switch (listStyleType) {
    case "decimal":
    case "decimal-leading-zero":
      return `${n}.`;
    case "lower-alpha":
    case "lower-latin":
      return `${toAlpha(index).toLowerCase()}.`;
    case "upper-alpha":
    case "upper-latin":
      return `${toAlpha(index).toUpperCase()}.`;
    case "lower-roman":
      return `${toRoman(n).toLowerCase()}.`;
    case "upper-roman":
      return `${toRoman(n).toUpperCase()}.`;
    case "disc":
      return "•";
    case "circle":
      return "◦";
    case "square":
      return "▪";
    case "none":
      return "";
    default:
      return `${n}.`;
  }
}

function toAlpha(i) {
  let n = i;
  let s = "";
  do {
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function toRoman(num) {
  const map = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let n = num;
  let out = "";
  for (const [v, s] of map) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}
