import { test, expect } from '@playwright/test';
import { PAGES, TIMEOUTS, uniqueEmail } from '../helpers/constants';
import { signUpViaAPI, signInViaAPI } from '../helpers/auth';

/**
 * Access Control Tests
 *
 * Verifies that protected pages redirect unauthenticated users
 * and that admin pages are restricted to admin-role users.
 *
 * Uses a shared test account (created in beforeAll) to avoid rate limits.
 */

test.describe('Access Control', () => {
  test.describe('Unauthenticated Access', () => {
    test('visiting /dashboard redirects to /signin', async ({ page }) => {
      await page.goto(PAGES.dashboard, { timeout: TIMEOUTS.navigation });
      await expect(page).toHaveURL(/\/signin/);
    });

    test('visiting /upload redirects to /signin', async ({ page }) => {
      await page.goto(PAGES.upload, { timeout: TIMEOUTS.navigation });
      await expect(page).toHaveURL(/\/signin/);
    });

    test('visiting /admin redirects to /signin', async ({ page }) => {
      await page.goto(PAGES.admin, { timeout: TIMEOUTS.navigation });
      await expect(page).toHaveURL(/\/signin/);
    });

    test('visiting /premium-features redirects to /signin', async ({ page }) => {
      await page.goto(PAGES.premiumFeatures, { timeout: TIMEOUTS.navigation });
      await expect(page).toHaveURL(/\/signin/);
    });
  });

  test.describe('Authenticated Non-Admin Access', () => {
    const sharedEmail = uniqueEmail('access-ctrl');
    const password = 'TestPassword123!';

    test.beforeAll(async ({ browser }) => {
      // Create the shared test account once
      const context = await browser.newContext();
      const page = await context.newPage();

      await signUpViaAPI(page, {
        name: 'Access Control User',
        email: sharedEmail,
        password,
      });

      await context.close();
    });

    test('normal user visiting /admin gets 403 Forbidden', async ({ page }) => {
      // Sign in as the normal (non-admin) user
      const signInRes = await signInViaAPI(page, {
        email: sharedEmail,
        password,
      });
      expect(signInRes.ok(), `Sign-in failed: ${signInRes.status()}`).toBeTruthy();

      // Try visiting admin page
      const response = await page.goto(PAGES.admin, {
        timeout: TIMEOUTS.navigation,
        waitUntil: 'commit',
      });

      // Server returns 403, or app redirects non-admin away from /admin
      const status = response?.status();
      const url = page.url();

      expect(
        status === 403 || url.includes('/signin') || !url.includes('/admin')
      ).toBeTruthy();
    });

    test('normal user can access /dashboard', async ({ page }) => {
      // Sign in as the normal user
      const signInRes = await signInViaAPI(page, {
        email: sharedEmail,
        password,
      });
      expect(signInRes.ok(), `Sign-in failed: ${signInRes.status()}`).toBeTruthy();

      await page.goto(PAGES.dashboard, { timeout: TIMEOUTS.navigation });

      // Should stay on dashboard, not redirect away
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test('normal user visiting /premium-features is redirected to /pricing', async ({ page }) => {
      const signInRes = await signInViaAPI(page, {
        email: sharedEmail,
        password,
      });
      expect(signInRes.ok(), `Sign-in failed: ${signInRes.status()}`).toBeTruthy();

      await page.goto(PAGES.premiumFeatures, { timeout: TIMEOUTS.navigation });
      await expect(page).toHaveURL(/\/pricing/);
    });
  });
});
