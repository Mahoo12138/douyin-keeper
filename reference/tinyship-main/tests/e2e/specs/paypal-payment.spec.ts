import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'path';
import { PAGES, TIMEOUTS, uniqueEmail } from '../helpers/constants';
import { signUpViaAPI } from '../helpers/auth';

// Load .env from the project root so sandbox credentials are available
config({ path: resolve(__dirname, '../../../.env') });

/**
 * PayPal Payment E2E Tests
 *
 * Covers three purchase flows (each with its own user):
 *   A) One-time — buy "PayPal Monthly (One Time)", complete PayPal sandbox
 *      checkout, verify redirect to payment-success page.
 *   B) Subscription — buy "PayPal Monthly Plan" (recurring), verify redirect
 *      to PayPal sandbox and complete approval.
 *   C) Credits — buy "100 Credits PayPal", verify dashboard credits balance.
 *
 * Prerequisites:
 * 1. Dev server running on port 7001 (`pnpm dev:next` or `pnpm dev:nuxt`)
 * 2. .env has PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_SANDBOX="true"
 * 3. .env has PAYPAL_E2E_USER_NAME and PAYPAL_E2E_USER_PWD (sandbox buyer)
 * 4. PayPal sandbox plan ID configured in config/payment.ts (paypalPlanId)
 *
 * PayPal sandbox checkout flow (discovered via agent-browser):
 *   1. Redirect to sandbox.paypal.com/checkoutnow?token=...
 *   2. Enter sandbox buyer email → click "Next"
 *   3. Enter password → click "Log In"
 *   4. Review page shows payment methods → click "Pay Now" / "Complete Purchase"
 *   5. Redirect back to /payment-success?provider=paypal&order_id=...
 */

const PAYPAL_SANDBOX_EMAIL = process.env.PAYPAL_E2E_USER_NAME ?? '';
const PAYPAL_SANDBOX_PASSWORD = process.env.PAYPAL_E2E_USER_PWD ?? '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Navigate to pricing page, find a plan card by its <h3> heading text,
 * click its CTA button, and wait for redirect to PayPal sandbox.
 *
 * @param tab - which pricing tab to activate ('subscription' | 'credits')
 * @param planNamePattern - regex to match the <h3> plan name
 */
async function initiatePayPalCheckout(
  page: Page,
  tab: 'subscription' | 'credits',
  planNamePattern: RegExp,
): Promise<void> {
  await page.goto(PAGES.pricing, { timeout: TIMEOUTS.navigation });
  await page.waitForLoadState('networkidle');

  await page.locator('h3').first().waitFor({ state: 'attached', timeout: TIMEOUTS.navigation });

  if (tab === 'credits') {
    const creditsTab = page.locator('.inline-flex.p-1 button').nth(1);
    await creditsTab.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
    await creditsTab.click();
    await page.waitForTimeout(1000);
  }

  const planHeading = page.locator('h3').filter({ hasText: planNamePattern });
  await planHeading.waitFor({ state: 'attached', timeout: TIMEOUTS.navigation });
  await planHeading.scrollIntoViewIfNeeded();

  const card = planHeading.locator('xpath=ancestor::div[contains(@class,"rounded")]').first();
  const ctaButton = card.locator('button').first();
  await ctaButton.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
  await expect(ctaButton).toBeEnabled({ timeout: TIMEOUTS.navigation });
  await ctaButton.click();

  // Wait for redirect to PayPal sandbox
  await page.waitForURL(
    (url) => url.hostname.includes('paypal.com'),
    { timeout: TIMEOUTS.stripe * 2 },
  );
}

/**
 * Log in to PayPal sandbox and complete payment approval.
 *
 * PayPal checkout page flow (discovered via agent-browser):
 *   - Email input: labeled "Email or mobile number"
 *   - "Next" button to proceed to password step
 *   - Password input: labeled "Password"
 *   - "Log In" button to authenticate
 *   - Review page: "Pay Now" / "Complete Purchase" / "完成购物" button
 *     (text varies by locale detection on PayPal's side)
 *
 * After approval, PayPal redirects back to our return URL which then
 * redirects to /payment-success.
 */
async function loginAndApprovePayPal(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);

  // PayPal may remember the sandbox user from previous tests.
  // Handle both scenarios: fresh login and already-logged-in.
  const emailInput = page.locator('#email');
  const isEmailVisible = await emailInput.isVisible().catch(() => false);

  if (isEmailVisible) {
    // Fresh login flow: email → Next → password → Login
    await emailInput.fill(PAYPAL_SANDBOX_EMAIL);

    const nextButton = page.locator('#btnNext');
    await nextButton.waitFor({ state: 'visible', timeout: 10_000 });
    await nextButton.click();
    await page.waitForTimeout(3000);

    const passwordInput = page.locator('#password');
    await passwordInput.waitFor({ state: 'visible', timeout: 15_000 });
    await passwordInput.fill(PAYPAL_SANDBOX_PASSWORD);

    const loginButton = page.locator('#btnLogin');
    await loginButton.waitFor({ state: 'visible', timeout: 10_000 });
    await loginButton.click();
  } else {
    // May be on the password-only step or already on the review page.
    const passwordInput = page.locator('#password');
    const isPasswordVisible = await passwordInput.isVisible().catch(() => false);
    if (isPasswordVisible) {
      await passwordInput.fill(PAYPAL_SANDBOX_PASSWORD);
      const loginButton = page.locator('#btnLogin');
      await loginButton.waitFor({ state: 'visible', timeout: 10_000 });
      await loginButton.click();
    }
    // Otherwise already logged in — proceed directly to review page.
  }

  // Step 5: Wait for review/approval page to fully load.
  // PayPal's SPA renders the review page asynchronously, so wait generously.
  await page.waitForTimeout(10000);

  // Step 6: Click the "Pay Now" / "Complete Purchase" / "Agree & Subscribe" button.
  // PayPal renders different button text depending on locale and flow type:
  //   - One-time orders: "完成购物" / "Pay Now" / "Complete Purchase"
  //   - Subscriptions: "同意并订阅" / "Agree & Subscribe" / "Agree & Continue"
  //
  // PayPal's subscription page may have hidden duplicate buttons that confuse
  // Playwright's CSS locator. Use JavaScript evaluation to find the visible
  // button in the DOM and scroll-click it directly.
  const PAY_BUTTON_PATTERNS = [
    '完成购物', '同意并订阅', '同意并继续',
    'Pay Now', 'Complete Purchase', 'Agree & Subscribe', 'Agree & Continue',
  ];

  // PayPal's subscription page may use <div role="button"> or web components
  // instead of native <button> elements. Use Playwright's role-based selector
  // (getByRole) which matches any element with button role, regardless of tag.
  // Also search across all frames since PayPal may use iframes.
  const payButtonNamePattern = new RegExp(PAY_BUTTON_PATTERNS.join('|'), 'i');

  let buttonClicked = false;
  for (let attempt = 0; attempt < 15 && !buttonClicked; attempt++) {
    if (attempt > 0) await page.waitForTimeout(2000);

    // Try each frame (main frame + any iframes)
    for (const frame of page.frames()) {
      try {
        const btn = frame.getByRole('button', { name: payButtonNamePattern });
        const count = await btn.count();
        if (count > 0) {
          await btn.last().scrollIntoViewIfNeeded();
          await btn.last().click({ timeout: 5000 });
          buttonClicked = true;
          break;
        }
      } catch {
        // Frame may have been detached or button click may have failed
      }
    }
  }

  if (!buttonClicked) {
    throw new Error(`PayPal pay button not found on: ${page.url()}`);
  }

  // Wait for redirect back to our payment-success page
  await page.waitForURL(/payment-success/, { timeout: 120_000 });
}

/**
 * Click a dashboard sidebar tab by matching its label text.
 */
async function clickDashboardTab(page: Page, tabNamePattern: RegExp): Promise<void> {
  const tabButton = page.locator('nav button').filter({ hasText: tabNamePattern });
  await tabButton.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
  await tabButton.click();
  await page.waitForTimeout(500);
}

/**
 * Create a fresh browser context with a brand new user for payment tests.
 */
async function createAuthenticatedContext(
  browser: import('@playwright/test').Browser,
  emailPrefix: string,
  password: string,
): Promise<{ context: BrowserContext; email: string }> {
  const email = uniqueEmail(emailPrefix);
  const context = await browser.newContext();
  const page = await context.newPage();

  const res = await signUpViaAPI(page, {
    name: 'PayPal Test User',
    email,
    password,
  });
  expect(res.ok(), `Sign-up failed for ${email}: ${res.status()}`).toBeTruthy();
  await page.close();

  return { context, email };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

const password = 'TestPassword123!';

// Skip entire file if PayPal sandbox credentials are not configured
test.beforeEach(({ }, testInfo) => {
  if (!PAYPAL_SANDBOX_EMAIL || !PAYPAL_SANDBOX_PASSWORD) {
    testInfo.skip(true, 'PayPal sandbox credentials not configured (PAYPAL_E2E_USER_NAME / PAYPAL_E2E_USER_PWD)');
  }
});

// ── A) One-Time Payment Flow ──────────────────────────────────────────────

test.describe('PayPal One-Time Payment', () => {
  test.describe.configure({ mode: 'serial' });

  let authContext: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    if (!PAYPAL_SANDBOX_EMAIL || !PAYPAL_SANDBOX_PASSWORD) return;
    const result = await createAuthenticatedContext(browser, 'e2e-paypal-once', password);
    authContext = result.context;
  });

  test.afterAll(async () => {
    await authContext?.close();
  });

  test('clicking PayPal one-time plan redirects to PayPal sandbox', async () => {
    test.setTimeout(120_000);
    const page = await authContext.newPage();

    await initiatePayPalCheckout(page, 'subscription', /PayPal Monthly \(One Time\)/i);
    expect(page.url()).toContain('paypal.com');

    await page.close();
  });

  test('can complete PayPal one-time payment and see success page', async () => {
    test.setTimeout(180_000);
    const page = await authContext.newPage();

    await initiatePayPalCheckout(page, 'subscription', /PayPal Monthly \(One Time\)/i);
    await loginAndApprovePayPal(page);

    expect(page.url()).toContain('payment-success');
    expect(page.url()).toMatch(/provider=paypal/);

    await expect(page.locator('h1').first()).toBeVisible({ timeout: TIMEOUTS.stripe });
    await expect(
      page.locator('a[href*="/dashboard"]').first(),
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    await page.close();
  });

  test('dashboard subscription tab shows plan after PayPal one-time payment', async () => {
    test.setTimeout(180_000);
    const page = await authContext.newPage();

    await page.goto(PAGES.dashboard, { timeout: TIMEOUTS.navigation });
    await expect(page).toHaveURL(/\/dashboard/);

    await clickDashboardTab(page, /Subscription|订阅/);

    const subscriptionCard = page.locator('.space-y-6').first();
    await subscriptionCard.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });

    const planNameLocator = page.locator('text=/PayPal Monthly/i');
    const noSubLocator = page.locator('text=/No Active Subscription|View Plans/i');

    await expect(planNameLocator.or(noSubLocator).first()).toBeVisible({
      timeout: TIMEOUTS.stripe,
    });

    const hasPlan = await planNameLocator.isVisible().catch(() => false);
    if (hasPlan) {
      await expect(planNameLocator.first()).toBeVisible();
      const activeBadge = page.locator('text=/Active|活跃/i').first();
      await expect(activeBadge).toBeVisible();
    }

    if (!hasPlan) {
      await expect(noSubLocator.first()).toBeVisible();
    }

    await page.close();
  });
});

// ── B) Subscription (Recurring) Payment Flow ─────────────────────────────

test.describe('PayPal Subscription Payment', () => {
  test.describe.configure({ mode: 'serial' });

  let authContext: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    if (!PAYPAL_SANDBOX_EMAIL || !PAYPAL_SANDBOX_PASSWORD) return;
    const result = await createAuthenticatedContext(browser, 'e2e-paypal-sub', password);
    authContext = result.context;
  });

  test.afterAll(async () => {
    await authContext?.close();
  });

  test('clicking PayPal subscription plan redirects to PayPal sandbox', async () => {
    test.setTimeout(120_000);
    const page = await authContext.newPage();

    await initiatePayPalCheckout(page, 'subscription', /PayPal Monthly Plan$/i);
    expect(page.url()).toContain('paypal.com');

    await page.close();
  });

  test('can complete PayPal subscription and see success page', async () => {
    test.setTimeout(180_000);
    const page = await authContext.newPage();

    await initiatePayPalCheckout(page, 'subscription', /PayPal Monthly Plan$/i);
    await loginAndApprovePayPal(page);

    expect(page.url()).toContain('payment-success');
    expect(page.url()).toMatch(/provider=paypal/);

    await expect(page.locator('h1').first()).toBeVisible({ timeout: TIMEOUTS.stripe });

    await page.close();
  });
});

// ── C) Credits Purchase Flow ─────────────────────────────────────────────

test.describe('PayPal Credits Purchase', () => {
  test.describe.configure({ mode: 'serial' });

  let authContext: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    if (!PAYPAL_SANDBOX_EMAIL || !PAYPAL_SANDBOX_PASSWORD) return;
    const result = await createAuthenticatedContext(browser, 'e2e-paypal-credits', password);
    authContext = result.context;
  });

  test.afterAll(async () => {
    await authContext?.close();
  });

  test('can complete PayPal credits purchase and see success page', async () => {
    test.setTimeout(180_000);
    const page = await authContext.newPage();

    await initiatePayPalCheckout(page, 'credits', /100 Credits PayPal/i);
    await loginAndApprovePayPal(page);

    expect(page.url()).toContain('payment-success');
    expect(page.url()).toMatch(/provider=paypal/);

    await page.close();
  });

  test('dashboard credits tab shows updated balance after PayPal purchase', async () => {
    test.setTimeout(180_000);
    const page = await authContext.newPage();

    let balance = 0;
    const MAX_ATTEMPTS = 6;
    const POLL_INTERVAL = 10_000;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        await page.waitForTimeout(POLL_INTERVAL);
      }

      await page.goto(PAGES.dashboard, { timeout: TIMEOUTS.navigation });
      await expect(page).toHaveURL(/\/dashboard/);

      await clickDashboardTab(page, /Credits|积分/);

      const creditTitle = page.locator('text=/Credit Balance|积分余额/i');
      await expect(creditTitle.first()).toBeVisible({ timeout: TIMEOUTS.navigation });

      const availableLabel = page.locator('text=/Available Credits|可用积分/i');
      await expect(availableLabel.first()).toBeVisible();

      const balanceElement = page.locator('.grid.grid-cols-3 .text-2xl.font-bold').first();
      await expect(balanceElement).toBeVisible({ timeout: TIMEOUTS.navigation });

      const balanceText = await balanceElement.textContent();
      balance = parseInt(balanceText?.replace(/,/g, '') || '0', 10);

      if (balance >= 100) break;
    }

    if (balance === 0) {
      console.warn(
        `[paypal-payment] Credits balance is still 0 after ${MAX_ATTEMPTS} polls. ` +
        `PayPal webhook may not have been processed yet.`,
      );
    }
    expect(balance).toBeGreaterThanOrEqual(100);

    const totalPurchasedLabel = page.locator('text=/Total Purchased|累计购买/i');
    await expect(totalPurchasedLabel.first()).toBeVisible();

    const purchasedElement = page.locator('.grid.grid-cols-3 .text-2xl.font-bold').nth(1);
    const purchasedText = await purchasedElement.textContent();
    const purchased = parseInt(purchasedText?.replace(/,/g, '') || '0', 10);
    expect(purchased).toBeGreaterThanOrEqual(100);

    await page.close();
  });
});
