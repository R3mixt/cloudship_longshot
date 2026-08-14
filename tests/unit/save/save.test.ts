import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SAVE_VERSION,
  SaveManager,
  emptyRecord,
  migrate,
  type SaveData,
} from '@/core/save';
import { CHARACTER_ORDER } from '@/data/characters';
import { flushWrites, memoryStorage } from '../helpers';

const STORAGE_KEY = 'cloudship-longshot.save';
const LEGACY_KEY = 'csl5_rec';

/**
 * A genuine Web Storage implementation from the DOM environment, used to prove
 * the manager works against a real browser store and not only against the
 * in-memory stand-in. (`localStorage` itself is not usable here: the Node
 * runtime installs an inert global of that name that the DOM environment does
 * not replace, which is exactly the case `safeStorage` guards against.)
 */
const browserStorage: Storage = globalThis.sessionStorage;

beforeEach(() => {
  browserStorage.clear();
});

function newRun(over: Partial<Parameters<SaveManager['commitRun']>[1]> = {}) {
  return {
    distance: 500,
    score: 1200,
    beasts: 4,
    peakAltitude: 55,
    topSpeed: 900,
    ...over,
  };
}

describe('migrate', () => {
  it('returns a complete default save for an empty input', () => {
    const data = migrate(undefined);
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.records).toEqual({});
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
    expect(data.lastCharacter).toBe('lindon');
    expect(data.devUnlock).toBe(false);
    expect(data.hasLaunched).toBe(false);
    expect(data.totalRuns).toBe(0);
  });

  it('carries the prototype flat shape forward', () => {
    const data = migrate({ lindon: { dist: 1234, score: 5678 }, yerin: { dist: 90, score: 12 } });
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.records.lindon?.distance).toBe(1234);
    expect(data.records.lindon?.score).toBe(5678);
    expect(data.records.yerin?.distance).toBe(90);
    expect(data.records.mercy).toBeUndefined();
    // A player with prototype records has obviously launched before.
    expect(data.hasLaunched).toBe(true);
  });

  it('seeds lifetime totals from a prototype best distance', () => {
    const data = migrate({ ziel: { dist: 800, score: 100 } });
    expect(data.records.ziel?.totalDistance).toBe(800);
    expect(data.records.ziel?.runs).toBe(0);
  });

  it('carries the prototype dev unlock flag forward', () => {
    expect(migrate({ dev: true }).devUnlock).toBe(true);
    expect(migrate({ dev: 1 }).devUnlock).toBe(true);
    expect(migrate({ dev: '1' }).devUnlock).toBe(true);
    expect(migrate({ dev: 0 }).devUnlock).toBe(false);
  });

  it('reads a versioned save from the nested records shape', () => {
    const data = migrate({
      version: SAVE_VERSION,
      records: { mercy: { distance: 42, score: 7, runs: 3, totalDistance: 99 } },
      lastCharacter: 'mercy',
      totalRuns: 3,
    });
    expect(data.records.mercy?.distance).toBe(42);
    expect(data.records.mercy?.runs).toBe(3);
    expect(data.records.mercy?.totalDistance).toBe(99);
    expect(data.lastCharacter).toBe('mercy');
    expect(data.totalRuns).toBe(3);
  });

  it('accepts a partial save and fills the gaps', () => {
    const data = migrate({ version: 2, records: { yerin: { distance: 10 } } });
    expect(data.records.yerin).toEqual({ ...emptyRecord(), distance: 10, totalDistance: 10 });
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('accepts a save from an unknown future version without losing records', () => {
    const data = migrate({
      version: 999,
      records: { lindon: { distance: 5000, score: 90 } },
      somethingNew: { nested: true },
    });
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.records.lindon?.distance).toBe(5000);
  });

  it('always stamps the current version on the result', () => {
    for (const raw of [{}, { version: 1 }, { version: 2 }, { version: 99 }]) {
      expect(migrate(raw).version).toBe(SAVE_VERSION);
    }
  });

  it('drops an unrecognised character id', () => {
    const data = migrate({ version: 3, records: { nobody: { distance: 100 } } });
    expect(Object.keys(data.records)).toEqual([]);
  });

  it('falls back to a known character when lastCharacter is unusable', () => {
    for (const last of [undefined, null, 42, 'stranger', {}]) {
      expect(migrate({ version: 3, lastCharacter: last }).lastCharacter).toBe('lindon');
    }
    for (const id of CHARACTER_ORDER) {
      expect(migrate({ version: 3, lastCharacter: id }).lastCharacter).toBe(id);
    }
  });
});

describe('migrate corruption handling', () => {
  const junk: unknown[] = [
    null,
    undefined,
    0,
    42,
    -1,
    NaN,
    '',
    'not a save at all',
    '{"version":3}',
    true,
    false,
    [],
    [1, 2, 3],
    [{ distance: 5 }],
    () => undefined,
    Symbol('x'),
  ];

  it.each(junk.map((v, i) => [i, v] as const))('never throws on junk input #%i', (_i, value) => {
    expect(() => migrate(value)).not.toThrow();
    const data = migrate(value);
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.settings).toEqual(expect.objectContaining({ masterVolume: expect.any(Number) }));
    expect(typeof data.lastCharacter).toBe('string');
  });

  it('yields usable defaults for a bare array', () => {
    const data = migrate([]);
    expect(data.records).toEqual({});
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores records that are the wrong type', () => {
    const data = migrate({
      version: 3,
      records: { lindon: 'hello', yerin: 42, mercy: null, ziel: ['x'] },
    });
    expect(data.records.lindon).toBeUndefined();
    expect(data.records.yerin).toBeUndefined();
    expect(data.records.mercy).toBeUndefined();
    // An array is an object, so it survives as an all-zero record rather than
    // throwing; the important part is that nothing is NaN.
    expect(data.records.ziel?.distance).toBe(0);
  });

  it('replaces negative and non-numeric record fields with zero', () => {
    const data = migrate({
      version: 3,
      records: {
        lindon: {
          distance: -500,
          score: 'lots',
          runs: NaN,
          totalBeasts: -1,
          peakAltitude: Infinity,
          topSpeed: null,
        },
      },
    });
    const rec = data.records.lindon!;
    for (const value of Object.values(rec)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(rec.distance).toBe(0);
    expect(rec.score).toBe(0);
  });

  it('clamps volume settings into 0..1', () => {
    const data = migrate({
      version: 3,
      settings: { masterVolume: 5, musicVolume: -3, sfxVolume: 'loud' },
    });
    for (const key of ['masterVolume', 'musicVolume', 'sfxVolume'] as const) {
      expect(data.settings[key]).toBeGreaterThanOrEqual(0);
      expect(data.settings[key]).toBeLessThanOrEqual(1);
    }
    expect(data.settings.masterVolume).toBe(1);
    expect(data.settings.musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
    expect(data.settings.sfxVolume).toBe(DEFAULT_SETTINGS.sfxVolume);
  });

  it('keeps valid volume settings untouched', () => {
    const data = migrate({ version: 3, settings: { masterVolume: 0, musicVolume: 0.33 } });
    expect(data.settings.masterVolume).toBe(0);
    expect(data.settings.musicVolume).toBeCloseTo(0.33, 10);
  });

  it('falls back to the default for a non-boolean toggle', () => {
    const data = migrate({
      version: 3,
      settings: { screenShake: 'yes', reducedEffects: null, reducedFlash: 7 },
    });
    expect(data.settings.screenShake).toBe(DEFAULT_SETTINGS.screenShake);
    expect(data.settings.reducedEffects).toBe(DEFAULT_SETTINGS.reducedEffects);
    expect(data.settings.reducedFlash).toBe(DEFAULT_SETTINGS.reducedFlash);
  });
});

describe('SaveManager persistence', () => {
  it('round-trips through browser storage', async () => {
    const first = new SaveManager(browserStorage);
    first.commitRun('lindon', newRun({ distance: 1500, score: 4000 }));
    first.setSetting('masterVolume', 0.25);
    first.setLastCharacter('yerin');
    await flushWrites();

    const second = new SaveManager(browserStorage);
    expect(second.record('lindon').distance).toBe(1500);
    expect(second.record('lindon').score).toBe(4000);
    expect(second.settings.masterVolume).toBe(0.25);
    expect(second.get().lastCharacter).toBe('yerin');
    expect(second.get().version).toBe(SAVE_VERSION);
  });

  it('starts from defaults when nothing is stored', () => {
    const save = new SaveManager(browserStorage);
    expect(save.get().records).toEqual({});
    expect(save.get().totalRuns).toBe(0);
    expect(save.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('recovers from malformed JSON without throwing', () => {
    browserStorage.setItem(STORAGE_KEY, '{ this is not json');
    let save!: SaveManager;
    expect(() => {
      save = new SaveManager(browserStorage);
    }).not.toThrow();
    expect(save.get().records).toEqual({});
    expect(save.settings).toEqual(DEFAULT_SETTINGS);
  });

  it.each([
    ['a bare string', '"hello"'],
    ['a number', '17'],
    ['null', 'null'],
    ['an array', '[1,2,3]'],
    ['nonsense fields', '{"records":"nope","settings":42,"version":"three"}'],
  ])('recovers from %s in storage', (_label, stored) => {
    browserStorage.setItem(STORAGE_KEY, stored);
    const save = new SaveManager(browserStorage);
    expect(save.get().version).toBe(SAVE_VERSION);
    expect(save.settings.masterVolume).toBeGreaterThanOrEqual(0);
    expect(() => save.commitRun('lindon', newRun())).not.toThrow();
  });

  it('imports prototype records when no modern save exists', () => {
    browserStorage.setItem(LEGACY_KEY, JSON.stringify({ lindon: { dist: 2400, score: 9000 } }));
    browserStorage.setItem('csl5_dev', '1');
    const save = new SaveManager(browserStorage);
    expect(save.record('lindon').distance).toBe(2400);
    expect(save.get().devUnlock).toBe(true);
  });

  it('ignores a corrupt prototype save', () => {
    browserStorage.setItem(LEGACY_KEY, 'not json');
    expect(() => new SaveManager(browserStorage)).not.toThrow();
    expect(new SaveManager(browserStorage).get().records).toEqual({});
  });

  it('degrades gracefully with no storage at all', async () => {
    const save = new SaveManager(null);
    expect(save.get().settings).toEqual(DEFAULT_SETTINGS);
    expect(() => save.commitRun('mercy', newRun())).not.toThrow();
    expect(save.record('mercy').distance).toBe(500);
    save.setSetting('sfxVolume', 0.1);
    save.setDevUnlock(true);
    await flushWrites();
    expect(save.get().devUnlock).toBe(true);
    // A fresh manager cannot recover anything, but nothing threw.
    expect(new SaveManager(null).get().records).toEqual({});
  });

  it('survives a storage that throws on write', async () => {
    const hostile = {
      ...memoryStorage(),
      setItem: () => {
        throw new Error('quota exceeded');
      },
    } as unknown as Storage;
    const save = new SaveManager(hostile);
    expect(() => save.commitRun('ziel', newRun())).not.toThrow();
    await expect(flushWrites()).resolves.toBeUndefined();
    expect(save.record('ziel').distance).toBe(500);
  });

  it('notifies subscribers on every change and stops after unsubscribing', () => {
    const save = new SaveManager(memoryStorage());
    const seen: SaveData[] = [];
    const off = save.subscribe((d) => seen.push(d));
    save.setSetting('screenShake', false);
    save.setLastCharacter('ziel');
    expect(seen.length).toBe(2);
    off();
    save.setDevUnlock(true);
    expect(seen.length).toBe(2);
  });

  it('resets everything back to defaults', () => {
    const save = new SaveManager(memoryStorage());
    save.commitRun('lindon', newRun());
    save.setDevUnlock(true);
    save.resetAll();
    expect(save.get().records).toEqual({});
    expect(save.get().devUnlock).toBe(false);
    expect(save.get().totalRuns).toBe(0);
    expect(save.settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('commitRun', () => {
  it('reports the first run of a character as a new record', () => {
    const save = new SaveManager(memoryStorage());
    const result = save.commitRun('lindon', newRun({ distance: 300, score: 100 }));
    expect(result.newDistanceRecord).toBe(true);
    expect(result.newScoreRecord).toBe(true);
  });

  it('reports a shorter run as no record but still aggregates it', () => {
    const save = new SaveManager(memoryStorage());
    save.commitRun('lindon', newRun({ distance: 900, score: 5000, beasts: 6 }));
    const result = save.commitRun('lindon', newRun({ distance: 400, score: 1000, beasts: 2 }));

    expect(result.newDistanceRecord).toBe(false);
    expect(result.newScoreRecord).toBe(false);
    const rec = save.record('lindon');
    expect(rec.distance).toBe(900);
    expect(rec.score).toBe(5000);
    expect(rec.runs).toBe(2);
    expect(rec.totalDistance).toBe(1300);
    expect(rec.totalBeasts).toBe(8);
    expect(rec.bestBeasts).toBe(6);
  });

  it('reports a distance record and a score record independently', () => {
    const save = new SaveManager(memoryStorage());
    save.commitRun('yerin', newRun({ distance: 1000, score: 9000 }));
    const longer = save.commitRun('yerin', newRun({ distance: 1200, score: 100 }));
    expect(longer.newDistanceRecord).toBe(true);
    expect(longer.newScoreRecord).toBe(false);

    const richer = save.commitRun('yerin', newRun({ distance: 10, score: 20000 }));
    expect(richer.newDistanceRecord).toBe(false);
    expect(richer.newScoreRecord).toBe(true);
  });

  it('rounds distance, score, altitude and speed to whole units', () => {
    const save = new SaveManager(memoryStorage());
    save.commitRun('mercy', {
      distance: 812.6,
      score: 1499.5,
      beasts: 3,
      peakAltitude: 61.4,
      topSpeed: 1204.7,
    });
    const rec = save.record('mercy');
    expect(rec.distance).toBe(813);
    expect(rec.score).toBe(1500);
    expect(rec.peakAltitude).toBe(61);
    expect(rec.topSpeed).toBe(1205);
  });

  it('keeps the best peak altitude and top speed across runs', () => {
    const save = new SaveManager(memoryStorage());
    save.commitRun('ziel', newRun({ peakAltitude: 90, topSpeed: 1500 }));
    save.commitRun('ziel', newRun({ peakAltitude: 20, topSpeed: 400 }));
    expect(save.record('ziel').peakAltitude).toBe(90);
    expect(save.record('ziel').topSpeed).toBe(1500);
  });

  it('counts runs globally and marks the player as launched', () => {
    const save = new SaveManager(memoryStorage());
    expect(save.get().hasLaunched).toBe(false);
    save.commitRun('lindon', newRun());
    save.commitRun('yerin', newRun());
    expect(save.get().totalRuns).toBe(2);
    expect(save.get().hasLaunched).toBe(true);
  });

  it('keeps each character s records separate', () => {
    const save = new SaveManager(memoryStorage());
    save.commitRun('lindon', newRun({ distance: 1000 }));
    save.commitRun('yerin', newRun({ distance: 20 }));
    expect(save.record('lindon').distance).toBe(1000);
    expect(save.record('yerin').distance).toBe(20);
    expect(save.record('mercy')).toEqual(emptyRecord());
  });

  it('returns a safe empty record for a character that has never played', () => {
    const save = new SaveManager(memoryStorage());
    expect(save.record('ziel')).toEqual(emptyRecord());
    expect(save.get().records.ziel).toBeUndefined();
  });
});

describe('settings', () => {
  it('persists each setting independently', async () => {
    const storage = memoryStorage();
    const save = new SaveManager(storage);
    save.setSetting('musicVolume', 0.1);
    save.setSetting('screenShake', false);
    save.setSetting('reducedFlash', true);
    await flushWrites();

    const reloaded = new SaveManager(storage);
    expect(reloaded.settings.musicVolume).toBeCloseTo(0.1, 10);
    expect(reloaded.settings.screenShake).toBe(false);
    expect(reloaded.settings.reducedFlash).toBe(true);
    expect(reloaded.settings.sfxVolume).toBe(DEFAULT_SETTINGS.sfxVolume);
  });

  it('clamps an out-of-range volume when the save is reloaded', async () => {
    const storage = memoryStorage();
    const save = new SaveManager(storage);
    save.update((data) => {
      data.settings.masterVolume = 9;
    });
    await flushWrites();
    expect(new SaveManager(storage).settings.masterVolume).toBe(1);
  });
});
