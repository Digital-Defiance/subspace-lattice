import { tag, uid } from "./utils.js";

/**
 * Convert CSS background-image (one or more layers) into SVG paint / image descriptors.
 */

export function backgroundLayers(style) {
  const bg = style.backgroundImage;
  if (!bg || bg === "none") return [];

  return splitCssList(bg)
    .map((layer) => layer.trim())
    .filter(Boolean)
    .map((layer) => classifyLayer(layer))
    .filter(Boolean);
}

export function backgroundPaint(style, box, defs) {
  const layers = backgroundLayers(style);
  if (!layers.length) return null;
  // Primary paint API returns first gradient or image for simple callers
  const first = layers[0];
  if (first.kind === "linear") return materializeLinear(first.inner, defs);
  if (first.kind === "radial") return materializeRadial(first.inner, defs);
  if (first.kind === "image") return { type: "image", url: first.url };
  return null;
}

/**
 * Render all background layers (bottom → top, matching CSS).
 * Caller supplies a shape builder for the clipped region.
 */
export function renderBackgroundLayers(style, box, radii, shapeFn, defs) {
  const layers = backgroundLayers(style);
  if (!layers.length) return "";

  // CSS lists layers top→bottom; paint bottom first
  const ordered = [...layers].reverse();
  const sizes = splitCssList(style.backgroundSize || "auto");
  const positions = splitCssList(style.backgroundPosition || "0% 0%");
  const repeats = splitCssList(style.backgroundRepeat || "repeat");

  const parts = [];
  ordered.forEach((layer, i) => {
    const size = (sizes[i] || sizes[sizes.length - 1] || "auto").trim();
    const pos = (positions[i] || positions[positions.length - 1] || "0% 0%").trim();
    void repeats;
    void size;
    void pos;

    if (layer.kind === "linear") {
      const paint = materializeLinear(layer.inner, defs);
      if (paint) parts.push(shapeFn({ fill: paint.url }));
    } else if (layer.kind === "radial") {
      const paint = materializeRadial(layer.inner, defs);
      if (paint) parts.push(shapeFn({ fill: paint.url }));
    } else if (layer.kind === "image") {
      const clipId = uid("bgclip");
      defs.push(tag("clipPath", { id: clipId }, shapeFn({})));
      parts.push(
        tag("image", {
          href: layer.url,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          preserveAspectRatio: "xMidYMid slice",
          "clip-path": `url(#${clipId})`,
        })
      );
    }
  });

  void radii;
  return parts.join("");
}

function classifyLayer(layer) {
  const linear = layer.match(/^linear-gradient\((.*)\)$/is);
  if (linear) return { kind: "linear", inner: linear[1] };

  const radial = layer.match(/^radial-gradient\((.*)\)$/is);
  if (radial) return { kind: "radial", inner: radial[1] };

  const url = layer.match(/^url\(["']?([^"')]+)["']?\)/i);
  if (url) return { kind: "image", url: url[1] };

  return null;
}

/** Exported for tests */
export function splitCssList(str) {
  const out = [];
  let cur = "";
  let depth = 0;
  for (const ch of str) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

export function parseColorStops(tokens) {
  const parts = splitCssList(tokens);
  const stops = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (/^(to\s|[\d.-]+deg|[\d.-]+turn|[\d.-]+rad|[\d.-]+grad|from\s|circle|ellipse|at\s|closest-|farthest-)/i.test(trimmed)) {
      continue;
    }
    // color [offset]?
    const m = trimmed.match(/^(.*?)\s+(-?[\d.]+%|-?[\d.]+px)?$/);
    if (m && m[2]) {
      stops.push({ color: m[1].trim(), offset: m[2] });
    } else {
      stops.push({ color: trimmed, offset: null });
    }
  }
  return stops;
}

/** CSS linear-gradient angle → degrees where 0 = north (to top). */
export function cssGradientAngle(token) {
  const t = token.trim().toLowerCase();
  if (t.startsWith("to ")) {
    const map = {
      "to top": 0,
      "to right": 90,
      "to bottom": 180,
      "to left": 270,
      "to top right": 45,
      "to right top": 45,
      "to bottom right": 135,
      "to right bottom": 135,
      "to bottom left": 225,
      "to left bottom": 225,
      "to top left": 315,
      "to left top": 315,
    };
    return map[t] ?? 180;
  }
  const deg = t.match(/([\d.-]+)\s*deg/);
  if (deg) return parseFloat(deg[1]);
  const turn = t.match(/([\d.-]+)\s*turn/);
  if (turn) return parseFloat(turn[1]) * 360;
  const rad = t.match(/([\d.-]+)\s*rad/);
  if (rad) return (parseFloat(rad[1]) * 180) / Math.PI;
  const grad = t.match(/([\d.-]+)\s*grad/);
  if (grad) return parseFloat(grad[1]) * 0.9;
  return 180;
}

function materializeLinear(inner, defs) {
  const parts = splitCssList(inner);
  let x1 = 0;
  let y1 = 0;
  let x2 = 0;
  let y2 = 1;

  const first = parts[0]?.trim() || "";
  let stopStart = 0;

  if (/deg|turn|rad|grad/i.test(first) || /^to\s/i.test(first)) {
    stopStart = 1;
    const angle = cssGradientAngle(first);
    const rad = ((angle - 90) * Math.PI) / 180;
    x1 = 0.5 - Math.cos(rad) * 0.5;
    y1 = 0.5 - Math.sin(rad) * 0.5;
    x2 = 0.5 + Math.cos(rad) * 0.5;
    y2 = 0.5 + Math.sin(rad) * 0.5;
  }

  const stops = parseColorStops(parts.slice(stopStart).join(","));
  if (!stops.length) return null;

  const id = uid("lg");
  const stopEls = stops
    .map((s, i) => {
      const offset = s.offset || `${(i / Math.max(1, stops.length - 1)) * 100}%`;
      return tag("stop", { offset, "stop-color": s.color });
    })
    .join("");

  defs.push(
    tag("linearGradient", { id, gradientUnits: "objectBoundingBox", x1, y1, x2, y2 }, stopEls)
  );
  return { type: "paint", url: `url(#${id})` };
}

function materializeRadial(inner, defs) {
  const parts = splitCssList(inner);
  const stops = parseColorStops(parts.join(","));
  if (!stops.length) return null;

  const id = uid("rg");
  const stopEls = stops
    .map((s, i) => {
      const offset = s.offset || `${(i / Math.max(1, stops.length - 1)) * 100}%`;
      return tag("stop", { offset, "stop-color": s.color });
    })
    .join("");

  defs.push(
    tag("radialGradient", { id, gradientUnits: "objectBoundingBox", cx: 0.5, cy: 0.5, r: 0.5 }, stopEls)
  );
  return { type: "paint", url: `url(#${id})` };
}
