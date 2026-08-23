import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 *
 * All three apps (Next.js, Nuxt.js, TanStack Start) share port 7001.
 * Start the dev server manually before running tests:
 *   - Next:     pnpm dev:next
 *   - Nuxt:     pnpm dev:nuxt
 *   - TanStack: pnpm dev:tanstack
 *
 * Then run: pnpm test:e2e
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: '../../test-results/e2e-report' }],
  ],
  outputDir: '../../test-results/e2e-output',

  // Clean up e2e-* test users from the database after all tests finish
  globalTeardown: './global-teardown.ts',

  use: {
    baseURL: 'http://localhost:7001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // No webServer config -- start the dev server manually
});
