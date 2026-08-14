export type CharacterId = 'lindon' | 'yerin' | 'mercy' | 'ziel' | 'eithan';

/** The four verbs the abilities must stay distinct along. */
export type AbilityVerb = 'rocket' | 'hunt' | 'float' | 'jump' | 'erase';

export interface CharacterPalette {
  /** Core body colour of the technique. */
  projectile: string;
  /** Trail colour. */
  trail: string;
  /** Glow / accent colour, also used for aim guides and charge pips. */
  glow: string;
  /** Secondary accent for UI treatments. */
  accent: string;
}

export interface CharacterDef {
  id: CharacterId;
  /** Name shown before unlock (Eithan hides behind '???'). */
  displayName: string;
  /** True name, revealed once selectable. */
  realName: string;
  ability: string;
  verb: AbilityVerb;
  /** One-line ability description for character select. */
  trait: string;
  /** Flavour line under the portrait. */
  quote: string;
  palette: CharacterPalette;
  /** Hidden until the unlock condition is met. */
  secret?: boolean;
  /** Runs never write records (Eithan only). */
  noRecords?: boolean;
}

export const CHARACTER_ORDER: CharacterId[] = ['lindon', 'yerin', 'mercy', 'ziel', 'eithan'];

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  lindon: {
    id: 'lindon',
    displayName: 'Lindon',
    realName: 'Lindon',
    ability: 'CONSUME',
    verb: 'rocket',
    trait:
      'Locks into a straight line and accelerates like a rocket for 3s. Immune to spikes, storms and armour while burning.',
    quote: 'Every technique is fuel for the next.',
    palette: { projectile: '#151515', trail: '#ff4422', glow: '#ff7733', accent: '#2a1005' },
  },
  yerin: {
    id: 'yerin',
    displayName: 'Yerin',
    realName: 'Yerin',
    ability: 'SWORD SEEKER',
    verb: 'hunt',
    trait:
      'Darts forward and strikes the first beast ahead. Cuts through storms, slices spikes, shatters armour. One prey per cast.',
    quote: 'Point it at something and let go.',
    palette: { projectile: '#e8e8f2', trail: '#c8c8ee', glow: '#ffffff', accent: '#c0304a' },
  },
  mercy: {
    id: 'mercy',
    displayName: 'Mercy',
    realName: 'Mercy',
    ability: 'SHADOW STRINGS',
    verb: 'float',
    trait:
      'Strings of shadow carry the arrow: 2.5s of near-weightless glide with a gentle forward pull. The recovery tool.',
    quote: 'It only looks like falling.',
    palette: { projectile: '#c98aff', trail: '#8a3fff', glow: '#e0bdff', accent: '#4a1d80' },
  },
  ziel: {
    id: 'ziel',
    displayName: 'Ziel',
    realName: 'Ziel',
    ability: 'CONJURE FORMATION',
    verb: 'jump',
    trait:
      'A rune pad flashes into being beneath the technique and slams it upward — far harder than any ground formation. Any time.',
    quote: 'Fine. One more.',
    palette: { projectile: '#57e08c', trail: '#2f9e5b', glow: '#a4ffcb', accent: '#0a3a22' },
  },
  eithan: {
    id: 'eithan',
    displayName: '???',
    realName: 'Eithan',
    ability: 'DESTROYER',
    verb: 'erase',
    trait: 'Ozriel does not compete.',
    quote: 'Ah. You found me. How predictable — of me, I mean.',
    palette: { projectile: '#14141c', trail: '#8888aa', glow: '#ccccee', accent: '#e8d44a' },
    secret: true,
    noRecords: true,
  },
};

/** Characters that count toward the Eithan unlock. */
export const UNLOCK_CHARACTERS: CharacterId[] = ['lindon', 'yerin', 'mercy', 'ziel'];

/** Kilometres each of the four must reach before Eithan is revealed. */
export const UNLOCK_KM = 100;

export const ABILITY = {
  lindon: {
    /** Burn duration, seconds. */
    duration: 3.0,
    /** Forward acceleration applied for the whole burn, px/s². */
    accel: 140,
    /** Speed floor when the burn starts. */
    minSpeed: 320,
    /** Fallback heading if the technique is nearly stationary. */
    stallSpeed: 300,
    stallDirX: 1,
    stallDirY: -0.1,
    /** Fraction of a pickup boost that feeds the burn instead of the velocity. */
    boostAbsorb: 0.5,
    /** Extra burn speed from a Thousand-Mile Cloud / golden beast. */
    tmcBonus: 200,
    rareBonus: 250,
  },
  yerin: {
    duration: 2.5,
    /** Dart speed floor — the hunt always levels out fast. */
    minSpeed: 650,
    /** Lock-on radius, px. */
    lockRange: 440,
    /** A target must be at least this far ahead to be eligible. Never hunts backwards. */
    minLeadX: 6,
    /** Distance behind the projectile at which a lock is dropped. */
    dropBehindX: 4,
    boostAbsorb: 0.5,
    tmcBonus: 150,
    rareBonus: 200,
  },
  mercy: {
    duration: 2.5,
    /** Gravity multiplier while gliding. */
    gravityMultiplier: 0.14,
    /** Forward pull, px/s². */
    forwardPull: 55,
    /** Drag multiplier while gliding. */
    dragMultiplier: 0.45,
    /** Fall arrest: downward velocity retained at cast. */
    fallArrest: 0.3,
  },
  ziel: {
    /** Multiplier on incoming |vy| — deliberately above the ground pad's 1.5. */
    bounceMultiplier: 1.7,
    /** Minimum launch speed, px/s. Above the ground pad's 300 floor. */
    bounceFloor: 400,
    /** Forward kick. */
    forwardKick: 90,
    forwardMultiplier: 1.1,
    /** Visual pad effect duration. */
    fxDuration: 0.35,
  },
  eithan: {
    /** Seconds of normal flight before the transformation. */
    triggerDelay: 1.3,
    /** Seconds the Destroyer sequence runs. */
    duration: 10,
    /** Forward acceleration during the sequence, px/s². */
    accel: 900,
    /** Absolute speed ceiling for the sequence. */
    maxSpeed: 9000,
    /** Vertical damping per second while the scythe levels out. */
    verticalDamp: 3,
    /** Seconds between spontaneous detonations. */
    boomInterval: 0.1,
    /** Score per detonated beast. */
    boomScore: 100,
  },
} as const;
