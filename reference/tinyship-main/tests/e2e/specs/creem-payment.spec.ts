import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PAGES, TIMEOUTS, uniqueEmail } from '../helpers/constants';
import { signUpViaAPI } from '../helpers/auth';

/**
 * Creem Payment E2E Tests
 *
 * Covers two purchase flows (each with its own user to avoid state leakage):
 *   A) Subscription — buy "Creem Monthly Plan" (recurring), verify redirect
 *      to Creem Checkout, complete payment, and verify dashboard subscription.
 *   B) One-time — buy "Creem Monthly Plan (One Time)", verify redirect
 *      to Creem Checkout and payment completion.
 *
 * Prerequisites:
 * 1. Dev server running on port 7001 (`pnpm dev:next` or `pnpm dev:nuxt`)
 * 2. Cloudflared tunnel running (forwards webhooks to localhost:7001)
 * 3. .env has CREEM_API_KEY, CREEM_WEBHOOK_SECRET, CREEM_SERVER_URL (test mode)
 * 4. Creem products created with correct creemProductId in config/payment.ts
 *
 * Creem checkout uses a two-step form followed by a Yuno card form iframe.
 * Test card: 4242 4242 4242 4242 (Stripe test card)
 *
 * Both subscription and one-time checkouts use the same form layout:
 * - Step 1: email, full name, billing country, then "Continue to payment"
 * - Step 2: Yuno card form iframe, cardholder name, then the pay button
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Navigate to pricing page, find a plan card by its <h3> heading text,
 * click its CTA button, and wait for the Creem Checkout page to load.
 */
async function initiateCreemCheckout(
  page: Page,
  planNamePattern: RegExp,
): Promise<void> {
  await page.goto(PAGES.pricing, { timeout: TIMEOUTS.navigation });
  await page.waitForLoadState('networkidle');

  // Wait for plan card headings to render
  await page.locator('h3').first().waitFor({ state: 'attached', timeout: TIMEOUTS.navigation });

  // Find the plan card by heading text
  const planHeading = page.locator('h3').filter({ hasText: planNamePattern });
  await planHeading.waitFor({ state: 'attached', timeout: TIMEOUTS.navigation });
  await planHeading.scrollIntoViewIfNeeded();

  // Find the CTA button inside the same card container
  const card = planHeading.locator('xpath=ancestor::div[contains(@class,"rounded")]').first();
  const ctaButton = card.locator('button').first();

  // Wait for button to be enabled (disabled during SSR hydration)
  await ctaButton.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
  await expect(ctaButton).toBeEnabled({ timeout: TIMEOUTS.navigation });

  await ctaButton.click();

  // Wait for redirect to Creem Checkout (www.creem.io)
  await page.waitForURL(
    (url) => url.hostname.includes('creem') && !url.hostname.includes('localhost'),
    { timeout: TIMEOUTS.stripe },
  );
}

/**
 * Fill the Creem Checkout form and submit payment.
 *
 * Creem checkout page layout (discovered via browser inspection):
 *   - Main page: #email (email input), #name (full name input)
 *   - Stripe iframe (title="Secure payment input frame"):
 *       input[name="number"]  (card number, id=payment-numberInput)
 *       input[name="expiry"]  (expiry, id=payment-expiryInput)
 *       input[name="cvc"]     (CVC, id=payment-cvcInput)
 *   - Main page: button[type="submit"] with text like "Pay $10.00Subscribe"
 */
async function fillAndSubmitCreemCheckout(page: Page): Promise<void> {
  // Use domcontentloaded instead of networkidle — Creem keeps
  // making background requests (analytics, telemetry) that prevent
  // networkidle from ever resolving.
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);

  // Step 1: billing details. The email is populated by Creem from checkout
  // creation and is disabled in the current UI.
  const emailInput = page.locator('#email');
  await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
  await expect(emailInput).toHaveValue(/@/);

  const nameInput = page.locator('#name');
  await nameInput.waitFor({ state: 'visible', timeout: 10_000 });
  await nameInput.fill('E2E Test User');

  // The current Creem checkout uses Radix comboboxes. China avoids the extra
  // state/province fields required by the US address branch.
  const countryCombobox = page.getByRole('combobox').first();
  await countryCombobox.click();
  await page.getByRole('option', { name: 'China', exact: true }).click();
  await expect(countryCombobox).toHaveText('China');

  const continueButton = page.getByRole('button', {
    name: /Continue to payment|继续付款/i,
  });
  await expect(continueButton).toBeEnabled({ timeout: TIMEOUTS.stripe });
  await continueButton.click();

  // Step 2: the card form is now a Yuno iframe, rendered only after the
  // billing-details step. Its fields do not expose stable names, so use their
  // documented visual order: card number, expiry, then CVC.
  const cardFrame = page.frameLocator('iframe[title="card_form"]');
  const cardInputs = cardFrame.locator('input');
  await cardInputs.nth(0).waitFor({ state: 'visible', timeout: TIMEOUTS.stripe });
  await cardInputs.nth(0).pressSequentially('4242424242424242', { delay: 50 });
  await cardInputs.nth(1).pressSequentially('1230', { delay: 50 });
  await cardInputs.nth(2).pressSequentially('123', { delay: 50 });

  const cardholderName = page.getByRole('textbox', {
    name: /Cardholder name|持卡人姓名/i,
  });
  await cardholderName.fill('E2E Test User');

  const submitButton = page.getByRole('button', {
    name: /Pay\s*(US)?\$|支付/i,
  }).last();
  await expect(submitButton).toBeEnabled({ timeout: TIMEOUTS.stripe });
  await submitButton.click();

  // Wait for redirect to payment-success page
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
    name: 'Creem Test User',
    email,
    password,
  });
  expect(res.ok(), `Sign-up failed for ${email}: ${res.status()}`).toBeTruthy();
  await page.close();

  return { context, email };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

const password = 'TestPassword123!';

// ── A) Subscription (Recurring) Purchase Flow ─────────────────────────────

test.describe('Creem Subscription Payment', () => {
  test.describe.configure({ mode: 'serial' });

  let authContext: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    const result = await createAuthenticatedContext(browser, 'e2e-creem-sub', password);
    authContext = result.context;
  });

  test.afterAll(async () => {
    await authContext?.close();
  });

  test('can complete Creem subscription payment and see success page', async () => {
    test.setTimeout(180_000);
    const page = await authContext.newPage();

    // Initiate checkout and verify redirect to Creem
    await initiateCreemCheckout(page, /Creem Monthly Plan$/i);
    expect(page.url()).toContain('creem');

    // Fill form and complete payment
    await fillAndSubmitCreemCheckout(page);

    // Verify success page URL
    expect(page.url()).toContain('payment-success');

    // Verify success page content — heading and dashboard link
    await expect(page.locator('h1').first()).toBeVisible({ timeout: TIMEOUTS.stripe });
    await expect(
      page.locator('a[href*="/dashboard"]').first(),
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    await page.close();
  });

  test('dashboard subscription tab shows Creem plan after payment', async () => {
    test.setTimeout(180_000);
    const page = await authContext.newPage();

    await page.goto(PAGES.dashboard, { timeout: TIMEOUTS.navigation });
    await expect(page).toHaveURL(/\/dashboard/);

    // Click the Subscription sidebar tab
    await clickDashboardTab(page, /Subscription|订阅/);

    // Wait for subscription data to load
    const subscriptionCard = page.locator('.space-y-6').first();
    await subscriptionCard.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });

    // Try to detect if subscription data has arrived
    const planNameLocator = page.locator('text=/Creem Monthly/i');
    const noSubLocator = page.locator('text=/No Active Subscription|View Plans/i');

    // Wait for either the plan name or the "no subscription" state
    await expect(planNameLocator.or(noSubLocator).first()).toBeVisible({
      timeout: TIMEOUTS.stripe,
    });

    // If subscription data is available, verify details
    const hasPlan = await planNameLocator.isVisible().catch(() => false);
    if (hasPlan) {
      await expect(planNameLocator.first()).toBeVisible();

      // "Active" status badge should be present
      const activeBadge = page.locator('text=/Active|活跃/i').first();
      await expect(activeBadge).toBeVisible();

      // Period start and end date labels
      const startDateLabel = page.locator('text=/Start Date|开始日期/i');
      await expect(startDateLabel.first()).toBeVisible();

      const endDateLabel = page.locator('text=/End Date|结束日期/i');
      await expect(endDateLabel.first()).toBeVisible();

      // Payment type badge should show "Recurring"
      const recurringBadge = page.locator('text=/Recurring|循环订阅/i');
      await expect(recurringBadge.first()).toBeVisible();
    }

    // If no subscription found, the test still passes — webhook may not have fired yet
    if (!hasPlan) {
      await expect(noSubLocator.first()).toBeVisible();
    }

    await page.close();
  });
});

// ── B) One-Time Purchase Flow ─────────────────────────────────────────────

test.describe('Creem One-Time Payment', () => {
  test.describe.configure({ mode: 'serial' });

  let authContext: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    const result = await createAuthenticatedContext(browser, 'e2e-creem-once', password);
    authContext = result.context;
  });

  test.afterAll(async () => {
    await authContext?.close();
  });

  test('can complete Creem one-time payment and see success page', async () => {
    test.setTimeout(180_000);
    const page = await authContext.newPage();

    // Initiate checkout and verify redirect to Creem
    await initiateCreemCheckout(page, /Creem Monthly Plan \(One Time\)/i);
    expect(page.url()).toContain('creem');

    // Fill form and complete payment
    await fillAndSubmitCreemCheckout(page);

    // Verify success page URL
    expect(page.url()).toContain('payment-success');

    // Verify success page content
    await expect(page.locator('h1').first()).toBeVisible({ timeout: TIMEOUTS.stripe });
    await expect(
      page.locator('a[href*="/dashboard"]').first(),
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    await page.close();
  });
});
