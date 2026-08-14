/**
 * Element construction helpers.
 *
 * Every node in the interface is built through these rather than through
 * `innerHTML`. Dynamic values (character names, records, save data) therefore
 * always travel as `textContent`, which cannot be interpreted as markup.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface ElOptions {
  className?: string;
  /** Assigned as textContent — never parsed as markup. */
  text?: string;
  attrs?: Record<string, string>;
  /** Reserved for genuinely dynamic values: measured widths, accent colours. */
  style?: Record<string, string>;
  children?: Array<Node | null | undefined>;
  onClick?: (event: MouseEvent) => void;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) node.setAttribute(key, value);
  }
  if (options.style) {
    for (const [key, value] of Object.entries(options.style)) node.style.setProperty(key, value);
  }
  if (options.children) {
    for (const child of options.children) if (child) node.appendChild(child);
  }
  if (options.onClick) {
    const handler = options.onClick;
    (node as HTMLElement).addEventListener('click', (event) => handler(event as MouseEvent));
  }
  return node;
}

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  children: SVGElement[] = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  for (const child of children) node.appendChild(child);
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export interface PixelIconOptions {
  /** Rendered size in CSS pixels; the grid is scaled to fit. */
  size?: number;
  title?: string;
}

/**
 * Builds a pixel glyph from an ASCII grid. Horizontal runs of the same colour
 * collapse into one rect, which keeps these to a handful of nodes each, and
 * `crispEdges` stops the browser antialiasing away the pixel identity.
 */
export function pixelIcon(
  grid: readonly string[],
  colors: Record<string, string>,
  options: PixelIconOptions = {},
): SVGSVGElement {
  const rows = grid.length;
  const cols = grid.reduce((widest, row) => Math.max(widest, row.length), 0);
  const size = options.size ?? 18;
  const rects: SVGElement[] = [];

  for (let y = 0; y < rows; y++) {
    const row = grid[y];
    let x = 0;
    while (x < row.length) {
      const key = row[x];
      const fill = colors[key];
      if (!fill) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < row.length && row[x + run] === key) run++;
      rects.push(svgEl('rect', { x, y, width: run, height: 1, fill }));
      x += run;
    }
  }

  const root = svgEl(
    'svg',
    {
      viewBox: `0 0 ${cols} ${rows}`,
      width: size,
      height: Math.round((size * rows) / cols),
      'shape-rendering': 'crispEdges',
      focusable: 'false',
      'aria-hidden': options.title ? 'false' : 'true',
      role: options.title ? 'img' : 'presentation',
    },
    rects,
  );
  if (options.title) {
    const label = svgEl('title');
    label.textContent = options.title;
    root.insertBefore(label, root.firstChild);
  }
  return root;
}
