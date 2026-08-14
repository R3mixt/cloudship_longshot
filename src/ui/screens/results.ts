/**
 * Results.
 *
 * Built around one decision: launch again. The distance is the hero number, the
 * retry button owns focus the moment the screen opens, and Enter, Space or R
 * all fire it — the player never has to look for the button they already know
 * they want.
 */

import { CHARACTERS } from '@/data/characters';
import { countUp, pulse, type Cancel } from '../anim';
import { el } from '../dom';
import * as fmt from '../format';
import { starGlyph } from '../glyphs';
import { characterName } from '../labels';
import { applyAccent } from '../theme';
import { button, panel, replace, statRow } from '../widgets';
import type { Screen, UiContext } from './types';

export function createResultsScreen(ctx: UiContext): Screen {
  const shell = panel({ id: 'results', title: 'TECHNIQUE DISSIPATED' });

  const heroValue = el('span', { className: 'ui-hero__value', text: '0' });
  const heroUnit = el('span', { className: 'ui-hero__unit', text: 'm' });
  const heroAside = el('span', { className: 'ui-hero__aside' });
  const hero = el('div', {
    className: 'ui-hero',
    children: [
      el('span', { className: 'ui-hero__label', text: 'DISTANCE' }),
      el('span', { className: 'ui-hero__figure', children: [heroValue, heroUnit] }),
      heroAside,
    ],
  });

  const banner = el('p', {
    className: 'ui-banner',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  banner.hidden = true;

  const cause = el('p', { className: 'ui-cause' });
  cause.hidden = true;

  const score = statRow('Score', '0', { accent: true });
  const beasts = statRow('Beasts struck', '0');
  const altitude = statRow('Peak altitude', '0 m');
  const topSpeed = statRow('Top speed', '0 m/s');

  const again = button({
    label: 'LAUNCH AGAIN',
    variant: 'primary',
    className: 'ui-btn--hero',
    onActivate: () => {
      ctx.api.playSound('ui.click');
      ctx.api.retry();
    },
  });

  const changeCharacter = button({
    label: 'CHANGE CHARACTER',
    onActivate: () => {
      ctx.api.playSound('ui.click');
      ctx.api.show('characterSelect');
    },
  });

  shell.body.appendChild(
    el('div', {
      className: 'ui-results',
      children: [
        cause,
        hero,
        banner,
        el('div', {
          className: 'ui-stats',
          children: [score.root, beasts.root, altitude.root, topSpeed.root],
        }),
        el('div', { className: 'ui-actions', children: [again, changeCharacter] }),
      ],
    }),
  );

  let cancelCount: Cancel = () => {};
  let pendingDistance = 0;

  const refresh = (): void => {
    cancelCount();
    const summary = ctx.api.getLastResults();
    if (!summary) {
      shell.setTitle('TECHNIQUE DISSIPATED');
      shell.setSubtitle('');
      pendingDistance = 0;
      heroValue.textContent = '0';
      return;
    }

    const { stats } = summary;
    const revealed = ctx.api.isEithanUnlocked();
    const name = characterName(summary.character, revealed);
    applyAccent(shell.dialog, summary.character);
    shell.dialog.classList.toggle('ui-panel--unranked', summary.unranked);

    if (summary.unranked) {
      shell.setTitle('THE FIELD HAS BEEN CLEANSED');
      shell.setSubtitle('Ozriel does not compete. Records unaffected.');
    } else {
      shell.setTitle(stats.deathCause ? 'TECHNIQUE DESTROYED' : 'TECHNIQUE DISSIPATED');
      shell.setSubtitle(`${name.toUpperCase()} · ${CHARACTERS[summary.character].ability}`);
    }

    cause.hidden = !stats.deathCause || summary.unranked;
    cause.textContent = stats.deathCause ?? '';

    pendingDistance = stats.distance;
    heroValue.textContent = fmt.group(stats.distance);
    heroAside.textContent =
      stats.distance >= 1000
        ? fmt.distance(stats.distance)
        : `${stats.flightTime.toFixed(1)}s aloft`;

    score.setValue(fmt.group(stats.score));
    beasts.setValue(fmt.group(stats.beasts));
    altitude.setValue(fmt.meters(stats.peakAltitude));
    topSpeed.setValue(fmt.speed(stats.topSpeed));

    const record = summary.newDistanceRecord
      ? '★ NEW PERSONAL BEST ★'
      : summary.newScoreRecord
        ? '★ NEW BEST SCORE ★'
        : '';
    banner.hidden = record.length === 0;
    if (record) {
      replace(banner, [
        starGlyph(13),
        el('span', { className: 'ui-banner__text', text: record.replace(/★/g, '').trim() }),
        starGlyph(13),
      ]);
    }

    if (!summary.unranked && !summary.newDistanceRecord) {
      const best = ctx.api.save.record(summary.character).distance;
      if (best > 0) heroAside.textContent = `PERSONAL BEST ${fmt.meters(best)}`;
    }
  };

  return {
    id: 'results',
    layer: shell.layer,
    dialog: shell.dialog,
    refresh,
    focusPrimary: () => again.focus(),
    onShow: () => {
      const instant = ctx.api.save.settings.reducedEffects;
      cancelCount = countUp(heroValue, pendingDistance, fmt.group, { instant });
      if (!banner.hidden && !ctx.api.save.settings.reducedFlash) pulse(banner, 'is-celebrating');
    },
    onHide: () => {
      cancelCount();
      cancelCount = () => {};
    },
    onKeyDown: (event) => {
      if (event.key === 'r' || event.key === 'R') {
        ctx.api.playSound('ui.click');
        ctx.api.retry();
        return true;
      }
      const target = event.target;
      const onControl = target instanceof HTMLButtonElement || target instanceof HTMLInputElement;
      if ((event.key === 'Enter' || event.key === ' ') && !onControl) {
        ctx.api.playSound('ui.click');
        ctx.api.retry();
        return true;
      }
      return false;
    },
  };
}
