/**
 * Focus containment and directional movement.
 *
 * Menus float above a canvas that also listens for keys, so focus must never
 * leave the open panel: Tab wraps inside it, and the arrow keys walk the same
 * ordered list so a keyboard or D-pad player never has to know which widget
 * type they are on.
 */

const FOCUSABLE = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function focusables(container: HTMLElement): HTMLElement[] {
  const found = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
  return found.filter((node) => node.getClientRects().length > 0);
}

export function focusFirst(container: HTMLElement): void {
  const [first] = focusables(container);
  if (first) first.focus();
}

/** Keeps Tab and Shift+Tab cycling inside the panel. Returns true if handled. */
export function trapTab(container: HTMLElement, event: KeyboardEvent): boolean {
  const list = focusables(container);
  if (list.length === 0) return false;
  const first = list[0];
  const last = list[list.length - 1];
  const active = document.activeElement as HTMLElement | null;

  if (!active || !container.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return true;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * Moves focus one step in `direction`. Containers marked with `data-nav-cols`
 * are treated as grids, so up/down inside a character grid skips a whole row
 * instead of stepping through it.
 */
export function moveFocus(container: HTMLElement, direction: Direction): boolean {
  const list = focusables(container);
  if (list.length === 0) return false;

  const active = document.activeElement as HTMLElement | null;
  const index = active ? list.indexOf(active) : -1;
  if (index < 0) {
    list[0].focus();
    return true;
  }

  let step = direction === 'down' || direction === 'right' ? 1 : -1;
  if (direction === 'up' || direction === 'down') {
    const grid = active?.closest<HTMLElement>('[data-nav-cols]');
    const cols = grid ? Number(grid.dataset.navCols) : 1;
    if (grid && cols > 1) {
      const inGrid = focusables(grid);
      const gridIndex = active ? inGrid.indexOf(active) : -1;
      const target = gridIndex + (direction === 'down' ? cols : -cols);
      if (gridIndex >= 0 && target >= 0 && target < inGrid.length) {
        inGrid[target].focus();
        return true;
      }
      // Falling out of the grid continues into the surrounding list.
      step = direction === 'down' ? inGrid.length - gridIndex : -(gridIndex + 1);
    }
  }

  const next = (index + step + list.length) % list.length;
  list[next].focus();
  return true;
}

/** Range inputs own the horizontal arrows; everything else yields them. */
export function ownsHorizontalArrows(node: Element | null): boolean {
  return node instanceof HTMLInputElement && node.type === 'range';
}
