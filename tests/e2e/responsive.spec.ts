/**
 * Layout across viewports, and touch input.
 *
 * The canvas is a fixed 320x180 logical frame scaled by Phaser's FIT mode while
 * the menus are fluid HTML above it. The two can disagree, and the way that
 * shows up is a panel pushed off-screen or a document that scrolls sideways —
 * neither of which any unit test can see.
 */

import type { Page } from '@playwright/test';

import {
  bootGame,
  expect,
  expectPhase,
  launchViaHook,
  openDialog,
  playButton,
  simState,
  startRun,
  test,
} from './fixtures';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutReport {
  viewport: { width: number; height: number };
  canvas: Rect | null;
  panel: Rect | null;
  scrollWidth: number;
  clientWidth: number;
}

async function measure(page: Page): Promise<LayoutReport> {
  return page.evaluate(() => {
    const box = (node: Element | null): Rect | null => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const root = document.documentElement;
    return {
      viewport: { width: root.clientWidth, height: root.clientHeight },
      canvas: box(document.querySelector('canvas')),
      panel: box(document.querySelector('[role="dialog"]')),
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
    };
  });
}

const VIEWPORTS = [
  { name: '320x568 portrait', width: 320, height: 568 },
  { name: '414x896', width: 414, height: 896 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '2560x1440', width: 2560, height: 1440 },
];

test.describe('responsive layout', () => {
  for (const viewport of VIEWPORTS) {
    test(`fits the viewport at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await bootGame(page);

      const report = await measure(page);
      expect(report.canvas, 'the canvas should be laid out').not.toBeNull();
      expect(report.panel, 'the menu panel should be laid out').not.toBeNull();

      const canvas = report.canvas as Rect;
      expect(canvas.width).toBeGreaterThan(0);
      expect(canvas.height).toBeGreaterThan(0);
      // Sub-pixel scaling makes exact equality the wrong test; a pixel of slack
      // is invisible, anything more is a letterbox error.
      expect(canvas.x).toBeGreaterThanOrEqual(-1);
      expect(canvas.y).toBeGreaterThanOrEqual(-1);
      expect(canvas.x + canvas.width).toBeLessThanOrEqual(report.viewport.width + 1);
      expect(canvas.y + canvas.height).toBeLessThanOrEqual(report.viewport.height + 1);

      const panel = report.panel as Rect;
      expect(panel.width).toBeGreaterThan(0);
      expect(panel.x).toBeGreaterThanOrEqual(-1);
      expect(panel.y).toBeGreaterThanOrEqual(-1);
      expect(panel.x + panel.width).toBeLessThanOrEqual(report.viewport.width + 1);
      expect(panel.y + panel.height).toBeLessThanOrEqual(report.viewport.height + 1);

      expect(report.scrollWidth, 'the document must not scroll sideways').toBeLessThanOrEqual(
        report.clientWidth,
      );

      await expect(playButton(page)).toBeVisible();
    });
  }

  test('survives a resize mid-run', async ({ page, isMobile }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await bootGame(page);

    await startRun(page);
    await launchViaHook(page);

    const before = (await simState(page)).x;

    await page.setViewportSize({ width: 500, height: 900 });
    await expect(openDialog(page)).toHaveCount(0);
    await expectPhase(page, 'fly');

    // Still flying, not merely still in the fly phase.
    await expect
      .poll(async () => (await simState(page)).x, { message: 'the run should keep advancing' })
      .toBeGreaterThan(before);

    const report = await measure(page);
    expect(report.scrollWidth).toBeLessThanOrEqual(report.clientWidth);

    // The canvas must also re-fit. That check is desktop-only: under a mobile
    // context the scale manager can latch the fit it computed from an
    // intermediate parent size and never re-check, leaving the canvas at the
    // previous orientation's size. See docs/E2E_NOTES.md, "Known issues".
    if (isMobile) return;

    // Phaser re-fits on a throttled interval rather than inside the resize
    // event, so the frame right after a resize is legitimately mid-transition.
    await expect
      .poll(
        async () => {
          const settled = await measure(page);
          const canvas = settled.canvas as Rect;
          return canvas.width > 0 && canvas.x + canvas.width <= settled.viewport.width + 1;
        },
        { message: 'the canvas should settle inside the new viewport' },
      )
      .toBe(true);
  });

  test('charges and launches from a touch hold', async ({ page, browserName, isMobile }) => {
    // Playwright's touchscreen API only taps; a press-and-hold needs raw touch
    // dispatch, which is a Chromium DevTools Protocol capability. The mobile
    // project is the Chromium-based Pixel 5 device, so this runs there only.
    test.skip(!isMobile || browserName !== 'chromium', 'needs a Chromium touch context');

    await bootGame(page);
    await playButton(page).tap();
    await expect(openDialog(page)).toHaveCount(0);
    await expectPhase(page, 'aim');

    const box = await page.locator('canvas').boundingBox();
    expect(box).not.toBeNull();
    const point = {
      x: Math.round((box?.x ?? 0) + (box?.width ?? 0) / 2),
      y: Math.round((box?.y ?? 0) + (box?.height ?? 0) / 2),
    };

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: point.x, y: point.y }],
    });

    await expect
      .poll(async () => (await simState(page)).charging, { message: 'a hold should charge' })
      .toBe(true);
    await expect.poll(async () => (await simState(page)).meter).toBeGreaterThan(0.2);

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expectPhase(page, 'fly');
  });
});
