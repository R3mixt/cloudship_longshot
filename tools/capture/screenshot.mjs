/**
 * Captures the README screenshot from a production build.
 *
 * The frame is taken through the renderer's own snapshot rather than a page
 * screenshot, so the image is the raw 320x180 framebuffer with no browser
 * scaling in it. It is then enlarged by a whole-number factor with
 * nearest-neighbour sampling, which is the only way to keep pixel art crisp.
 *
 *   node tools/capture/screenshot.mjs [--out docs/screenshot.png] [--scale 4]
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const out = resolve(flag('out', 'docs/screenshot.png'));
const scale = Number(flag('scale', 4));
const port = Number(flag('port', 4178));
const seed = Number(flag('seed', 20250814));

/** Enlarges a PNG by an integer factor without smoothing, inside the page. */
const UPSCALE = `(dataUrl, factor) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width * factor;
    c.height = img.height * factor;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    resolve(c.toDataURL('image/png'));
  };
  img.src = dataUrl;
})`;

const preview = spawn(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'preview', '--', '--port', String(port), '--strictPort'],
  { stdio: 'ignore', shell: process.platform === 'win32' },
);

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Server not up yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Preview server did not start on ${url}`);
}

try {
  const url = `http://localhost:${port}/`;
  await waitForServer(url);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${url}?debug=1&seed=${seed}`);
  await page.waitForFunction(() => Boolean(window.__cloudship?.app));
  // Let the loader finish and the first frames present.
  await page.waitForTimeout(1200);

  const found = await page.evaluate(async () => {
    const app = window.__cloudship.app;
    app.show('none');
    app.setCharacter('lindon');
    app.startRun();
    await new Promise((r) => setTimeout(r, 150));
    const sim = app.game.scene.getScene('game').simulation;
    sim.state.angle = -0.62;
    sim.setCharging(true);
    await new Promise((res) => {
      const t = setInterval(() => {
        if (sim.state.meter >= 0.95) {
          clearInterval(t);
          sim.launch();
          res();
        }
      }, 4);
    });
    // Advance to a frame that shows the game at its most characteristic: low
    // enough to see the ground, fast, with beasts ahead.
    for (let i = 0; i < 4000 && sim.state.phase === 'fly'; i++) {
      sim.step(1 / 60);
      const altitude = (400 - sim.state.y) / 9;
      const ahead = sim.state.objects.filter(
        (o) =>
          o.alive &&
          (o.kind === 'bird' || o.kind === 'rare') &&
          o.x > sim.state.x &&
          o.x - sim.state.x < 170,
      ).length;
      if (altitude > 16 && altitude < 50 && ahead >= 2) {
        return { altitude: Math.round(altitude), distance: Math.round(sim.state.stats.distance) };
      }
    }
    return null;
  });

  // Give the renderer real frames so the trail and particles are populated.
  await page.waitForTimeout(400);

  const raw = await page.evaluate(
    () => new Promise((res) => window.__cloudship.app.game.renderer.snapshot((img) => res(img.src))),
  );
  const enlarged = await page.evaluate(
    ([dataUrl, factor, fn]) => eval(fn)(dataUrl, factor),
    [raw, scale, UPSCALE],
  );

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, Buffer.from(enlarged.split(',')[1], 'base64'));
  await browser.close();

  console.log(`wrote ${out} at ${scale}x`, found ?? '(no ideal frame found; captured anyway)');
} finally {
  preview.kill();
}
