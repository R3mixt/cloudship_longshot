/**
 * Persistence across a real page reload.
 *
 * The unit suite owns the save format, migration and the unlock arithmetic. What
 * it cannot prove is that the browser actually writes the file, that a reloaded
 * process reads it back, and that a hostile value in `localStorage` still lets
 * the game boot. That is what these check.
 */

import {
  bootGame,
  expect,
  finishRun,
  groupDigits,
  launchViaHook,
  openScreen,
  playButton,
  readSave,
  SAVE_KEY,
  SAVE_VERSION,
  startRun,
  test,
  waitForBoot,
} from './fixtures';

test.describe('persistence', () => {
  test('keeps a record across a reload', async ({ page }) => {
    await bootGame(page);
    await startRun(page);
    await launchViaHook(page);
    const distance = await finishRun(page);
    expect(distance).toBeGreaterThan(0);

    const beforeReload = await readSave(page);
    expect(beforeReload, `${SAVE_KEY} should exist after a run`).not.toBeNull();
    expect(beforeReload?.version).toBe(SAVE_VERSION);
    expect(beforeReload?.records.lindon?.distance).toBe(Math.round(distance));
    expect(beforeReload?.totalRuns).toBe(1);

    await page.reload();
    await waitForBoot(page);

    await openScreen(page, 'RECORDS', 'RECORDS');
    await expect(page.getByRole('dialog')).toContainText('LINDON');
    await expect(page.getByRole('dialog')).toContainText(`${groupDigits(distance)} m`);

    const afterReload = await readSave(page);
    expect(afterReload?.records.lindon?.distance).toBe(Math.round(distance));
  });

  test('keeps settings across a reload', async ({ page }) => {
    await bootGame(page);
    await openScreen(page, 'SETTINGS', 'SETTINGS');

    const master = page.getByLabel('Master volume');
    const shake = page.getByRole('button', { name: /^Screen shake/ });
    await expect(shake).toHaveAttribute('aria-pressed', 'true');

    await master.fill('35');
    await shake.click();
    await expect(shake).toHaveAttribute('aria-pressed', 'false');

    // The save manager coalesces writes into a microtask, so wait on the file.
    await expect
      .poll(async () => (await readSave(page))?.settings.masterVolume)
      .toBeCloseTo(0.35, 5);

    await page.reload();
    await waitForBoot(page);
    await openScreen(page, 'SETTINGS', 'SETTINGS');

    await expect(page.getByLabel('Master volume')).toHaveValue('35');
    await expect(page.getByRole('button', { name: /^Screen shake/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    const save = await readSave(page);
    expect(save?.settings.masterVolume).toBeCloseTo(0.35, 5);
    expect(save?.settings.screenShake).toBe(false);
    // Untouched settings must survive the round trip unchanged.
    expect(save?.settings.showSpeedLines).toBe(true);
  });

  test('remembers the selected character across a reload', async ({ page }) => {
    await bootGame(page);
    await expect(playButton(page)).toContainText('LINDON');

    await openScreen(page, 'CHARACTERS', 'CHARACTERS');
    await page.getByRole('button', { name: /^MERCY/ }).click();
    await page.keyboard.press('Escape');
    await expect(playButton(page)).toContainText('MERCY');

    await page.reload();
    await waitForBoot(page);

    await expect(playButton(page)).toContainText('MERCY');
    expect((await readSave(page))?.lastCharacter).toBe('mercy');
  });

  /**
   * A save a player cannot recover from is worse than no save at all, so every
   * one of these must still reach a usable menu with a silent console.
   */
  const CORRUPT_SAVES: Array<{ name: string; value: string }> = [
    { name: 'truncated JSON', value: '{' },
    { name: 'the literal null', value: 'null' },
    { name: 'an array', value: '[]' },
    { name: 'valid JSON of the wrong shape', value: '{"version":"banana","records":42}' },
  ];

  for (const corrupt of CORRUPT_SAVES) {
    test(`boots with a corrupt save: ${corrupt.name}`, async ({ page }) => {
      await bootGame(page, { seedSave: corrupt.value });

      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(playButton(page)).toBeEnabled();

      // Usable, not merely visible: the menu still starts a run.
      await startRun(page);
    });
  }
});
