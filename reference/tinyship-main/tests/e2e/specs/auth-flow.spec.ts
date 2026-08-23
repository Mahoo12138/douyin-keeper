import { test, expect } from '@playwright/test';
import { PAGES, TIMEOUTS, uniqueEmail } from '../helpers/constants';
import { signUpViaAPI, signInViaAPI, signOutViaAPI } from '../helpers/auth';

/**
 * Authentication Flow Tests
 *
 * Tests the complete sign-up → sign-out → sign-in lifecycle
 * using both UI interactions and API shortcuts.
 *
 * To avoid rate limiting, we minimize account creation:
 * - Sign Up tests create their own accounts (that's the point)
 * - Sign In / Sign Out / Redirect tests share a single account
 */

test.describe('Authentication Flow', () => {
  const password = 'TestPassword123!';

  test.describe('Sign Up', () => {
    test('can sign up via UI form and is redirected', async ({ page }) => {
      // This test runs after many API sign-ups, so rate limiting may trigger.
      // Use slow() to triple the default 30s timeout to 90s.
      test.slow();

      const email = uniqueEmail('signup-ui');

      await page.goto(PAGES.signup, { timeout: TIMEOUTS.navigation });

      // Wait for client-side hydration so Vue/React event handlers are attached.
      // Without this, form may submit as raw HTML (no JS) on Nuxt.
      await page.waitForTimeout(2000);

      // Fill in the registration form
      await page.locator('input#name').fill('E2E Signup User');
      await page.locator('input#email').fill(email);
      await page.locator('input#password').fill(password);

      // Submit the form
      await page.locator('button[type="submit"]').click();

      // If rate-limited, the form may show an error and stay on signup.
      // Wait a moment, check for error, and retry if needed.
      const errorAlert = page.locator('[role="alert"]').filter({ hasText: /error/i });
      const redirected = await page
        .waitForURL((url) => !url.pathname.includes('/signup'), { timeout: 15_000 })
        .then(() => true)
        .catch(() => false);

      if (!redirected) {
        const hasError = await errorAlert.isVisible().catch(() => false);
        if (hasError) {
          // Rate-limited — wait and retry the form submission
          await page.waitForTimeout(5000);
          await page.locator('button[type="submit"]').click();
        } else {
          // Possibly form submitted as raw HTML before hydration — try again
          await page.goto(PAGES.signup, { timeout: TIMEOUTS.navigation });
          await page.waitForTimeout(3000);
          await page.locator('input#name').fill('E2E Signup User');
          await page.locator('input#email').fill(email);
          await page.locator('input#password').fill(password);
          await page.locator('button[type="submit"]').click();
        }
      }

      await page.waitForURL(
        (url) => !url.pathname.includes('/signup'),
        { timeout: 60_000 }
      );
    });

    test('can sign up via API', async ({ page }) => {
      const email = uniqueEmail('signup-api');

      const response = await signUpViaAPI(page, {
        name: 'API Signup User',
        email,
        password,
      });

      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe(email);
    });
  });

  test.describe('Sign In, Sign Out, and Redirects', () => {
    // Share one account for all tests in this group
    const sharedEmail = uniqueEmail('auth-shared');

    test.beforeAll(async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      const res = await signUpViaAPI(page, {
        name: 'Auth Shared User',
        email: sharedEmail,
        password,
      });
      expect(res.ok(), `Shared account sign-up failed: ${res.status()}`).toBeTruthy();

      await context.close();
    });

    test('can sign in via UI form and is redirected', async ({ page }) => {
      test.slow(); // Allow extra time for dev server compilation + hydration
      await page.goto(PAGES.signin, { timeout: TIMEOUTS.navigation });

      // Wait for client-side hydration so form handlers are attached
      await page.waitForTimeout(2000);

      // Fill in the login form
      await page.locator('input#email').fill(sharedEmail);
      await page.locator('input#password').fill(password);

      // Submit the form
      await page.locator('button[type="submit"]').click();

      // After successful sign-in, user is redirected away from /signin.
      // The callback URL may be `/en`, `/zh-CN`, or `/en/dashboard` etc.
      const redirected = await page
        .waitForURL((url) => !url.pathname.includes('/signin'), { timeout: 15_000 })
        .then(() => true)
        .catch(() => false);

      if (!redirected) {
        // Possibly hydration wasn't complete — retry with fresh load
        await page.goto(PAGES.signin, { timeout: TIMEOUTS.navigation });
        await page.waitForTimeout(3000);
        await page.locator('input#email').fill(sharedEmail);
        await page.locator('input#password').fill(password);
        await page.locator('button[type="submit"]').click();
      }

      await page.waitForURL(
        (url) => !url.pathname.includes('/signin'),
        { timeout: 60_000 }
      );
    });

    test('can sign in via API', async ({ page }) => {
      const response = await signInViaAPI(page, {
        email: sharedEmail,
        password,
      });

      expect(response.ok()).toBeTruthy();
    });

    test('can sign out and then cannot access dashboard', async ({ page }) => {
      // Sign in first
      const signInRes = await signInViaAPI(page, {
        email: sharedEmail,
        password,
      });
      expect(signInRes.ok()).toBeTruthy();

      // Verify we CAN access dashboard first
      await page.goto(PAGES.dashboard, { timeout: TIMEOUTS.navigation });
      await expect(page).toHaveURL(/\/dashboard/);

      // Sign out (clears cookies)
      await signOutViaAPI(page);

      // After signing out, visiting dashboard should redirect to signin
      await page.goto(PAGES.dashboard, { timeout: TIMEOUTS.navigation });
      await expect(page).toHaveURL(/\/signin/);
    });

    test('logged-in user visiting /signin is redirected to /dashboard', async ({ page }) => {
      // Sign in
      const signInRes = await signInViaAPI(page, {
        email: sharedEmail,
        password,
      });
      expect(signInRes.ok()).toBeTruthy();

      // Try visiting the sign-in page
      await page.goto(PAGES.signin, { timeout: TIMEOUTS.navigation });

      // Should be redirected to dashboard
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test('logged-in user visiting /signup is redirected to /dashboard', async ({ page }) => {
      // Sign in
      const signInRes = await signInViaAPI(page, {
        email: sharedEmail,
        password,
      });
      expect(signInRes.ok()).toBeTruthy();

      // Try visiting the sign-up page
      await page.goto(PAGES.signup, { timeout: TIMEOUTS.navigation });

      // Should be redirected to dashboard
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });
});
