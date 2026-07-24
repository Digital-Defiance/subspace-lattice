import { relativeBox, tag, uid, escAttr } from "./utils.js";
import { getBorderRadii } from "./utils.js";
import { shapeElement } from "./borders.js";

/**
 * <img> → SVG <image>. Prefer inlining as data URL to avoid CORS taint
 * when the SVG is opened standalone.
 */
export async function renderImage(el, rootRect, defs) {
  const rect = el.getBoundingClientRect();
  const box = relativeBox(rect, rootRect);
  if (box.width <= 0 || box.height <= 0) return "";

  const style = window.getComputedStyle(el);
  const radii = getBorderRadii(style, box.width, box.height);
  const src = el.currentSrc || el.src;
  if (!src) return "";

  let href = src;
  try {
    href = await toDataURL(src, el);
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
  const objectFit = style.objectFit || "fill";
  const preserve =
    objectFit === "cover"
      ? "xMidYMid slice"
      : objectFit === "contain"
        ? "xMidYMid meet"
        : "none";

  return tag("image", {
    href,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    preserveAspectRatio: preserve,
    ...(anyR ? { "clip-path": `url(#${clipId})` } : {}),
    ...(opacity ? { opacity } : {}),
  });
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

async function toDataURL(src, imgEl) {
  if (src.startsWith("data:")) return src;

  // Same-origin or already-decoded image element
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

  // Fetch + blob (requires CORS-friendly response when cross-origin)
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
