/**
 * Shared wording. The hidden fifth character is the reason this exists: exactly
 * one function decides whether a name is shown or withheld, so no screen can
 * leak it by accident.
 */

import { CHARACTERS, type CharacterId } from '@/data/characters';
import type { CharacterRecord } from '@/core/save';
import * as fmt from './format';

export function characterName(id: CharacterId, revealed: boolean): string {
  const def = CHARACTERS[id];
  return def.secret && !revealed ? def.displayName : def.realName;
}

export function characterAbility(id: CharacterId, revealed: boolean): string {
  const def = CHARACTERS[id];
  return def.secret && !revealed ? 'LOCKED' : def.ability;
}

/** "BEST 1,234 m" / "NO RECORD YET" — the line under the launch button. */
export function bestLine(record: CharacterRecord): string {
  return record.distance > 0 ? `BEST ${fmt.meters(record.distance)}` : 'NO RECORD YET';
}

/** Compact record summary for a character card. */
export function cardRecordLine(record: CharacterRecord): string {
  if (record.distance <= 0) return 'No flights yet';
  return `${fmt.meters(record.distance)} · ${fmt.group(record.score)} pts`;
}
