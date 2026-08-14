/**
 * Generated iconography.
 *
 * The interface never depends on sprite files: every icon and diagram here is
 * drawn from an ASCII pixel grid or from primitive SVG shapes. That keeps the
 * menus working before, during and after any art pass, and lets each glyph take
 * the colour of whatever it is describing.
 */

import type { AbilityVerb } from '@/data/characters';
import { pixelIcon, svgEl } from './dom';
import { COLORS, type Accent } from './theme';

const VERB_GRIDS: Record<AbilityVerb, readonly string[]> = {
  // Comet: locked heading, burning tail.
  rocket: [
    '....AA...',
    '..AAAAAA.',
    '.AAAAAAAA',
    'BBAAAAAAA',
    'BBBAAAAAA',
    'BBAAAAAAA',
    '.AAAAAAAA',
    '..AAAAAA.',
    '....AA...',
  ],
  // Blade on the hunt.
  hunt: [
    '.......AA',
    '......AAA',
    '.....AAA.',
    '....AAA..',
    '...AAA...',
    '..AAA....',
    '.BAA.....',
    'BBBB.....',
    '.BB......',
  ],
  // Crescent carried on strings.
  float: [
    '...AAA...',
    '..AA.....',
    '.AA......',
    '.AA......',
    '.AA......',
    '..AA.....',
    '...AAA...',
    '.B.B.B.B.',
    'B.B.B.B.B',
  ],
  // Rune pad throwing the technique upward.
  jump: [
    '....A....',
    '...AAA...',
    '..AAAAA..',
    '.AAAAAAA.',
    '....A....',
    '....A....',
    '.........',
    'BBBBBBBBB',
    '.B.B.B.B.',
  ],
  // Scythe.
  erase: [
    '..AAAAA..',
    '.AA...AA.',
    'AA.....A.',
    'A........',
    '....B....',
    '....B....',
    '....B....',
    '...BB....',
    '..BB.....',
  ],
};

export function verbGlyph(verb: AbilityVerb, accent: Accent, size = 22): SVGSVGElement {
  return pixelIcon(VERB_GRIDS[verb], { A: accent.glow, B: accent.trail }, { size });
}

export type LegendKind = 'boost' | 'aura' | 'slow' | 'death';

const LEGEND_GRIDS: Record<LegendKind, readonly string[]> = {
  // Double chevron climbing.
  boost: [
    '....A....',
    '...AAA...',
    '..AA.AA..',
    '.AA...AA.',
    '.........',
    '....A....',
    '...AAA...',
    '..AA.AA..',
    '.AA...AA.',
  ],
  // Aura cloud carrying a restorative mark.
  aura: [
    '..AAAAA..',
    '.A.....A.',
    'A...B...A',
    'A..BBB..A',
    'A...B...A',
    '.A.....A.',
    '..AAAAA..',
    '.........',
    '.........',
  ],
  // Storm cloud with a bolt.
  slow: [
    '..AAAAA..',
    '.AAAAAAA.',
    'AAAAAAAAA',
    '.AAAAAAA.',
    '....B....',
    '...BB....',
    '..BBBB...',
    '....BB...',
    '...B.....',
  ],
  // Rock spire.
  death: [
    '....A....',
    '....A....',
    '...AAA...',
    '...AAA...',
    '..AAAAA..',
    '..AAAAA..',
    '.AAAAAAA.',
    '.AAAAAAA.',
    'AAAAAAAAA',
  ],
};

const LEGEND_COLORS: Record<LegendKind, [string, string]> = {
  boost: [COLORS.gold, COLORS.gold],
  aura: [COLORS.aura, COLORS.ink],
  slow: [COLORS.muted, COLORS.gold],
  death: [COLORS.danger, COLORS.danger],
};

export function legendGlyph(kind: LegendKind, size = 20): SVGSVGElement {
  const [primary, secondary] = LEGEND_COLORS[kind];
  return pixelIcon(LEGEND_GRIDS[kind], { A: primary, B: secondary }, { size });
}

const LOCK_GRID = [
  '..AAAAA..',
  '.AA...AA.',
  '.AA...AA.',
  'BBBBBBBBB',
  'BBBBBBBBB',
  'BBBB.BBBB',
  'BBB...BBB',
  'BBBB.BBBB',
  'BBBBBBBBB',
];

export function lockGlyph(size = 20): SVGSVGElement {
  return pixelIcon(LOCK_GRID, { A: COLORS.borderDim, B: COLORS.border }, { size });
}

const STAR_GRID = [
  '....A....',
  '....A....',
  '.A..A..A.',
  '.AA.A.AA.',
  '..AAAAA..',
  'AAAAAAAAA',
  '..AAAAA..',
  '.AA.A.AA.',
  '.A..A..A.',
];

export function starGlyph(size = 14, color = COLORS.good): SVGSVGElement {
  return pixelIcon(STAR_GRID, { A: color }, { size });
}

/* ------------------------------------------------------------------ */
/* How to Play diagrams                                                */
/* ------------------------------------------------------------------ */

export type StepKind = 'charge' | 'aim' | 'tap';

function diagram(children: SVGElement[]): SVGSVGElement {
  return svgEl(
    'svg',
    {
      viewBox: '0 0 64 40',
      width: '100%',
      height: 'auto',
      'shape-rendering': 'crispEdges',
      focusable: 'false',
      'aria-hidden': 'true',
      role: 'presentation',
      class: 'ui-diagram',
    },
    children,
  );
}

function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  extra: Record<string, string | number> = {},
): SVGElement {
  return svgEl('rect', { x, y, width: w, height: h, fill, ...extra });
}

/** Dotted arc drawn as discrete squares — a curve that survives pixel styling. */
function arcDots(
  from: [number, number],
  peak: number,
  to: [number, number],
  count: number,
  fill: string,
): SVGElement[] {
  const dots: SVGElement[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = from[0] + (to[0] - from[0]) * t;
    // Quadratic through the peak height.
    const lift = 4 * peak * t * (1 - t);
    const y = from[1] + (to[1] - from[1]) * t - lift;
    dots.push(rect(Math.round(x), Math.round(y), 2, 2, fill));
  }
  return dots;
}

const STEP_BUILDERS: Record<StepKind, () => SVGSVGElement> = {
  charge: () =>
    diagram([
      // Meter frame.
      rect(6, 14, 52, 12, 'none', { stroke: COLORS.border, 'stroke-width': 2 }),
      // Filled portion.
      rect(8, 16, 30, 8, COLORS.aura),
      // The gold release mark.
      rect(38, 11, 3, 18, COLORS.gold),
      // Holding finger.
      rect(28, 30, 8, 6, COLORS.ink),
      rect(30, 28, 4, 3, COLORS.ink),
      rect(6, 4, 4, 4, COLORS.gold),
      rect(12, 4, 4, 4, COLORS.gold),
      rect(18, 4, 4, 4, COLORS.gold),
    ]),
  aim: () =>
    diagram([
      // Deck.
      rect(2, 26, 14, 4, COLORS.border),
      rect(4, 22, 6, 4, COLORS.muted),
      // Trajectory.
      ...arcDots([12, 24], 16, [56, 26], 11, COLORS.aura),
      // Arrow head at the end of the drag.
      rect(52, 22, 6, 2, COLORS.gold),
      rect(54, 20, 4, 2, COLORS.gold),
      rect(54, 24, 4, 2, COLORS.gold),
      // Drag origin marker.
      rect(10, 22, 4, 4, COLORS.gold),
    ]),
  tap: () =>
    diagram([
      // Technique in flight.
      rect(20, 18, 8, 6, COLORS.ink),
      rect(12, 19, 6, 4, COLORS.muted),
      rect(6, 20, 4, 2, COLORS.borderDim),
      // Burst.
      rect(32, 12, 3, 3, COLORS.gold),
      rect(38, 16, 3, 3, COLORS.gold),
      rect(34, 22, 3, 3, COLORS.gold),
      rect(42, 20, 3, 3, COLORS.gold),
      rect(30, 26, 3, 3, COLORS.gold),
      // Charge pips: two remaining, one spending.
      rect(8, 32, 8, 5, COLORS.gold),
      rect(20, 32, 8, 5, COLORS.gold),
      rect(32, 32, 8, 5, 'none', { stroke: COLORS.border, 'stroke-width': 2 }),
    ]),
};

export function stepDiagram(kind: StepKind): SVGSVGElement {
  return STEP_BUILDERS[kind]();
}
