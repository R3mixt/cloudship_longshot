/**
 * Attribution and legal text. Isolated here so the rights holders can revise the
 * wording without touching any other file.
 */
export const LEGAL = {
  attribution:
    'Cradle and its characters are created by Will Wight and published by Hidden Gnome Publishing. Used with permission.',
  monetization: 'Free forever. No ads, no purchases, no tracking, no data collection.',
  storage: 'Records and settings are stored only in this browser, on this device.',
  gameTitle: 'Cloudship Longshot',
  tagline: 'How far can your technique fly?',
} as const;

export const CREDITS = [
  { role: 'Setting & characters', name: 'Will Wight — Cradle' },
  { role: 'Publisher', name: 'Hidden Gnome Publishing' },
  { role: 'Engine', name: 'Phaser 3' },
] as const;
