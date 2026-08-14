/**
 * Boot and the core loop.
 *
 * These three cover the integration the unit suite cannot: that the shipped
 * bundle boots, that the canvas and the DOM overlay cooperate, and that real
 * input carries a player from the menu all the way back to the menu.
 */

import {
  bootGame,
  dialogTitle,
  expect,
  expectPhase,
  finishRun,
  groupDigits,
  launchWithMouse,
  openDialog,
  playButton,
  simState,
  startRun,
  test,
} from './fixtures';

test.describe('smoke', () => {
  test('boots to a playable menu with a clean console', async ({ page, consoleErrors }) => {
    await bootGame(page);

    // The splash is removed rather than merely faded, so the canvas below it is
    // reachable by pointer input.
    await expect(page.locator('#boot-splash')).toHaveCount(0);

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box, 'the canvas should have a layout box').not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);

    await expect(openDialog(page)).toBeVisible();
    await expect(dialogTitle(page)).toHaveText('CLOUDSHIP LONGSHOT');
    await expect(playButton(page)).toBeEnabled();

    expect(consoleErrors, 'boot must be silent').toEqual([]);
  });

  test('plays a full loop: menu, launch, flight, results, retry', async ({ page }) => {
    await bootGame(page);

    await startRun(page);
    await launchWithMouse(page);

    const distance = await finishRun(page);
    expect(distance, 'a launched run should cover ground').toBeGreaterThan(0);

    await expect(dialogTitle(page)).toHaveText(/TECHNIQUE (DISSIPATED|DESTROYED)/);
    // The headline figure the player reads must be the distance actually flown.
    await expect(openDialog(page)).toContainText(groupDigits(distance));

    await page.getByRole('button', { name: 'LAUNCH AGAIN' }).click();
    await expect(openDialog(page)).toHaveCount(0);
    await expectPhase(page, 'aim');

    // "Live" means the new run accepts input, not merely that it exists.
    await launchWithMouse(page);
    expect((await simState(page)).stats.distance).toBeGreaterThanOrEqual(0);
  });

  test('is playable with the keyboard alone', async ({ page }) => {
    await bootGame(page);

    // Tab to PLAY rather than relying on the panel's initial focus, so the test
    // fails if the focus order ever strands a keyboard player.
    const focusedLabel = (): Promise<string> =>
      page.evaluate(() => document.activeElement?.textContent ?? '');
    for (let step = 0; step < 12 && !/^PLAY/.test(await focusedLabel()); step += 1) {
      await page.keyboard.press('Tab');
    }
    expect(await focusedLabel(), 'PLAY should be reachable by Tab').toMatch(/^PLAY/);

    await page.keyboard.press('Enter');
    await expect(openDialog(page)).toHaveCount(0);
    await expectPhase(page, 'aim');

    // Deliberately no settling delay: pressing Space immediately after the Enter
    // that activated PLAY is the case that used to launch at zero power, so the
    // test is only meaningful without one.
    await page.keyboard.down('Space');
    await expect
      .poll(async () => (await simState(page)).meter, { message: 'Space should charge' })
      .toBeGreaterThan(0.2);
    await page.keyboard.up('Space');

    await expectPhase(page, 'fly');
  });
});
