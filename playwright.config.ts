import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const baseURL = `http://localhost:${PORT}`;

/**
 * End-to-end configuration. E2E always runs against a production build served by
 * `vite preview` rather than the dev server, so the suite exercises the same
 * bundling, asset paths and minification that ship to GitHub Pages.
 */
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',

  // A launch plus a full flight can legitimately take a couple of minutes.
  timeout: 90_000,
  expect: { timeout: 10_000 },

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      // Touch-input and small-viewport coverage; the game must be excellent on mobile.
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // The build runs before the server comes up, so allow room for a cold compile.
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
