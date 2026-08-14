/**
 * Records.
 *
 * Per-technique bests and lifetime aggregates. The reset is deliberately quiet
 * — ghost styling, bottom of the panel, and a two-step confirm built inline.
 * A `window.confirm` would block the game loop and cannot be styled or focused
 * like the rest of the interface, so the confirm lives in the panel.
 */

import { UNLOCK_CHARACTERS, type CharacterId } from '@/data/characters';
import { el } from '../dom';
import * as fmt from '../format';
import { characterName } from '../labels';
import { accentFor } from '../theme';
import { button, panel, replace, statRow } from '../widgets';
import type { Screen, UiContext } from './types';

export function createRecordsScreen(ctx: UiContext): Screen {
  const back = (): void => {
    ctx.api.playSound('ui.back');
    ctx.api.back();
  };

  const shell = panel({
    id: 'records',
    title: 'RECORDS',
    subtitle: 'Stored in this browser only',
    size: 'wide',
    onBack: back,
  });

  const list = el('div', { className: 'ui-records' });
  const lifetime = el('div', { className: 'ui-records__lifetime' });
  const dangerZone = el('div', { className: 'ui-danger' });
  const status = el('p', {
    className: 'ui-status',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });

  const done = button({ label: 'DONE', variant: 'primary', onActivate: back });

  shell.body.appendChild(
    el('div', {
      className: 'ui-records-screen',
      children: [
        list,
        lifetime,
        dangerZone,
        status,
        el('div', { className: 'ui-actions', children: [done] }),
      ],
    }),
  );

  const buildResetIdle = (): void => {
    replace(dangerZone, [
      button({
        label: 'RESET ALL RECORDS',
        variant: 'ghost',
        className: 'ui-btn--quiet',
        onActivate: () => {
          ctx.api.playSound('ui.click');
          buildResetConfirm();
        },
      }),
    ]);
  };

  const buildResetConfirm = (): void => {
    const cancel = button({
      label: 'CANCEL',
      onActivate: () => {
        ctx.api.playSound('ui.back');
        buildResetIdle();
        focusReset();
      },
    });
    const erase = button({
      label: 'ERASE EVERYTHING',
      variant: 'danger',
      onActivate: () => {
        ctx.api.playSound('ui.click');
        ctx.api.save.resetAll();
        ctx.api.applySettings();
        ctx.api.setCharacter(ctx.api.save.get().lastCharacter);
        buildResetIdle();
        ctx.refresh();
        status.textContent = 'All records and settings cleared.';
        focusReset();
      },
    });

    replace(dangerZone, [
      el('p', {
        className: 'ui-danger__warning',
        text: 'Erase every record, setting and unlock on this device? This cannot be undone.',
      }),
      el('div', { className: 'ui-danger__actions', children: [cancel, erase] }),
    ]);
    cancel.focus();
  };

  const focusReset = (): void => {
    const first = dangerZone.querySelector<HTMLButtonElement>('button');
    (first ?? done).focus();
  };

  const refresh = (): void => {
    const revealed = ctx.api.isEithanUnlocked();

    replace(
      list,
      UNLOCK_CHARACTERS.map((id) => characterBlock(ctx, id)).concat(
        revealed ? [secretBlock()] : [],
      ),
    );

    const save = ctx.api.save;
    let totalDistance = 0;
    let totalBeasts = 0;
    let bestFlight = 0;
    for (const id of UNLOCK_CHARACTERS) {
      const record = save.record(id);
      totalDistance += record.totalDistance;
      totalBeasts += record.totalBeasts;
      bestFlight = Math.max(bestFlight, record.distance);
    }

    replace(lifetime, [
      el('h2', { className: 'ui-section__title', text: 'LIFETIME' }),
      el('div', {
        className: 'ui-stats',
        children: [
          statRow('Launches', fmt.group(save.get().totalRuns)).root,
          statRow('Distance flown', fmt.distance(totalDistance)).root,
          statRow('Beasts struck', fmt.group(totalBeasts)).root,
          statRow('Longest flight', fmt.meters(bestFlight), { accent: true }).root,
        ],
      }),
    ]);

    if (dangerZone.childElementCount === 0) buildResetIdle();
  };

  return {
    id: 'records',
    layer: shell.layer,
    dialog: shell.dialog,
    refresh,
    focusPrimary: () => done.focus(),
    onHide: () => {
      // Never leave a half-armed confirm waiting behind a closed panel.
      buildResetIdle();
      status.textContent = '';
    },
  };
}

function characterBlock(ctx: UiContext, id: CharacterId): HTMLElement {
  const record = ctx.api.save.record(id);
  const accent = accentFor(id);
  const heading = el('h2', {
    className: 'ui-record__name',
    text: characterName(id, true).toUpperCase(),
  });
  heading.style.setProperty('--accent', accent.glow);

  return el('section', {
    className: 'ui-record',
    children: [
      heading,
      el('div', {
        className: 'ui-stats',
        children: [
          statRow('Best distance', fmt.meters(record.distance), { accent: true }).root,
          statRow('Best score', fmt.group(record.score), { accent: true }).root,
          statRow('Launches', fmt.group(record.runs)).root,
          statRow('Distance flown', fmt.distance(record.totalDistance)).root,
          statRow('Best beasts in a run', fmt.group(record.bestBeasts)).root,
          statRow('Peak altitude', fmt.meters(record.peakAltitude)).root,
          statRow('Top speed', fmt.speed(record.topSpeed)).root,
        ],
      }),
    ],
  });
}

function secretBlock(): HTMLElement {
  const accent = accentFor('eithan');
  const heading = el('h2', {
    className: 'ui-record__name',
    text: characterName('eithan', true).toUpperCase(),
  });
  heading.style.setProperty('--accent', accent.glow);
  return el('section', {
    className: 'ui-record ui-record--secret',
    children: [
      heading,
      el('p', { className: 'ui-note', text: 'Ozriel does not compete. Records unaffected.' }),
    ],
  });
}
