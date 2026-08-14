/**
 * Screen navigation, pause, and the hidden fifth character.
 *
 * The interface layer is a stack of DOM panels over a canvas that also listens
 * for keys. These tests exist because that arrangement has exactly two failure
 * modes worth catching from outside: a screen that cannot be left, and a pause
 * that does not actually stop the world.
 */

import {
  bootGame,
  dialogTitle,
  expect,
  expectPhase,
  launchViaHook,
  openDialog,
  openScreen,
  simState,
  startRun,
  test,
} from './fixtures';

/** Menu button label paired with the title of the panel it opens. */
const SCREENS: Array<{ label: string; title: string }> = [
  { label: 'CHARACTERS', title: 'CHARACTERS' },
  { label: 'HOW TO PLAY', title: 'HOW TO PLAY' },
  { label: 'RECORDS', title: 'RECORDS' },
  { label: 'SETTINGS', title: 'SETTINGS' },
  { label: 'CREDITS', title: 'CREDITS' },
];

test.describe('navigation', () => {
  test('opens every screen and returns to the menu', async ({ page }) => {
    await bootGame(page);

    for (const screen of SCREENS) {
      await openScreen(page, screen.label, screen.title);
      await expect(openDialog(page)).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(dialogTitle(page)).toHaveText('CLOUDSHIP LONGSHOT');
    }
  });

  test('pause stops the simulation and resume restarts it', async ({ page }) => {
    await bootGame(page);
    await startRun(page);
    await launchViaHook(page);

    await page.keyboard.press('Escape');
    await expect(dialogTitle(page)).toHaveText('PAUSED');

    // A genuine elapsed-time sample: the only way to prove nothing advanced is
    // to let wall-clock time pass and find the world where it was left.
    const before = (await simState(page)).x;
    await page.waitForTimeout(1000);
    const after = (await simState(page)).x;
    expect(after, 'a paused run must not advance').toBe(before);

    await page.getByRole('button', { name: 'RESUME' }).click();
    await expect(openDialog(page)).toHaveCount(0);

    await expect
      .poll(async () => (await simState(page)).x, { message: 'a resumed run must advance' })
      .toBeGreaterThan(after);
  });

  test('keeps the fifth character hidden until it is unlocked', async ({ page }) => {
    await bootGame(page);
    await openScreen(page, 'CHARACTERS', 'CHARACTERS');

    const locked = page.getByRole('button', { name: /^\?\?\?/ });
    await expect(locked).toBeVisible();
    await expect(locked).toHaveAttribute('aria-disabled', 'true');
    await expect(locked).toContainText('SEALED');

    // The name must not be recoverable from the page at all — not from rendered
    // text, and not from an attribute, a title or an aria-label in the markup.
    const leak = await page.evaluate(() => ({
      text: document.body.innerText,
      markup: document.documentElement.outerHTML,
    }));
    expect(leak.text.toLowerCase()).not.toContain('eithan');
    expect(leak.markup.toLowerCase()).not.toContain('eithan');

    // Activating the locked card must refuse rather than select. The card is a
    // real button carrying aria-disabled, which Playwright treats as disabled,
    // so the press is dispatched straight at the card — a forced click would be
    // aimed at a point that can sit under the panel header on a small viewport.
    await locked.dispatchEvent('click');
    await expect
      .poll(async () => page.evaluate(() => document.body.innerText.toLowerCase()))
      .not.toContain('eithan');

    await page.evaluate(() => {
      const hook = (globalThis as unknown as { __cloudship: { app: { grantDevUnlock(): void } } })
        .__cloudship;
      hook.app.grantDevUnlock();
    });

    // The card keeps its place in the list; only its identity changes, so the
    // locked locator must stop matching and the revealed one must take over.
    const revealed = page.getByRole('button', { name: /^EITHAN/ });
    await expect(revealed).toBeVisible();
    await expect(locked).toHaveCount(0);
    await expect(revealed).not.toHaveAttribute('aria-disabled', 'true');

    await revealed.click();
    await expect(revealed).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /^LAUNCH\b/ })).toContainText('EITHAN');
  });

  test('quits a paused run back to the menu', async ({ page }) => {
    await bootGame(page);
    await startRun(page);
    await launchViaHook(page);

    await page.keyboard.press('Escape');
    await expect(dialogTitle(page)).toHaveText('PAUSED');

    await page.getByRole('button', { name: 'QUIT TO MENU' }).click();
    await expect(dialogTitle(page)).toHaveText('CLOUDSHIP LONGSHOT');
    // Quitting must return the world to its idle menu state, not leave a frozen
    // flight behind the panel.
    await expectPhase(page, 'aim');
  });
});
