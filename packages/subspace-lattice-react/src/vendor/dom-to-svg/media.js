import { relativeBox, tag, uid, escAttr } from "./utils.js";
import { getBorderRadii } from "./utils.js";
import { shapeElement } from "./borders.js";
import { maybeCssDropShadowFilter } from "./box.js";

/**
 * <img> → SVG <image>. Prefer inlining as a data URL to avoid CORS taint
 * when the SVG is opened standalone.
 *
 * Rasterize into the *display* box. For SVG sources, rewrite width/height to
 * the destination pixel size so the full viewBox maps to the cell — matching
 * how the browser paints SVG-as-<img>. Drawing via naturalWidth alone often
 * uses a content bbox (or default 300×150) and leaves pieces tiny in exports.
 */
export async function renderImage(el, rootRect, defs) {
  const rect = el.getBoundingClientRect();
  const box = relativeBox(rect, rootRect);
  if (box.width <= 0 || box.height <= 0) return "";

  const style = window.getComputedStyle(el);
  const radii = getBorderRadii(style, box.width, box.height);
  const src = el.currentSrc || el.src;
  if (!src) return "";

  const objectFit = style.objectFit || "fill";

  let href = src;
  try {
    href = await toDataURL(src, el, box, objectFit);
  } catch {
    href = src; // fall back to remote URL
  }

  const clipId = uid("imgclip");
  const anyR = radii.tl.rx || radii.tr.rx || radii.br.rx || radii.bl.rx;
  if (anyR) {
    defs.push(
      tag("clipPath", { id: clipId }, shapeElement(box.x, box.y, box.width, box.height, radii, {}))
    );
  }

  const opacity = style.opacity !== "1" ? style.opacity : null;
  // Bitmap is already fitted into the display box — do not re-letterbox.
  const preserve = "none";

  // Apply drop-shadow on a wrapping <g> so clip-path on the image does not
  // eat the silhouette outline (CSS filter paints outside the border box).
  const filterUrl = maybeCssDropShadowFilter(style, defs);

  let markup = tag("image", {
    href,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    preserveAspectRatio: preserve,
    ...(anyR ? { "clip-path": `url(#${clipId})` } : {}),
    ...(opacity ? { opacity } : {}),
  });

  if (filterUrl) {
    markup = tag("g", { filter: filterUrl }, markup);
  }
  return markup;
}

/**
 * <canvas> → raster <image> via toDataURL (vectors inside canvas are lost).
 */
export function renderCanvas(el, rootRect) {
  const rect = el.getBoundingClientRect();
  const box = relativeBox(rect, rootRect);
  if (box.width <= 0 || box.height <= 0) return "";

  let href;
  try {
    href = el.toDataURL("image/png");
  } catch {
    // Tainted canvas
    return "";
  }

  return tag("image", {
    href,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    preserveAspectRatio: "none",
  });
}

/**
 * Inline <svg> — clone into the output, remapped to root coordinates.
 */
export function renderInlineSvg(el, rootRect) {
  const rect = el.getBoundingClientRect();
  const box = relativeBox(rect, rootRect);
  if (box.width <= 0 || box.height <= 0) return "";

  const clone = el.cloneNode(true);

  // Ensure xmlns
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }

  // Normalize to explicit pixel viewport at the element's box
  clone.setAttribute("x", String(box.x));
  clone.setAttribute("y", String(box.y));
  clone.setAttribute("width", String(box.width));
  clone.setAttribute("height", String(box.height));

  // Prefer existing viewBox; else synthesize from width/height attrs or bbox
  if (!clone.getAttribute("viewBox")) {
    const vw = el.viewBox?.baseVal?.width || parseFloat(el.getAttribute("width")) || box.width;
    const vh = el.viewBox?.baseVal?.height || parseFloat(el.getAttribute("height")) || box.height;
    const vx = el.viewBox?.baseVal?.x || 0;
    const vy = el.viewBox?.baseVal?.y || 0;
    if (vw && vh) clone.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
  }

  // Strip scripts from embedded SVG
  clone.querySelectorAll("script").forEach((s) => s.remove());

  // Serialize — nested <svg> is valid inside SVG
  const html = clone.outerHTML;
  // Fix HTML-serialized void quirks: browsers may lowercase and drop xmlns:xlink
  return html.replace(/\s+/g, " ").trim();
}

/**
 * <video> poster frame or current frame as raster.
 */
export function renderVideo(el, rootRect) {
  const rect = el.getBoundingClientRect();
  const box = relativeBox(rect, rootRect);
  if (box.width <= 0 || box.height <= 0) return "";

  try {
    const canvas = document.createElement("canvas");
    canvas.width = el.videoWidth || box.width;
    canvas.height = el.videoHeight || box.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
    const href = canvas.toDataURL("image/png");
    return tag("image", {
      href,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      preserveAspectRatio: "xMidYMid meet",
    });
  } catch {
    if (el.poster) {
      return tag("image", {
        href: el.poster,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        preserveAspectRatio: "xMidYMid meet",
      });
    }
    return "";
  }
}

function isSvgSource(src) {
  if (!src) return false;
  if (/\.svg(\?|#|$)/i.test(src)) return true;
  if (/^data:image\/svg\+xml/i.test(src)) return true;
  return false;
}

/**
 * Fetch SVG markup and stamp explicit width/height so the viewBox fills the
 * destination pixel viewport (chess-set packs use a shared 45×45 viewBox).
 */
async function svgMarkupAtSize(src, pixelW, pixelH) {
  let text;
  if (src.startsWith("data:")) {
    const comma = src.indexOf(",");
    const meta = src.slice(0, comma);
    const data = src.slice(comma + 1);
    text = /;base64/i.test(meta) ? atob(data) : decodeURIComponent(data);
  } else {
    const res = await fetch(src, { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error("svg fetch failed");
    text = await res.text();
  }

  if (!/<svg\b/i.test(text)) throw new Error("not svg");

  text = text.replace(/<svg\b([^>]*)>/i, (_, attrs) => {
    let next = attrs
      .replace(/\swidth\s*=\s*(["']).*?\1/gi, "")
      .replace(/\sheight\s*=\s*(["']).*?\1/gi, "");
    if (!/\sxmlns\s*=/i.test(next)) {
      next += ' xmlns="http://www.w3.org/2000/svg"';
    }
    return `<svg${next} width="${pixelW}" height="${pixelH}">`;
  });

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
}

function loadImage(href) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = href;
  });
}

/**
 * Draw `img` into a display-sized canvas using object-fit rules.
 * SVG sources are re-serialized at the canvas pixel size first.
 */
async function rasterizeToBox(imgEl, src, box, objectFit) {
  const dw = Math.max(1, Math.round(box.width));
  const dh = Math.max(1, Math.round(box.height));
  // 2× for crisp piece rims when figures are scaled up in manuals / video.
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = dw * scale;
  canvas.height = dh * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  let drawEl = imgEl;
  if (isSvgSource(src)) {
    try {
      const sized = await svgMarkupAtSize(src, canvas.width, canvas.height);
      drawEl = await loadImage(sized);
    } catch {
      drawEl = imgEl;
    }
  }

  const nw = drawEl.naturalWidth || canvas.width;
  const nh = drawEl.naturalHeight || canvas.height;
  if (!nw || !nh) return null;

  // SVG rewritten at canvas size already maps viewBox → pixels; always fill.
  const fit = isSvgSource(src)
    ? "fill"
    : objectFit === "scale-down"
      ? "contain"
      : objectFit;

  let dx = 0;
  let dy = 0;
  let dwDraw = canvas.width;
  let dhDraw = canvas.height;
  let sx = 0;
  let sy = 0;
  let sw = nw;
  let sh = nh;

  if (fit === "contain" || fit === "cover") {
    const scaleX = canvas.width / nw;
    const scaleY = canvas.height / nh;
    const s = fit === "contain" ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
    dwDraw = nw * s;
    dhDraw = nh * s;
    dx = (canvas.width - dwDraw) / 2;
    dy = (canvas.height - dhDraw) / 2;
  } else if (fit === "none") {
    dwDraw = nw;
    dhDraw = nh;
    dx = (canvas.width - dwDraw) / 2;
    dy = (canvas.height - dhDraw) / 2;
  }
  // fill: stretch to canvas (default above)

  ctx.drawImage(drawEl, sx, sy, sw, sh, dx, dy, dwDraw, dhDraw);
  return canvas.toDataURL("image/png");
}

async function toDataURL(src, imgEl, box, objectFit = "fill") {
  if (box && (imgEl?.complete || isSvgSource(src))) {
    try {
      const fitted = await rasterizeToBox(imgEl, src, box, objectFit);
      if (fitted) return fitted;
    } catch {
      /* tainted / fetch */
    }
  }

  if (src.startsWith("data:")) return src;

  if (imgEl?.complete && imgEl.naturalWidth) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = imgEl.naturalWidth;
      canvas.height = imgEl.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(imgEl, 0, 0);
      return canvas.toDataURL("image/png");
    } catch {
      /* tainted */
    }
  }

  const res = await fetch(src, { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error("fetch failed");
  const blob = await res.blob();
  return await blobToDataURL(blob);
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

void escAttr;
void uid;
