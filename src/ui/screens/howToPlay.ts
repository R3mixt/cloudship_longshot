/**
 * How to Play.
 *
 * Three drawn steps and a four-way legend rather than a paragraph. The
 * diagrams are generated vector shapes, so this screen is readable before any
 * sprite exists and stays correct if the art changes. Everything fits one
 * screen at 360px so nobody has to scroll to learn the game.
 */

import { el } from '../dom';
import { legendGlyph, stepDiagram, type LegendKind, type StepKind } from '../glyphs';
import { button, panel } from '../widgets';
import type { Screen, UiContext } from './types';

interface StepCopy {
  kind: StepKind;
  title: string;
  body: string;
}

const STEPS: StepCopy[] = [
  { kind: 'charge', title: 'HOLD', body: 'Charge the launch. Release on the gold mark for a perfect shot.' },
  { kind: 'aim', title: 'DRAG', body: 'Drag to set the angle before you let go.' },
  { kind: 'tap', title: 'TAP', body: 'Tap in flight to spend a charge on your technique. Three per run.' },
];

interface LegendCopy {
  kind: LegendKind;
  title: string;
  body: string;
}

const LEGEND: LegendCopy[] = [
  {
    kind: 'boost',
    title: 'BOOST',
    body: 'Bird flocks, golden beasts, rune formations, Thousand-Mile Clouds',
  },
  {
    kind: 'aura',
    title: 'VITAL AURA',
    body: 'Glowing clouds: restore a charge, aura shield, or light-as-air',
  },
  { kind: 'slow', title: 'SLOW', body: 'Storm clouds, armoured beasts' },
  { kind: 'death', title: 'DEATH', body: 'Rock spires on the ground' },
];

export function createHowToPlayScreen(ctx: UiContext): Screen {
  const back = (): void => {
    ctx.api.playSound('ui.back');
    ctx.api.back();
  };

  const shell = panel({
    id: 'howToPlay',
    title: 'HOW TO PLAY',
    subtitle: 'Three moves, four things to read',
    size: 'wide',
    onBack: back,
  });

  const done = button({ label: 'GOT IT', variant: 'primary', onActivate: back });

  shell.body.appendChild(
    el('div', {
      className: 'ui-howto',
      children: [
        el('ol', {
          className: 'ui-steps',
          children: STEPS.map((step, index) =>
            el('li', {
              className: 'ui-step',
              children: [
                el('span', { className: 'ui-step__index', text: String(index + 1) }),
                el('span', { className: 'ui-step__art', children: [stepDiagram(step.kind)] }),
                el('span', { className: 'ui-step__title', text: step.title }),
                el('span', { className: 'ui-step__body', text: step.body }),
              ],
            }),
          ),
        }),
        el('ul', {
          className: 'ui-legend',
          children: LEGEND.map((entry) =>
            el('li', {
              className: `ui-legend__row ui-legend__row--${entry.kind}`,
              children: [
                el('span', { className: 'ui-legend__icon', children: [legendGlyph(entry.kind)] }),
                el('span', {
                  className: 'ui-legend__text',
                  children: [
                    el('span', { className: 'ui-legend__title', text: entry.title }),
                    el('span', { className: 'ui-legend__body', text: entry.body }),
                  ],
                }),
              ],
            }),
          ),
        }),
        el('p', {
          className: 'ui-note ui-note--keys',
          text: 'Keyboard: SPACE charges and releases · ARROW KEYS aim',
        }),
        el('div', { className: 'ui-actions', children: [done] }),
      ],
    }),
  );

  return {
    id: 'howToPlay',
    layer: shell.layer,
    dialog: shell.dialog,
    refresh: () => {},
    focusPrimary: () => done.focus(),
  };
}
