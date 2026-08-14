import { CHARACTER_ORDER, UNLOCK_CHARACTERS, UNLOCK_KM, type CharacterId } from '@/data/characters';

const STORAGE_KEY = 'cloudship-longshot.save';
export const SAVE_VERSION = 3;

export interface CharacterRecord {
  /** Best distance in metres. */
  distance: number;
  /** Best score. */
  score: number;
  /** Lifetime aggregates. */
  runs: number;
  totalDistance: number;
  totalBeasts: number;
  bestBeasts: number;
  peakAltitude: number;
  topSpeed: number;
}

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  screenShake: boolean;
  reducedEffects: boolean;
  reducedFlash: boolean;
  showSpeedLines: boolean;
}

export interface SaveData {
  version: number;
  records: Partial<Record<CharacterId, CharacterRecord>>;
  settings: Settings;
  lastCharacter: CharacterId;
  /** Tester unlock, set by the hidden menu gesture or the debug flag. */
  devUnlock: boolean;
  /** Set once the player has completed a launch, so the tutorial prompts can relax. */
  hasLaunched: boolean;
  totalRuns: number;
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.9,
  screenShake: true,
  reducedEffects: false,
  reducedFlash: false,
  showSpeedLines: true,
};

export function emptyRecord(): CharacterRecord {
  return {
    distance: 0,
    score: 0,
    runs: 0,
    totalDistance: 0,
    totalBeasts: 0,
    bestBeasts: 0,
    peakAltitude: 0,
    topSpeed: 0,
  };
}

function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    records: {},
    settings: { ...DEFAULT_SETTINGS },
    lastCharacter: 'lindon',
    devUnlock: false,
    hasLaunched: false,
    totalRuns: 0,
  };
}

/**
 * Migrates any older save shape forward. Each step is additive and tolerant of
 * missing fields — a corrupt or partial save must degrade to defaults rather
 * than throw, because a player losing their records to an exception is far worse
 * than a player losing one unrecognised field.
 */
export function migrate(raw: unknown): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Record<string, unknown>;

  // v1 (prototype): { lindon: { dist, score }, ... } stored flat, no version key.
  const version = typeof data.version === 'number' ? data.version : 1;

  const records: Partial<Record<CharacterId, CharacterRecord>> = {};
  const source =
    version === 1 ? data : ((data.records as Record<string, unknown>) ?? {});

  for (const id of CHARACTER_ORDER) {
    const entry = source?.[id];
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const rec = emptyRecord();
    rec.distance = num(e.distance ?? e.dist, 0);
    rec.score = num(e.score, 0);
    rec.runs = num(e.runs, 0);
    rec.totalDistance = num(e.totalDistance, rec.distance);
    rec.totalBeasts = num(e.totalBeasts, 0);
    rec.bestBeasts = num(e.bestBeasts, 0);
    rec.peakAltitude = num(e.peakAltitude, 0);
    rec.topSpeed = num(e.topSpeed, 0);
    records[id] = rec;
  }

  const settingsRaw = (data.settings as Record<string, unknown>) ?? {};
  const settings: Settings = { ...DEFAULT_SETTINGS };
  settings.masterVolume = clamp01(num(settingsRaw.masterVolume, DEFAULT_SETTINGS.masterVolume));
  settings.musicVolume = clamp01(num(settingsRaw.musicVolume, DEFAULT_SETTINGS.musicVolume));
  settings.sfxVolume = clamp01(num(settingsRaw.sfxVolume, DEFAULT_SETTINGS.sfxVolume));
  settings.screenShake = bool(settingsRaw.screenShake, DEFAULT_SETTINGS.screenShake);
  settings.reducedEffects = bool(settingsRaw.reducedEffects, DEFAULT_SETTINGS.reducedEffects);
  settings.reducedFlash = bool(settingsRaw.reducedFlash, DEFAULT_SETTINGS.reducedFlash);
  settings.showSpeedLines = bool(settingsRaw.showSpeedLines, DEFAULT_SETTINGS.showSpeedLines);

  const last = data.lastCharacter;
  const lastCharacter =
    typeof last === 'string' && (CHARACTER_ORDER as string[]).includes(last)
      ? (last as CharacterId)
      : 'lindon';

  return {
    version: SAVE_VERSION,
    records,
    settings,
    lastCharacter,
    devUnlock: bool(data.devUnlock ?? data.dev, false),
    hasLaunched: bool(data.hasLaunched, Object.keys(records).length > 0),
    totalRuns: num(data.totalRuns, 0),
  };
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : v === '1' || v === 1 ? true : fallback;
}
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

type Listener = (data: SaveData) => void;

/**
 * Single owner of persisted state. Everything else reads through this so there
 * is exactly one place that knows the storage format.
 */
export class SaveManager {
  private data: SaveData;
  private listeners = new Set<Listener>();
  private storage: Storage | null;
  private writeQueued = false;

  constructor(storage: Storage | null = safeStorage()) {
    this.storage = storage;
    this.data = this.load();
  }

  private load(): SaveData {
    if (!this.storage) return defaultSave();
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return this.importLegacy();
      return migrate(JSON.parse(raw));
    } catch {
      // A corrupt save must never block play. Start clean.
      return defaultSave();
    }
  }

  /** Carries records over from the v8 prototype if the player has some. */
  private importLegacy(): SaveData {
    if (!this.storage) return defaultSave();
    try {
      const legacy = this.storage.getItem('csl5_rec');
      if (!legacy) return defaultSave();
      const save = migrate(JSON.parse(legacy));
      save.devUnlock = this.storage.getItem('csl5_dev') === '1';
      return save;
    } catch {
      return defaultSave();
    }
  }

  get(): Readonly<SaveData> {
    return this.data;
  }

  get settings(): Readonly<Settings> {
    return this.data.settings;
  }

  record(id: CharacterId): CharacterRecord {
    return this.data.records[id] ?? emptyRecord();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  update(mutator: (data: SaveData) => void): void {
    mutator(this.data);
    this.flush();
  }

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.data.settings[key] = value;
    this.flush();
  }

  setLastCharacter(id: CharacterId): void {
    this.data.lastCharacter = id;
    this.flush();
  }

  setDevUnlock(on: boolean): void {
    this.data.devUnlock = on;
    this.flush();
  }

  /**
   * Commits a finished run. Returns whether it set a new distance record.
   * Characters flagged `noRecords` must be filtered out by the caller.
   */
  commitRun(
    id: CharacterId,
    run: {
      distance: number;
      score: number;
      beasts: number;
      peakAltitude: number;
      topSpeed: number;
    },
  ): { newDistanceRecord: boolean; newScoreRecord: boolean } {
    const rec = this.data.records[id] ?? emptyRecord();
    const distance = Math.round(run.distance);
    const newDistanceRecord = distance > rec.distance;
    const newScoreRecord = run.score > rec.score;

    rec.distance = Math.max(rec.distance, distance);
    rec.score = Math.max(rec.score, Math.round(run.score));
    rec.runs += 1;
    rec.totalDistance += distance;
    rec.totalBeasts += run.beasts;
    rec.bestBeasts = Math.max(rec.bestBeasts, run.beasts);
    rec.peakAltitude = Math.max(rec.peakAltitude, Math.round(run.peakAltitude));
    rec.topSpeed = Math.max(rec.topSpeed, Math.round(run.topSpeed));

    this.data.records[id] = rec;
    this.data.totalRuns += 1;
    this.data.hasLaunched = true;
    this.flush();
    return { newDistanceRecord, newScoreRecord };
  }

  /**
   * Progress toward revealing the fifth character, as a 0..1 fraction per
   * character.
   *
   * The threshold is measured against *lifetime* distance flown rather than a
   * single best run. The flight model's sustained equilibrium is about 105 m/s,
   * so covering 100 km without touching down would take roughly sixteen minutes
   * — far outside the thirty-second-to-three-minute run the game is built
   * around. Cumulative distance keeps the number, the four-character
   * requirement and the long-haul intent, and makes the reward something a
   * dedicated player actually reaches.
   */
  unlockProgress(): { unlocked: boolean; perCharacter: Array<[CharacterId, number]> } {
    const target = UNLOCK_KM * 1000;
    const perCharacter = UNLOCK_CHARACTERS.map(
      (id) => [id, Math.min(1, this.record(id).totalDistance / target)] as [CharacterId, number],
    );
    return {
      unlocked: this.data.devUnlock || perCharacter.every(([, p]) => p >= 1),
      perCharacter,
    };
  }

  isEithanUnlocked(): boolean {
    return this.unlockProgress().unlocked;
  }

  resetAll(): void {
    this.data = defaultSave();
    this.flush();
  }

  /** Coalesces writes to one per frame; localStorage writes are synchronous and slow. */
  private flush(): void {
    for (const fn of this.listeners) fn(this.data);
    if (this.writeQueued) return;
    this.writeQueued = true;
    queueMicrotask(() => {
      this.writeQueued = false;
      if (!this.storage) return;
      try {
        this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      } catch {
        // Quota exceeded or private-mode storage. The run still played fine.
      }
    });
  }
}

function safeStorage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    const probe = '__csl_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** Process-wide instance. */
export const save = new SaveManager();
