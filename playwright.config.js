// Playwright config — iPhone-sized viewport, app served by scripts/serve.mjs (ES modules need http://).
// In the Claude Code cloud sandbox Chromium is pre-installed at /opt/pw-browsers/chromium; elsewhere
// (CI, Harvey's Mac) run `npx playwright install chromium` once and the default browser is used.
import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {};
const PORT = Number(process.env.E2E_PORT || 8181);

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  outputDir: 'test-results',
  use: { baseURL: `http://localhost:${PORT}/`, trace: 'off', screenshot: 'only-on-failure' },
  webServer: {
    command: `node scripts/serve.mjs`,
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
  projects: [
    {
      name: 'iphone',
      // iPhone 15 (393×852, DPR 3, touch, mobile UA) but on Chromium.
      use: { ...devices['iPhone 15'], defaultBrowserType: 'chromium', browserName: 'chromium', launchOptions },
    },
  ],
});
