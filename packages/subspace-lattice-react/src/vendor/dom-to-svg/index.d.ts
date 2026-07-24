export interface ElementToSvgOptions {
  embedFonts?: boolean;
  expandOverflow?: boolean;
  rasterizeFonts?: boolean;
}

/** Convert a DOM element subtree into a standalone SVG string. */
export function elementToSvg(
  root: Element,
  options?: ElementToSvgOptions,
): Promise<string>;
