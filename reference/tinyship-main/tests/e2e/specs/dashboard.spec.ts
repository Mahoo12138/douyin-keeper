import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PAGES, TIMEOUTS, uniqueEmail } from '../helpers/constants';
import { signUpViaAPI } from '../helpers/auth';

/**
 * Dashboard Tests
 *
 * Tests the dashboard page post-login: page load, tab navigation,
 * and profile information display.
 *
 * Uses a single shared account and browser context across all tests
 * to avoid rate limiting on the auth API.
 */

test.describe('Dashboard', () => {
  // Run tests in serial order so they can share browser context
  test.describe.configure({ mode: 'serial' });

  const testName = 'Dashboard E2E User';
  const password = 'TestPassword123!';
  const testEmail = uniqueEmail('dashboard');

  let sharedContext: BrowserContext;
  let sharedPage: Page;

  test.beforeAll(async ({ browser }) => {
    // Create a shared context and page for all dashboard tests
    sharedContext = await browser.newContext();
    sharedPage = await sharedContext.newPage();

    // Create the test account (sign-up also establishes a session automatically)
    const signUpRes = await signUpViaAPI(sharedPage, {
      name: testName,
      email: testEmail,
      password,
    });
    expect(signUpRes.ok(), `Dashboard account sign-up failed: ${signUpRes.status()}`).toBeTruthy();
  });

  test.afterAll(async () => {
    await sharedContext?.close();
  });

  test('loads dashboard page with user info', async () => {
    await sharedPage.goto(PAGES.dashboard, { timeout: TIMEOUTS.navigation });

    // Should stay on the dashboard page (not redirected)
    await expect(sharedPage).toHaveURL(/\/dashboard/);

    // Page heading should be visible
    const heading = sharedPage.locator('h1');
    await expect(heading).toBeVisible();

    // User name should appear somewhere on the page
    await expect(sharedPage.locator(`text=${testName}`).first()).toBeVisible({
      timeout: TIMEOUTS.navigation,
    });
  });

  test('profile tab shows user email and name', async () => {
    await sharedPage.goto(PAGES.dashboard, { timeout: TIMEOUTS.navigation });

    // Wait for dashboard to finish loading (spinner should disappear)
    await sharedPage.waitForSelector('h1', { timeout: TIMEOUTS.navigation });

    // Profile tab is active by default; user info should be visible
    await expect(sharedPage.locator(`text=${testName}`).first()).toBeVisible();
    await expect(sharedPage.locator(`text=${testEmail}`).first()).toBeVisible();
  });

  test('can navigate between dashboard tabs', async () => {
    await sharedPage.goto(PAGES.dashboard, { timeout: TIMEOUTS.navigation });

    // Wait for dashboard to finish loading
    await sharedPage.waitForSelector('h1', { timeout: TIMEOUTS.navigation });

    // The tab navigation should be present
    const tabButtons = sharedPage.locator('button, [role="tab"]');

    // There should be multiple tab buttons
    const count = await tabButtons.count();
    expect(count).toBeGreaterThan(1);

    // Click the second visible tab-like button (subscription or credits)
    const navItems = sharedPage.locator('[class*="cursor-pointer"], [role="tab"]');
    const navCount = await navItems.count();

    if (navCount > 1) {
      // Click second tab
      await navItems.nth(1).click();

      // Content should change (we just verify no error occurred)
      await sharedPage.waitForTimeout(500);
      await expect(sharedPage).toHaveURL(/\/dashboard/);
    }
  });

  test('orders API returns 200 when accessed from dashboard', async () => {
    const ordersRes = await sharedPage.request.get('/api/orders?page=1&limit=10', {
      timeout: TIMEOUTS.navigation,
    });
    expect(ordersRes.status(), `Orders API returned ${ordersRes.status()}`).toBe(200);
  });

  test('credits transactions API returns 200 when accessed from dashboard', async () => {
    const creditsRes = await sharedPage.request.get('/api/credits/transactions?page=1&limit=10', {
      timeout: TIMEOUTS.navigation,
    });
    expect(creditsRes.status(), `Credits API returned ${creditsRes.status()}`).toBe(200);
  });
});
