import { beforeEach, describe, expect, it } from 'vitest';
import { SaveManager, emptyRecord } from '@/core/save';
import { CHARACTERS, UNLOCK_CHARACTERS, UNLOCK_KM, type CharacterId } from '@/data/characters';
import { memoryStorage } from '../helpers';

/** Metres each of the four must reach, read from the data rather than assumed. */
const TARGET = UNLOCK_KM * 1000;

let save: SaveManager;

beforeEach(() => {
  save = new SaveManager(memoryStorage());
});

/**
 * Sets a character's lifetime distance, which is what the gate measures. Best
 * single-run distance is set alongside it so the fixture stays coherent.
 */
function setDistance(id: CharacterId, metres: number): void {
  save.update((data) => {
    data.records[id] = { ...emptyRecord(), distance: metres, totalDistance: metres };
  });
}

describe('the Eithan unlock gate', () => {
  it('is locked on a fresh save', () => {
    expect(save.isEithanUnlocked()).toBe(false);
    const { unlocked, perCharacter } = save.unlockProgress();
    expect(unlocked).toBe(false);
    expect(perCharacter.map(([, p]) => p)).toEqual(UNLOCK_CHARACTERS.map(() => 0));
  });

  it('stays locked while any of the four is short', () => {
    for (const id of UNLOCK_CHARACTERS) setDistance(id, TARGET);
    // Knock each one back below the line in turn.
    for (const shortfall of UNLOCK_CHARACTERS) {
      setDistance(shortfall, TARGET - 1);
      expect(save.isEithanUnlocked(), `${shortfall} short should keep the gate closed`).toBe(false);
      setDistance(shortfall, TARGET);
    }
  });

  it('stays locked when three of the four reach the threshold', () => {
    const [a, b, c] = UNLOCK_CHARACTERS;
    setDistance(a, TARGET);
    setDistance(b, TARGET * 3);
    setDistance(c, TARGET);
    expect(save.isEithanUnlocked()).toBe(false);
    const progress = save.unlockProgress();
    expect(progress.perCharacter.filter(([, p]) => p >= 1)).toHaveLength(3);
  });

  it('unlocks when all four reach the threshold', () => {
    for (const id of UNLOCK_CHARACTERS) setDistance(id, TARGET);
    expect(save.isEithanUnlocked()).toBe(true);
    expect(save.unlockProgress().unlocked).toBe(true);
  });

  it('unlocks on exactly the threshold, not one metre past it', () => {
    for (const id of UNLOCK_CHARACTERS) setDistance(id, TARGET);
    expect(save.isEithanUnlocked()).toBe(true);
    setDistance(UNLOCK_CHARACTERS[0], TARGET - 1);
    expect(save.isEithanUnlocked()).toBe(false);
  });

  it('is forced open by the tester unlock', () => {
    expect(save.isEithanUnlocked()).toBe(false);
    save.setDevUnlock(true);
    expect(save.isEithanUnlocked()).toBe(true);
    expect(save.unlockProgress().unlocked).toBe(true);
    // The underlying progress is untouched — the flag is an override, not a grant.
    expect(save.unlockProgress().perCharacter.every(([, p]) => p === 0)).toBe(true);
  });

  it('closes again when the tester unlock is turned off', () => {
    save.setDevUnlock(true);
    save.setDevUnlock(false);
    expect(save.isEithanUnlocked()).toBe(false);
  });

  it('survives a reload', async () => {
    const storage = memoryStorage();
    const first = new SaveManager(storage);
    for (const id of UNLOCK_CHARACTERS) {
      first.update((data) => {
        data.records[id] = { ...emptyRecord(), distance: TARGET, totalDistance: TARGET };
      });
    }
    await Promise.resolve();
    expect(new SaveManager(storage).isEithanUnlocked()).toBe(true);
  });
});

describe('unlockProgress', () => {
  it('reports one entry per gating character, in order', () => {
    const { perCharacter } = save.unlockProgress();
    expect(perCharacter.map(([id]) => id)).toEqual(UNLOCK_CHARACTERS);
  });

  it('reports the fraction of the target reached', () => {
    setDistance(UNLOCK_CHARACTERS[0], TARGET / 4);
    setDistance(UNLOCK_CHARACTERS[1], TARGET / 2);
    const progress = Object.fromEntries(save.unlockProgress().perCharacter);
    expect(progress[UNLOCK_CHARACTERS[0]]).toBeCloseTo(0.25, 10);
    expect(progress[UNLOCK_CHARACTERS[1]]).toBeCloseTo(0.5, 10);
    expect(progress[UNLOCK_CHARACTERS[2]]).toBe(0);
  });

  it('clamps every fraction to 1', () => {
    for (const id of UNLOCK_CHARACTERS) setDistance(id, TARGET * 25);
    for (const [, fraction] of save.unlockProgress().perCharacter) {
      expect(fraction).toBe(1);
    }
  });

  it('never reports a fraction outside 0..1', () => {
    setDistance(UNLOCK_CHARACTERS[0], 0);
    setDistance(UNLOCK_CHARACTERS[1], 1);
    setDistance(UNLOCK_CHARACTERS[2], TARGET * 1000);
    for (const [, fraction] of save.unlockProgress().perCharacter) {
      expect(fraction).toBeGreaterThanOrEqual(0);
      expect(fraction).toBeLessThanOrEqual(1);
    }
  });

  it('measures lifetime distance flown, not a single best run', () => {
    // The port deliberately gates on cumulative distance: a single 100 km flight
    // is far longer than the run lengths the game is built around.
    for (const id of UNLOCK_CHARACTERS) {
      save.update((data) => {
        data.records[id] = { ...emptyRecord(), distance: TARGET * 2, totalDistance: 0 };
      });
    }
    expect(save.isEithanUnlocked()).toBe(false);

    for (const id of UNLOCK_CHARACTERS) {
      save.update((data) => {
        data.records[id] = { ...emptyRecord(), distance: 900, totalDistance: TARGET };
      });
    }
    expect(save.isEithanUnlocked()).toBe(true);
  });

  it('accumulates toward the gate one committed run at a time', () => {
    const perRun = TARGET / 4;
    for (const id of UNLOCK_CHARACTERS) {
      for (let i = 0; i < 4; i++) {
        save.commitRun(id, {
          distance: perRun,
          score: 10,
          beasts: 1,
          peakAltitude: 10,
          topSpeed: 500,
        });
      }
    }
    expect(save.isEithanUnlocked()).toBe(true);
  });

  it('ignores Eithan s own distance', () => {
    expect(UNLOCK_CHARACTERS).not.toContain('eithan');
    setDistance('eithan', TARGET * 10);
    expect(save.isEithanUnlocked()).toBe(false);
  });
});

describe('the unlock configuration', () => {
  it('ships at 100 km', () => {
    expect(UNLOCK_KM).toBe(100);
  });

  it('gates on exactly the four playable characters', () => {
    expect(UNLOCK_CHARACTERS).toEqual(['lindon', 'yerin', 'mercy', 'ziel']);
  });

  it('keeps Eithan hidden behind a placeholder name until revealed', () => {
    expect(CHARACTERS.eithan.secret).toBe(true);
    expect(CHARACTERS.eithan.displayName).toBe('???');
    expect(CHARACTERS.eithan.realName).toBe('Eithan');
    expect(CHARACTERS.eithan.quote).toBe('Ah. You found me. How predictable — of me, I mean.');
  });

  it('leaves the four playable characters visible from the start', () => {
    for (const id of UNLOCK_CHARACTERS) {
      expect(CHARACTERS[id].secret).toBeUndefined();
    }
  });
});
