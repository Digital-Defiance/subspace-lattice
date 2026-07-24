/**
 * Font helpers for Illustrator-safe SVG export.
 * Avoid CSS system keywords / unembedded stacks; prefer embeddable @font-face files (ttf/otf over woff2).
 */

const CSS_FONT_KEYWORDS = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

/** Names Illustrator often errors on when referenced but not installed/embedded. */
const ILLUSTRATOR_HOSTILE = new Set([
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "-apple-system",
  "blinkmacsystemfont",
  "segoe ui",
  "segoe ui symbol",
  "segoe ui emoji",
  "segoe ui historic",
  "san francisco",
  ".sf ns text",
  ".sf ns display",
  "helvetica neue",
]);

const FORMAT_PREFERENCE = ["truetype", "opentype", "woff", "woff2"];

export function parseFontStack(fontFamily) {
  if (!fontFamily) return [];
  const out = [];
  const re = /(?:^|,)\s*(?:"([^"]+)"|'([^']+)'|([^,]+))/g;
  let m;
  while ((m = re.exec(fontFamily))) {
    const name = (m[1] || m[2] || m[3] || "").trim();
    if (name) out.push(name);
  }
  return out;
}

export function isCssFontKeyword(family) {
  return CSS_FONT_KEYWORDS.has(String(family).trim().toLowerCase());
}

function isHostile(family) {
  return ILLUSTRATOR_HOSTILE.has(String(family).trim().toLowerCase());
}

/** Quote a family for an SVG/CSS font-family value. */
export function formatSvgFontFamily(family) {
  const name = String(family || "sans-serif").trim();
  if (isCssFontKeyword(name)) return name;
  if (/^[a-zA-Z][\w-]*$/.test(name)) return name;
  return `'${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function fontAvailable(family, style) {
  if (typeof document === "undefined" || !document.fonts?.check) return true;
  const size = style.fontSize || "16px";
  const weight = style.fontWeight || "normal";
  const fontStyle = style.fontStyle || "normal";
  try {
    return document.fonts.check(`${fontStyle} ${weight} ${size} "${family}"`);
  } catch {
    return true;
  }
}

/** Family names declared via @font-face in accessible stylesheets. */
export function listEmbeddableFontFamilies() {
  const names = new Set();
  if (typeof document === "undefined") return names;
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    if (!rules) continue;
    for (const rule of rules) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style.fontFamily?.replace(/["']/g, "").trim();
      if (family) names.add(family.toLowerCase());
    }
  }
  return names;
}

/**
 * Pick a single Illustrator-safe family from the computed stack.
 * Prefers @font-face (embeddable) fonts, skips system keywords / hostile names.
 */
export function resolveSvgFontFamily(style) {
  const stack = parseFontStack(style?.fontFamily || "");
  const embeddable = listEmbeddableFontFamilies();

  for (const family of stack) {
    if (isCssFontKeyword(family) || isHostile(family)) continue;
    if (embeddable.has(family.toLowerCase()) && fontAvailable(family, style)) {
      return family;
    }
  }

  for (const family of stack) {
    if (isCssFontKeyword(family) || isHostile(family)) continue;
    if (fontAvailable(family, style)) return family;
  }

  for (const family of stack) {
    if (!isCssFontKeyword(family) && !isHostile(family)) return family;
  }

  return "sans-serif";
}

/**
 * True when drawing `text` with only `family` differs from the full CSS stack
 * (glyph came from a fallback face — e.g. chess symbols).
 */
export function textUsesFontFallback(text, style, family) {
  if (!text || typeof document === "undefined") return false;
  const sample = text.replace(/\s+/g, "");
  if (!sample) return false;

  const size = style.fontSize || "16px";
  const weight = style.fontWeight || "normal";
  const fontStyle = style.fontStyle || "normal";
  const full = style.fontFamily || "sans-serif";

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  ctx.font = `${fontStyle} ${weight} ${size} ${full}`;
  const fullW = ctx.measureText(sample).width;
  ctx.font = `${fontStyle} ${weight} ${size} ${formatSvgFontFamily(family)}, sans-serif`;
  const aloneW = ctx.measureText(sample).width;

  return Math.abs(fullW - aloneW) > 0.75;
}

/** Chess / symbols / PUA — often system-fallback glyphs Illustrator cannot resolve. */
export function textHasFallbackProneGlyphs(text) {
  if (!text) return false;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x2190 && cp <= 0x21FF) return true; // arrows
    if (cp >= 0x2300 && cp <= 0x23FF) return true; // misc technical
    if (cp >= 0x2460 && cp <= 0x24FF) return true; // enclosed alphanumerics
    if (cp >= 0x2600 && cp <= 0x27BF) return true; // misc symbols + dingbats (chess)
    if (cp >= 0x2B00 && cp <= 0x2BFF) return true; // misc symbols and arrows
    if (cp >= 0xE000 && cp <= 0xF8FF) return true; // PUA
    if (cp >= 0x1F000 && cp <= 0x1FFFF) return true; // chess ext, cards, emoji…
  }
  return false;
}

/**
 * Whether this run should become an <image> when rasterizeFonts is enabled.
 */
export function shouldRasterizeText(text, style, family) {
  return textUsesFontFallback(text, style, family) || textHasFallbackProneGlyphs(text);
}

/**
 * Rasterize a text line as an SVG <image> so Illustrator does not need the glyph font.
 * Coordinates are viewport-space; converted relative to rootRect.
 */
export function rasterizeTextLine(line, style, rootRect, family) {
  const text = line.text;
  if (!text || typeof document === "undefined") return "";

  const fontSize = parseFloat(style.fontSize) || 16;
  const weight = style.fontWeight || "normal";
  const fontStyle = style.fontStyle || "normal";
  const fill = style.color || "#000";
  const dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 2));

  const pad = Math.ceil(fontSize * 0.35);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const fontCss = `${fontStyle} ${weight} ${fontSize}px ${style.fontFamily || formatSvgFontFamily(family)}`;
  ctx.font = fontCss;
  const metrics = ctx.measureText(text);
  const w = Math.max(1, Math.ceil((metrics.width || line.width || 1) + pad * 2));
  const h = Math.max(1, Math.ceil((line.height || fontSize * 1.4) + pad * 2));

  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  ctx.scale(dpr, dpr);
  ctx.font = fontCss;
  ctx.fillStyle = fill;
  ctx.textBaseline = "alphabetic";

  const baseline = measureRasterBaseline(ctx, text, fontSize, h, pad);
  ctx.fillText(text, pad, baseline);

  let href;
  try {
    href = canvas.toDataURL("image/png");
  } catch {
    return "";
  }

  const x = line.x - rootRect.left - pad;
  const y = line.y - rootRect.top - pad;

  return tagImage(x, y, w, h, href);
}

function measureRasterBaseline(ctx, text, fontSize, canvasH, pad) {
  const m = ctx.measureText(text);
  if (m.actualBoundingBoxAscent != null && m.actualBoundingBoxAscent > 0) {
    return pad + m.actualBoundingBoxAscent;
  }
  return pad + fontSize * 0.8;
}

function tagImage(x, y, w, h, href) {
  const a = (n) => Math.round(n * 1000) / 1000;
  return `<image x="${a(x)}" y="${a(y)}" width="${a(w)}" height="${a(h)}" href="${href}" preserveAspectRatio="none"/>`;
}

function srcFormatRank(format) {
  if (!format) return FORMAT_PREFERENCE.length;
  const i = FORMAT_PREFERENCE.indexOf(format.toLowerCase());
  return i === -1 ? FORMAT_PREFERENCE.length : i;
}

/**
 * Collect @font-face rules for families used under root, inlining font files as data URIs.
 * Prefers ttf/otf over woff2 (Illustrator). Drops faces that still point at remote URLs.
 */
export async function collectFontFaces(root) {
  const usedFamilies = new Set();
  const walk = (el) => {
    const style = window.getComputedStyle(el);
    for (const f of parseFontStack(style.fontFamily)) {
      if (!isCssFontKeyword(f) && !isHostile(f)) {
        usedFamilies.add(f.toLowerCase());
      }
    }
    // Also record the resolved family we would emit
    const resolved = resolveSvgFontFamily(style);
    if (resolved) usedFamilies.add(resolved.toLowerCase());
    for (const child of el.children) walk(child);
  };
  if (root) walk(root);

  const chunks = [];
  const seen = new Set();

  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    if (!rules) continue;

    for (const rule of rules) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style.fontFamily?.replace(/["']/g, "").trim();
      if (!family) continue;
      if (usedFamilies.size && !usedFamilies.has(family.toLowerCase())) continue;

      const src = rule.style.getPropertyValue("src") || "";
      const inlined = await inlineBestFontSrc(src, sheet.href || location.href);
      if (!inlined) continue;

      const key = `${family.toLowerCase()}|${rule.style.fontWeight}|${rule.style.fontStyle}|${rule.style.fontStretch}`;
      if (seen.has(key)) continue;
      seen.add(key);

      chunks.push(buildFontFaceCss(rule, family, inlined));
    }
  }

  return chunks.join("\n");
}

async function inlineBestFontSrc(srcValue, baseHref) {
  const entries = [...srcValue.matchAll(/url\((["']?)([^"')]+)\1\)(?:\s*format\((["']?)([^"')]+)\3\))?/gi)];
  if (!entries.length) return null;

  const ranked = entries
    .map((m) => ({ url: m[2], format: m[4] || guessFormat(m[2]), rank: srcFormatRank(m[4] || guessFormat(m[2])) }))
    .sort((a, b) => a.rank - b.rank);

  for (const entry of ranked) {
    if (entry.url.startsWith("data:")) {
      return { dataUrl: entry.url, format: entry.format };
    }
    try {
      const abs = new URL(entry.url, baseHref).href;
      const res = await fetch(abs, { mode: "cors", credentials: "same-origin" });
      if (!res.ok) {
        const retry = await fetch(abs, { mode: "cors", credentials: "omit" });
        if (!retry.ok) continue;
        return { dataUrl: await blobToDataUrl(await retry.blob()), format: entry.format || guessFormat(abs) };
      }
      return { dataUrl: await blobToDataUrl(await res.blob()), format: entry.format || guessFormat(abs) };
    } catch {
      /* try next source */
    }
  }
  return null;
}

function guessFormat(url) {
  const u = url.toLowerCase();
  if (u.includes(".woff2") || u.includes("woff2")) return "woff2";
  if (u.includes(".woff")) return "woff";
  if (u.includes(".otf") || u.includes("opentype")) return "opentype";
  if (u.includes(".ttf") || u.includes("truetype")) return "truetype";
  return "";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function buildFontFaceCss(rule, family, inlined) {
  const format = inlined.format ? ` format('${inlined.format}')` : "";
  const lines = [`@font-face {`, `  font-family: '${family.replace(/'/g, "\\'")}';`];

  const weight = rule.style.fontWeight;
  const fontStyle = rule.style.fontStyle;
  const stretch = rule.style.fontStretch;
  const display = rule.style.getPropertyValue("font-display");
  const unicodeRange = rule.style.getPropertyValue("unicode-range");

  if (weight) lines.push(`  font-weight: ${weight};`);
  if (fontStyle) lines.push(`  font-style: ${fontStyle};`);
  if (stretch && stretch !== "normal") lines.push(`  font-stretch: ${stretch};`);
  if (unicodeRange) lines.push(`  unicode-range: ${unicodeRange};`);
  if (display) lines.push(`  font-display: ${display};`);
  lines.push(`  src: url("${inlined.dataUrl}")${format};`);
  lines.push(`}`);
  return lines.join("\n");
}
