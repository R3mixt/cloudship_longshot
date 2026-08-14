/**
 * Character select.
 *
 * Four techniques as full-width cards, then the hidden fifth slot. The locked
 * slot is followed by a bar per character showing how far each one still has to
 * fly, which turns "reach 100 km with all four" from an opaque wall into a
 * checklist the player can watch fill.
 */

import {
  CHARACTERS,
  UNLOCK_CHARACTERS,
  UNLOCK_KM,
  type CharacterId,
} from '@/data/characters';
import { pulse } from '../anim';
import { el } from '../dom';
import * as fmt from '../format';
import { lockGlyph, verbGlyph } from '../glyphs';
import { cardRecordLine, characterName } from '../labels';
import { accentFor, applyAccent, COLORS } from '../theme';
import {
  button,
  panel,
  progressBar,
  replace,
  setButtonSub,
  type ProgressHandle,
} from '../widgets';
import type { Screen, UiContext } from './types';

const PLAYABLE: CharacterId[] = ['lindon', 'yerin', 'mercy', 'ziel'];

interface CardHandle {
  id: CharacterId;
  root: HTMLButtonElement;
  setSelected(selected: boolean): void;
  setRecordLine(text: string): void;
  reveal?(): void;
}

export function createCharacterSelectScreen(ctx: UiContext): Screen {
  const shell = panel({
    id: 'characterSelect',
    title: 'CHARACTERS',
    subtitle: 'Pick a technique, then launch',
    size: 'wide',
    onBack: () => back(),
  });

  const back = (): void => {
    ctx.api.playSound('ui.back');
    ctx.api.back();
  };

  const select = (id: CharacterId): void => {
    if (ctx.api.getCharacter() === id) {
      // Activating the already-selected card is the fast path to flight.
      ctx.api.playSound('ui.click');
      ctx.api.startRun();
      return;
    }
    ctx.api.playSound('ui.select');
    ctx.api.setCharacter(id);
    ctx.refresh();
  };

  const cards: CardHandle[] = PLAYABLE.map((id) => buildCard(id, () => select(id)));
  const eithanCard = buildEithanCard(
    () => {
      if (!ctx.api.isEithanUnlocked()) {
        ctx.api.playSound('ui.locked');
        pulse(eithanCard.root, 'is-refused');
        return;
      }
      select('eithan');
    },
  );

  const list = el('div', {
    className: 'ui-cards',
    children: [...cards.map((card) => card.root), eithanCard.root],
  });

  const bars = new Map<CharacterId, ProgressHandle>();
  for (const id of UNLOCK_CHARACTERS) {
    bars.set(
      id,
      progressBar({
        label: characterName(id, true).toUpperCase(),
        value: 0,
        accent: accentFor(id).glow,
        ariaLabel: `${characterName(id, true)} progress toward the hidden slot`,
      }),
    );
  }

  const unlock = el('div', {
    className: 'ui-unlock',
    children: [
      el('p', {
        className: 'ui-unlock__head',
        text: `Every technique must reach ${UNLOCK_KM} km.`,
      }),
      ...[...bars.values()].map((bar) => bar.root),
    ],
  });

  const launch = button({
    label: 'LAUNCH',
    variant: 'primary',
    sub: '',
    onActivate: () => {
      ctx.api.playSound('ui.click');
      ctx.api.startRun();
    },
  });

  shell.body.appendChild(
    el('div', {
      className: 'ui-select',
      children: [
        list,
        unlock,
        el('div', {
          className: 'ui-actions ui-actions--pair',
          children: [launch, button({ label: 'BACK', onActivate: back })],
        }),
      ],
    }),
  );

  const refresh = (): void => {
    const current = ctx.api.getCharacter();
    const revealed = ctx.api.isEithanUnlocked();
    applyAccent(shell.dialog, current);
    setButtonSub(launch, characterName(current, revealed).toUpperCase());

    for (const card of cards) {
      card.setSelected(card.id === current);
      card.setRecordLine(cardRecordLine(ctx.api.save.record(card.id)));
    }

    if (revealed) eithanCard.reveal?.();
    eithanCard.setSelected(current === 'eithan');
    eithanCard.setRecordLine(revealed ? 'Unranked — records unaffected' : '');

    unlock.hidden = revealed;
    for (const [id, bar] of bars) {
      const best = ctx.api.save.record(id).distance;
      const fraction = Math.min(1, best / (UNLOCK_KM * 1000));
      bar.set(fraction, `${fmt.kilometers(best)} / ${UNLOCK_KM} km`);
    }
  };

  return {
    id: 'characterSelect',
    layer: shell.layer,
    dialog: shell.dialog,
    refresh,
    focusPrimary: () => {
      // The selected card, not LAUNCH: this screen exists to change the
      // selection, so focus starts on the current value the way a native list
      // control does. LAUNCH is one key away in either direction.
      const current = ctx.api.getCharacter();
      const card = cards.find((entry) => entry.id === current);
      (card?.root ?? eithanCard.root).focus();
    },
  };
}

function buildCard(id: CharacterId, onActivate: () => void): CardHandle {
  const def = CHARACTERS[id];
  const accent = accentFor(id);

  const portrait = el('span', {
    className: 'ui-card__portrait',
    children: [verbGlyph(def.verb, accent, 30)],
  });
  const recordLine = el('span', { className: 'ui-card__record' });

  const root = el('button', {
    className: 'ui-card',
    attrs: { type: 'button', 'aria-pressed': 'false' },
    children: [
      portrait,
      el('span', {
        className: 'ui-card__text',
        children: [
          el('span', { className: 'ui-card__name', text: def.realName.toUpperCase() }),
          el('span', { className: 'ui-card__ability', text: def.ability }),
          el('span', { className: 'ui-card__trait', text: def.trait }),
          recordLine,
        ],
      }),
    ],
  });
  root.style.setProperty('--accent', accent.glow);
  root.style.setProperty('--accent-deep', accent.deep);
  root.addEventListener('click', onActivate);

  return {
    id,
    root,
    setSelected(selected) {
      root.classList.toggle('is-selected', selected);
      root.setAttribute('aria-pressed', selected ? 'true' : 'false');
    },
    setRecordLine(text) {
      recordLine.textContent = text;
    },
  };
}

function buildEithanCard(onActivate: () => void): CardHandle {
  const def = CHARACTERS.eithan;
  const accent = accentFor('eithan');

  const portrait = el('span', {
    className: 'ui-card__portrait',
    children: [lockGlyph(28)],
  });
  const name = el('span', { className: 'ui-card__name', text: def.displayName });
  const ability = el('span', { className: 'ui-card__ability', text: 'SEALED' });
  const trait = el('span', {
    className: 'ui-card__trait',
    text: `Reach ${UNLOCK_KM} km with all four to reveal`,
  });
  const recordLine = el('span', { className: 'ui-card__record' });

  const root = el('button', {
    className: 'ui-card ui-card--secret is-locked',
    attrs: { type: 'button', 'aria-pressed': 'false', 'aria-disabled': 'true' },
    children: [
      portrait,
      el('span', {
        className: 'ui-card__text',
        children: [name, ability, trait, recordLine],
      }),
    ],
  });
  root.style.setProperty('--accent', COLORS.border);
  root.addEventListener('click', onActivate);

  let revealed = false;

  return {
    id: 'eithan',
    root,
    reveal() {
      if (revealed) return;
      revealed = true;
      root.classList.remove('is-locked');
      root.removeAttribute('aria-disabled');
      root.style.setProperty('--accent', accent.glow);
      root.style.setProperty('--accent-deep', accent.deep);
      replace(portrait, [verbGlyph(def.verb, accent, 30)]);
      name.textContent = def.realName.toUpperCase();
      ability.textContent = def.ability;
      trait.textContent = def.quote;
    },
    setSelected(selected) {
      root.classList.toggle('is-selected', selected);
      root.setAttribute('aria-pressed', selected ? 'true' : 'false');
    },
    setRecordLine(text) {
      recordLine.textContent = text;
    },
  };
}
