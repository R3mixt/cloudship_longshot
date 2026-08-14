/**
 * The two pieces of motion the interface runs from script. Everything else is a
 * CSS transition or keyframe, which the stylesheet disables under
 * `prefers-reduced-motion`.
 */

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // matchMedia is missing in some embedded webviews; assume full motion.
    return false;
  }
}

export type Cancel = () => void;

/**
 * Counts a number up to its final value. The results screen uses this on the
 * headline distance so the hero number lands rather than simply appearing.
 * Returns a cancel handle; callers must invoke it when the screen closes so a
 * pending frame cannot write into a detached node.
 */
export function countUp(
  node: HTMLElement,
  to: number,
  format: (value: number) => string,
  options: { duration?: number; instant?: boolean } = {},
): Cancel {
  if (options.instant || prefersReducedMotion() || to <= 0) {
    node.textContent = format(to);
    return () => {};
  }

  const duration = options.duration ?? 620;
  const start = performance.now();
  let frame = 0;
  let cancelled = false;

  const tick = (now: number): void => {
    if (cancelled) return;
    const t = Math.min(1, (now - start) / duration);
    // Ease-out cubic: fast arrival, gentle settle.
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = format(to * eased);
    if (t < 1) frame = requestAnimationFrame(tick);
    else node.textContent = format(to);
  };

  frame = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}

/** Restarts a CSS animation class on an element. */
export function pulse(node: HTMLElement, className: string): void {
  node.classList.remove(className);
  // Reading layout forces the class removal to take effect before it is re-added.
  void node.offsetWidth;
  node.classList.add(className);
}
