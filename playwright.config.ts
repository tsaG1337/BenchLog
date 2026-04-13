import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E config for the RV-10 timetracker (tenant app).
 *
 * Required env vars:
 *   E2E_BASE_URL   — tenant origin, e.g. https://e2etest-apr12.benchlog.build
 *   E2E_USERNAME   — seeded tenant user
 *   E2E_PASSWORD   — matching password
 *
 * globalSetup logs in once and saves storageState to ./e2e/.auth/state.json.
 * Every test reuses that state, so the server's login rate-limit (10/15min)
 * never fires during the suite.
 *
 * Run: `npx playwright test` (from this package)
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  globalSetup: path.resolve(__dirname, './e2e/global-setup.ts'),
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    storageState: './e2e/.auth/state.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1400, height: 1200 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'],  viewport: { width: 1400, height: 1200 } } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'], viewport: { width: 1400, height: 1200 } } },
  ],
});
