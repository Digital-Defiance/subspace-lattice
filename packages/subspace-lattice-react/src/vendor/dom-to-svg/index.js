import { renderBox, renderPseudo } from "./box.js";
import { buildClipPath, buildOverflowClip } from "./clip-path.js";
import { collectFontFaces } from "./fonts.js";
import { buildPaintTree, pseudoExists, markerExists } from "./stacking.js";
import { renderTextNode, renderReplacedText, renderMarker } from "./text.js";
import { renderImage, renderCanvas, renderInlineSvg, renderVideo } from "./media.js";
import {
  measureUntransformedRect,
  parseMatrix,
  isIdentityMatrix,
  parseTransformOrigin,
  matrixWithOrigin,
  matrixToSvg,
} from "./transform.js";
import {
  getBorderRadii,
  needsOverflowClip,
  relativeBox,
  shouldSkipElement,
  tag,
} from "./utils.js";

/**
 * Convert a DOM element subtree into a standalone SVG string (true vector mapping).
 *
 * @param {Element} root
 * @param {{ embedFonts?: boolean, expandOverflow?: boolean, rasterizeFonts?: boolean }} [options]
 * @returns {Promise<string>}
 */
export async function elementToSvg(root, options = {}) {
  if (!(root instanceof Element)) {
    throw new TypeError("elementToSvg: root must be an Element");
  }

  const restoreOverflow = options.expandOverflow !== false ? expandForCapture(root) : null;

  try {
    const rootRect = root.getBoundingClientRect();
    const width = Math.max(1, Math.ceil(Math.max(root.scrollWidth || 0, rootRect.width)));
    const height = Math.max(1, Math.ceil(Math.max(root.scrollHeight || 0, rootRect.height)));

    const captureRect = {
      left: rootRect.left,
      top: rootRect.top,
      width,
      height,
      right: rootRect.left + width,
      bottom: rootRect.top + height,
    };

    const defs = [];
    const tree = buildPaintTree(root);
    const body = tree ? await renderPaintNode(tree, captureRect, defs, true, options) : "";

    if (options.embedFonts !== false) {
      const fontCss = await collectFontFaces(root);
      if (fontCss) {
        defs.unshift(tag("style", { type: "text/css" }, `<![CDATA[\n${fontCss}\n]]>`));
      }
    }

    const defsBlock = defs.length ? tag("defs", {}, defs.join("")) : "";
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      tag(
        "svg",
        {
          xmlns: "http://www.w3.org/2000/svg",
          "xmlns:xlink": "http://www.w3.org/1999/xlink",
          width,
          height,
          viewBox: `0 0 ${width} ${height}`,
        },
        defsBlock + body
      ),
    ].join("\n");
  } finally {
    restoreOverflow?.();
  }
}

/**
 * Render one paint node.
 *
 * Opacity + overflow clip wrap (self + children).
 * Transform wraps ONLY this element's own chrome — children keep absolute
 * viewport coordinates that already include ancestor CSS transforms.
 */
async function renderPaintNode(node, rootRect, defs, isRoot = false, options = {}) {
  const { el, style, children } = node;
  if (!isRoot && shouldSkipElement(el, style)) return "";

  // Descendants of an inline <svg> are cloned with the svg — skip them here
  if (!isRoot && isInsideCopiedSvg(el)) return "";

  const tagName = el.tagName.toLowerCase();
  const matrix = parseMatrix(style.transform);
  const hasTransform = matrix && !isIdentityMatrix(matrix);

  // Own geometry: untransformed when we will re-apply matrix; else live rect
  const ownRect = hasTransform ? measureUntransformedRect(el) : el.getBoundingClientRect();
  const box = relativeBox(ownRect, rootRect);
  const radii = getBorderRadii(style, box.width, box.height);

  // Clip uses the painted (transformed) border box for overflow
  const clipRect = relativeBox(el.getBoundingClientRect(), rootRect);
  let clipUrl = null;
  const clip = buildClipPath(style, clipRect, defs);
  if (clip) clipUrl = clip.url;
  else if (needsOverflowClip(style)) {
    // Include root: overflow:hidden on the capture target must still clip children
    clipUrl = buildOverflowClip(clipRect, defs, radii);
  }

  const ownChunks = [];

  if (pseudoExists(el, "::before")) {
    ownChunks.push(renderPseudo(el, "::before", rootRect, defs, options));
  }
  if (markerExists(el)) {
    ownChunks.push(renderMarker(el, rootRect, options));
  }

  if (tagName === "svg") {
    ownChunks.push(renderInlineSvg(el, rootRect));
  } else {
    ownChunks.push(renderBox(el, style, rootRect, defs, { rect: ownRect }));

    // When we re-apply transform in SVG, measure text/replaced content with
    // transform disabled so coordinates match the untransformed box space.
    const restoreTf = hasTransform ? disableInlineTransform(el) : null;
    try {
      if (tagName === "img") {
        ownChunks.push(await renderImage(el, rootRect, defs));
      } else if (tagName === "canvas") {
        ownChunks.push(renderCanvas(el, rootRect));
      } else if (tagName === "video") {
        ownChunks.push(renderVideo(el, rootRect));
      } else if (tagName === "input" || tagName === "textarea" || tagName === "button") {
        ownChunks.push(renderReplacedText(el, style, rootRect, options));
        if (tagName === "input") ownChunks.push(renderInputDecoration(el, style, rootRect));
      } else {
        for (const child of el.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            ownChunks.push(renderTextNode(child, style, rootRect, options));
          }
        }
      }
    } finally {
      restoreTf?.();
    }

    if (pseudoExists(el, "::after")) {
      ownChunks.push(renderPseudo(el, "::after", rootRect, defs, options));
    }
  }

  let ownMarkup = ownChunks.filter(Boolean).join("");

  // Apply this element's transform only to its own chrome
  if (hasTransform && ownMarkup) {
    const { ox, oy } = parseTransformOrigin(style, box.width, box.height);
    const combined = matrixWithOrigin(matrix, box.x + ox, box.y + oy);
    const tf = matrixToSvg(combined);
    if (tf) ownMarkup = tag("g", { transform: tf }, ownMarkup);
  }

  // Children (skip if we cloned an svg)
  const childChunks = [];
  if (tagName !== "svg") {
    for (const child of children) {
      childChunks.push(await renderPaintNode(child, rootRect, defs, false, options));
    }
  }

  let combined = [ownMarkup, ...childChunks].filter(Boolean).join("");
  if (!combined) return "";

  // Clip wraps self + children (overflow / clip-path)
  if (clipUrl) combined = tag("g", { "clip-path": clipUrl }, combined);

  // Opacity wraps self + children (including root, so the export matches)
  const opacity = parseFloat(style.opacity);
  if (opacity < 1) {
    combined = tag("g", { opacity }, combined);
  }

  return combined;
}

function isInsideCopiedSvg(el) {
  const svg = el.closest("svg");
  if (!svg) return false;
  // The svg element itself is rendered via renderInlineSvg; its descendants skip
  return el !== svg;
}

function disableInlineTransform(el) {
  const inline = el.style;
  const prev = inline.getPropertyValue("transform");
  const prevPri = inline.getPropertyPriority("transform");
  inline.setProperty("transform", "none", "important");
  return () => {
    if (prev) inline.setProperty("transform", prev, prevPri);
    else inline.removeProperty("transform");
  };
}

function expandForCapture(root) {
  const style = root.style;
  const prev = {
    overflow: style.overflow,
    overflowX: style.overflowX,
    overflowY: style.overflowY,
    height: style.height,
    maxHeight: style.maxHeight,
    width: style.width,
    maxWidth: style.maxWidth,
  };

  const cs = window.getComputedStyle(root);
  const scrollable = (v) => v === "auto" || v === "scroll" || v === "overlay";
  const canExpand =
    scrollable(cs.overflow) ||
    scrollable(cs.overflowX) ||
    scrollable(cs.overflowY);

  // Only expand scrollable (auto/scroll) roots — overflow:hidden must stay clipped
  if (
    !canExpand ||
    (root.scrollHeight <= root.clientHeight + 1 && root.scrollWidth <= root.clientWidth + 1)
  ) {
    return null;
  }

  style.setProperty("overflow", "visible", "important");
  style.setProperty("overflow-x", "visible", "important");
  style.setProperty("overflow-y", "visible", "important");
  style.height = `${root.scrollHeight}px`;
  style.maxHeight = "none";
  style.width = `${Math.max(root.scrollWidth, root.clientWidth)}px`;
  style.maxWidth = "none";

  return () => {
    style.overflow = prev.overflow;
    style.overflowX = prev.overflowX;
    style.overflowY = prev.overflowY;
    style.height = prev.height;
    style.maxHeight = prev.maxHeight;
    style.width = prev.width;
    style.maxWidth = prev.maxWidth;
  };
}

function renderInputDecoration(el, style, rootRect) {
  const type = (el.type || "text").toLowerCase();
  if (type !== "checkbox" && type !== "radio") return "";
  if (!el.checked) return "";

  const rect = el.getBoundingClientRect();
  const box = relativeBox(rect, rootRect);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  if (type === "radio") {
    return tag("circle", {
      cx,
      cy,
      r: Math.min(box.width, box.height) * 0.25,
      fill: style.accentColor || style.color || "#000",
    });
  }

  const s = Math.min(box.width, box.height);
  const d = [
    `M ${box.x + s * 0.2} ${box.y + s * 0.5}`,
    `L ${box.x + s * 0.42} ${box.y + s * 0.7}`,
    `L ${box.x + s * 0.78} ${box.y + s * 0.28}`,
  ].join(" ");
  return tag("path", {
    d,
    fill: "none",
    stroke: style.accentColor || style.color || "#000",
    "stroke-width": Math.max(1.5, s * 0.12),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });
}
