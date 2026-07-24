/**
 * Tree-structured paint order.
 * Returns a forest of nodes sorted for back-to-front painting within each
 * stacking context. Enables correct <g opacity> / transform wrapping.
 */

/**
 * @typedef {{ el: Element, style: CSSStyleDeclaration, children: PaintNode[], z: number|null, createsContext: boolean }} PaintNode
 */

/**
 * Build a paint tree under root (root is the returned node).
 * @returns {PaintNode}
 */
export function buildPaintTree(root) {
  return buildNode(root);
}

function buildNode(el) {
  const style = window.getComputedStyle(el);
  if (style.display === "none") {
    return null;
  }

  const children = [];
  for (const child of el.children) {
    const node = buildNode(child);
    if (node) children.push(node);
  }

  // Sort children by stacking rules within this element as containing block /
  // stacking context parent.
  children.sort(compareSiblingPaint);

  const z = style.zIndex === "auto" ? null : parseInt(style.zIndex, 10);
  return {
    el,
    style,
    children,
    z: Number.isFinite(z) ? z : null,
    createsContext: createsStackingContext(el, style),
  };
}

function createsStackingContext(el, style) {
  const positioned = style.position !== "static";
  const opacity = parseFloat(style.opacity);
  const transform = style.transform && style.transform !== "none";
  const filter = style.filter && style.filter !== "none";
  const isolation = style.isolation === "isolate";
  const willChange = /\b(transform|opacity|filter)\b/.test(style.willChange || "");
  const mix = style.mixBlendMode && style.mixBlendMode !== "normal";
  const isFlexOrGridChild =
    el.parentElement &&
    ["flex", "inline-flex", "grid", "inline-grid"].includes(
      window.getComputedStyle(el.parentElement).display
    );

  return (
    (positioned && style.zIndex !== "auto") ||
    opacity < 1 ||
    transform ||
    filter ||
    isolation ||
    willChange ||
    mix ||
    (isFlexOrGridChild && style.zIndex !== "auto")
  );
}

/**
 * CSS Appendix E (simplified):
 * 1. negative z-index stacking contexts
 * 2. in-flow non-positioned / z-auto
 * 3. floats (approx as normal)
 * 4. positioned z-auto / z-index:0
 * 5. positive z-index
 */
function compareSiblingPaint(a, b) {
  const az = effectiveZ(a);
  const bz = effectiveZ(b);

  if (az < 0 && bz < 0) return az - bz || treeOrder(a, b);
  if (az < 0) return -1;
  if (bz < 0) return 1;

  if (az > 0 && bz > 0) return az - bz || treeOrder(a, b);
  if (az > 0) return 1;
  if (bz > 0) return -1;

  // both 0 / auto — DOM order
  return treeOrder(a, b);
}

function effectiveZ(node) {
  if (node.z != null) return node.z;
  // positioned z-auto participates as 0 in some cases; treat as 0 if positioned
  if (node.style.position !== "static") return 0;
  return 0;
}

function treeOrder(a, b) {
  const pos = a.el.compareDocumentPosition(b.el);
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

/** Flat back-to-front list (legacy helper / tests). */
export function collectPaintOrder(root) {
  const tree = buildPaintTree(root);
  const out = [];
  const walk = (node) => {
    if (!node) return;
    out.push({ el: node.el, style: node.style, ctx: { localZ: node.z } });
    for (const c of node.children) walk(c);
  };
  walk(tree);
  out.forEach((item, i) => {
    item.treeOrder = i;
  });
  return out;
}

export function pseudoExists(el, which) {
  const style = window.getComputedStyle(el, which);
  const content = style.content;
  if (!content || content === "none" || content === "normal") return false;
  return true;
}

export function getPseudoStyle(el, which) {
  return window.getComputedStyle(el, which);
}

/** ::marker for li / summary */
export function markerExists(el) {
  const tag = el.tagName.toLowerCase();
  if (tag !== "li" && tag !== "summary") return false;
  const style = window.getComputedStyle(el, "::marker");
  // markers always exist for list-item; check display
  const parent = el.parentElement;
  if (!parent) return false;
  const pDisplay = window.getComputedStyle(parent).display;
  const listItem = style.display === "list-item" || el.tagName.toLowerCase() === "li";
  void pDisplay;
  return listItem && style.content !== "none";
}
