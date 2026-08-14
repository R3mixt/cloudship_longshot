/**
 * Interface design tokens.
 *
 * The stylesheet owns the static look; this module exists for the two things a
 * stylesheet cannot do — hand colour values to generated SVG glyphs, and push a
 * character's palette onto an element as custom properties.
 */

import { CHARACTERS, type CharacterId } from '@/data/characters';

/** Mirrors the `--c-*` custom properties in styles.css. */
export const COLORS = {
  /** Page behind everything. */
  void: '#070b1c',
  /** Panel ground. */
  panel: '#0b1026',
  /** Raised surfaces inside a panel — cards, rows, track fills. */
  raised: '#141b3a',
  border: '#3b4a7a',
  borderDim: '#232c50',
  gold: '#ffd876',
  ink: '#dfe6ff',
  muted: '#8fa0d0',
  faint: '#808fc8',
  good: '#7dffb0',
  danger: '#ff7d7d',
  aura: '#c98aff',
} as const;

/**
 * Spacing scale in pixels, mirrored as `--sp-1` … `--sp-6`. Interface spacing
 * only ever uses a step from this scale so the vertical rhythm stays even.
 */
export const SPACE = {
  step1: 4,
  step2: 6,
  step3: 10,
  step4: 14,
  step5: 20,
  step6: 28,
} as const;

export interface Accent {
  /** Technique body colour. */
  core: string;
  /** Trail colour, used for secondary glyph detail. */
  trail: string;
  /** Bright accent — borders, glows, headings. Always high contrast on panel. */
  glow: string;
  /** Deep accent, used as a card wash behind the portrait. */
  deep: string;
}

export function accentFor(id: CharacterId): Accent {
  const palette = CHARACTERS[id].palette;
  return {
    core: palette.projectile,
    trail: palette.trail,
    glow: palette.glow,
    deep: palette.accent,
  };
}

/** Pushes a character palette onto an element for the stylesheet to consume. */
export function applyAccent(node: HTMLElement, id: CharacterId): Accent {
  const accent = accentFor(id);
  node.style.setProperty('--accent', accent.glow);
  node.style.setProperty('--accent-core', accent.core);
  node.style.setProperty('--accent-trail', accent.trail);
  node.style.setProperty('--accent-deep', accent.deep);
  return accent;
}
