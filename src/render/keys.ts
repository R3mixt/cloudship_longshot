/** Texture keys used by the world renderer. */
export const TEX = {
  characters: 'characters',
  projectiles: 'projectiles',
  projectilesSurge: 'projectiles_surge',
  birds: 'birds',
  birdGolden: 'bird_golden',
  birdArmored: 'bird_armored',
  feathers: 'feathers',
  pad: 'pad',
  tmc: 'tmc',
  aura: 'aura',
  storm: 'storm',
  spike: 'spike',
  orb: 'orb',
  cloudship: 'cloudship',
  groundTiles: 'ground_tiles',
  clouds: 'clouds',
  mountains: 'mountains',
  ui: 'ui',
  /** 1x1 white pixel, used for particles, streaks and flat fills. */
  pixel: '__pixel',
} as const;

export type TextureKey = (typeof TEX)[keyof typeof TEX];

export const ANIM = {
  birdFly: (species: number) => `bird_fly_${species}`,
  goldenFly: 'golden_fly',
  armorFly: 'armor_fly',
  padIdle: 'pad_idle',
  tmcIdle: 'tmc_idle',
  auraIdle: (variant: string) => `aura_${variant}`,
  stormIdle: 'storm_idle',
  orbIdle: 'orb_idle',
  cloudshipIdle: 'cloudship_idle',
  projectile: (character: string) => `proj_${character}`,
  projectileSurge: 'proj_surge',
  characterIdle: (character: string) => `char_idle_${character}`,
  characterCharge: (character: string) => `char_charge_${character}`,
} as const;
