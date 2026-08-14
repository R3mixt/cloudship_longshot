/**
 * The DOM interface layer.
 *
 * The gameplay canvas renders at 320x180, where text tops out around six pixels
 * tall. Menus therefore live in HTML above the canvas: crisp type at any device
 * pixel ratio, real focus management, and screen-reader compatibility, while the
 * world keeps rendering underneath.
 *
 * `createUi` is the only entry point. Everything else in this folder is internal.
 */

import './styles.css';

import type { AppApi, ScreenId, UiHandle } from '@/app/types';
import { el } from './dom';
import { moveFocus, ownsHorizontalArrows, trapTab, type Direction } from './focus';
import { createCharacterSelectScreen } from './screens/characterSelect';
import { createCreditsScreen } from './screens/credits';
import { createHowToPlayScreen } from './screens/howToPlay';
import { createMenuScreen } from './screens/menu';
import { createPauseScreen } from './screens/pause';
import { createRecordsScreen } from './screens/records';
import { createResultsScreen } from './screens/results';
import { createSettingsScreen } from './screens/settings';
import type { Screen, UiContext } from './screens/types';

type PanelId = Exclude<ScreenId, 'none'>;

const FACTORIES: Record<PanelId, (ctx: UiContext) => Screen> = {
  menu: createMenuScreen,
  characterSelect: createCharacterSelectScreen,
  howToPlay: createHowToPlayScreen,
  records: createRecordsScreen,
  settings: createSettingsScreen,
  credits: createCreditsScreen,
  results: createResultsScreen,
  pause: createPauseScreen,
};

const ARROWS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export function createUi(root: HTMLElement, api: AppApi): UiHandle {
  const container = el('div', { className: 'ui-root' });
  root.appendChild(container);

  const screens = new Map<PanelId, Screen>();
  let current: ScreenId = 'none';
  let destroyed = false;

  const ctx: UiContext = { api, refresh: () => refresh() };

  function ensure(id: PanelId): Screen {
    const existing = screens.get(id);
    if (existing) return existing;
    const screen = FACTORIES[id](ctx);
    screens.set(id, screen);
    container.appendChild(screen.layer);
    return screen;
  }

  /** Player comfort settings also govern the interface's own motion. */
  function applyPreferences(): void {
    const settings = api.save.settings;
    container.classList.toggle('is-reduced-effects', settings.reducedEffects);
    container.classList.toggle('is-reduced-flash', settings.reducedFlash);
  }

  function refresh(): void {
    if (destroyed) return;
    applyPreferences();
    if (current === 'none') return;
    const screen = screens.get(current as PanelId);
    if (!screen) return;
    screen.refresh();
    // A rebuild can remove the focused node; never leave focus on the body,
    // or the next keystroke reaches the canvas instead of the panel.
    const active = document.activeElement;
    if (!active || !screen.dialog.contains(active)) screen.focusPrimary();
  }

  function show(next: ScreenId): void {
    if (destroyed) return;
    applyPreferences();

    if (next === current) {
      if (next !== 'none') {
        const same = screens.get(next as PanelId);
        same?.refresh();
        same?.focusPrimary();
      }
      return;
    }

    const previous = current !== 'none' ? screens.get(current as PanelId) : undefined;
    if (previous) {
      previous.layer.classList.remove('is-open');
      previous.onHide?.();
    }

    current = next;
    if (next === 'none') {
      container.classList.remove('has-screen');
      return;
    }

    const screen = ensure(next);
    screen.refresh();
    screen.layer.classList.add('is-open');
    container.classList.add('has-screen');
    screen.onShow?.();
    screen.focusPrimary();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (destroyed || current === 'none') return;
    const screen = screens.get(current as PanelId);
    if (!screen) return;

    if (screen.onKeyDown?.(event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key === 'Escape') {
      // The menu is the root of the stack: there is nowhere further back.
      if (current === 'menu') return;
      event.preventDefault();
      event.stopPropagation();
      api.playSound('ui.back');
      api.back();
      return;
    }

    if (event.key === 'Tab') {
      if (trapTab(screen.dialog, event)) event.stopPropagation();
      return;
    }

    const direction = ARROWS[event.key];
    if (!direction) return;
    if ((direction === 'left' || direction === 'right') && ownsHorizontalArrows(document.activeElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (moveFocus(screen.dialog, direction)) api.playSound('ui.select');
  }

  // Capture phase: while a panel is open its keys take precedence over the
  // gameplay bindings listening on the same window.
  window.addEventListener('keydown', onKeyDown, true);

  const unsubscribe = api.save.subscribe(() => {
    if (current !== 'none') applyPreferences();
  });

  return {
    show,
    current: () => current,
    refresh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener('keydown', onKeyDown, true);
      unsubscribe();
      for (const screen of screens.values()) {
        screen.onHide?.();
        screen.destroy?.();
      }
      screens.clear();
      container.remove();
    },
  };
}
