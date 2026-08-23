import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PAGES, TIMEOUTS, API, uniqueEmail } from '../helpers/constants';
import { signUpViaAPI } from '../helpers/auth';

/**
 * Affiliate Commission E2E Test — Full Payment Flow
 *
 * Verifies the critical end-to-end path:
 *   Referrer shares link → Referee signs up → Referee purchases via Stripe
 *   → Webhook fires → Referrer's commission balance increases
 *
 * This test catches integration bugs like the metadata-overwrite issue
 * where referral info was lost during payment initiation.
 *
 * Prerequisites:
 * 1. Dev server running on port 7001
 * 2. Stripe CLI forwarding webhooks:
 *    `stripe listen --forward-to localhost:7001/api/payment/webhook/stripe`
 * 3. Stripe test mode keys in .env
 * 4. AFFILIATE_ENABLED=true (default)
 */

const STRIPE_TEST_CARD = {
  number: '4242424242424242',
  expiry: '1230',
  cvc: '123',
  name: 'E2E Referral Buyer',
};

async function fillAndSubmitStripeCheckout(page: Page): Promise<void> {
  const cardNumberInput = page.locator('input[placeholder="1234 1234 1234 1234"]');
  await cardNumberInput.waitFor({ state: 'visible', timeout: TIMEOUTS.stripe });

  await cardNumberInput.fill(STRIPE_TEST_CARD.number);
  await page.locator('input[placeholder="MM / YY"]').fill(STRIPE_TEST_CARD.expiry);
  await page.locator('input[placeholder="CVC"]').fill(STRIPE_TEST_CARD.cvc);
  await page.locator('input[placeholder="Full name on card"]').fill(STRIPE_TEST_CARD.name);

  const submitButton = page.locator('button:has-text("Subscribe"), button:has-text("Pay")');
  await submitButton.click();

  await page.waitForURL(/payment-success/, { timeout: TIMEOUTS.stripe * 2 });
}

test.describe('Affiliate Commission via Stripe Payment', () => {
  test.describe.configure({ mode: 'serial' });

  // Give individual tests generous timeouts for Stripe + webhook polling
  test.setTimeout(180_000);

  let referrerContext: BrowserContext;
  let referrerPage: Page;
  let referrerEmail: string;
  let referralCode: string;
  let initialCommissionBalance: number;

  let refereeContext: BrowserContext;
  let refereePage: Page;
  let refereeEmail: string;

  test.beforeAll(async ({ browser }, testInfo) => {
    // Allow up to 120s for setup (two sign-ups + Nuxt cold boot retry)
    testInfo.setTimeout(120_000);
    // ── Step 1: Create referrer (User A) ──────────────────────────
    referrerEmail = uniqueEmail('aff-comm-referrer');
    referrerContext = await browser.newContext();
    referrerPage = await referrerContext.newPage();

    const referrerRes = await signUpViaAPI(referrerPage, {
      name: 'Commission Referrer',
      email: referrerEmail,
      password: 'TestPassword123!',
    });
    expect(referrerRes.ok(), `Referrer sign-up failed: ${referrerRes.status()}`).toBeTruthy();

    // Get referrer's referral code and initial balance
    const statsRes = await referrerPage.request.get(API.affiliateStats, {
      timeout: TIMEOUTS.auth,
    });
    expect(statsRes.ok()).toBeTruthy();
    const statsData = await statsRes.json();
    referralCode = statsData.referralCode;
    initialCommissionBalance = statsData.commissionBalance;
    expect(referralCode).toBeTruthy();

    // ── Step 2: Create referee (User B) with referral link ──────
    // Wait to avoid rate limiting between sign-ups
    await new Promise(r => setTimeout(r, 5000));

    // Use extraHTTPHeaders to set Origin for CSRF protection
    refereeContext = await browser.newContext({
      extraHTTPHeaders: {
        'Origin': 'http://localhost:7001',
      },
    });
    refereePage = await refereeContext.newPage();

    // Navigate with ?ref= param to simulate clicking a referral link.
    // Retry navigation to handle Nuxt cold boot ERR_EMPTY_RESPONSE.
    for (let nav = 1; nav <= 3; nav++) {
      try {
        await refereePage.goto(`${PAGES.home}?ref=${referralCode}`, {
          timeout: TIMEOUTS.navigation,
        });
        await refereePage.waitForLoadState('domcontentloaded');
        break;
      } catch {
        if (nav === 3) throw new Error('Failed to navigate after 3 attempts');
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    // Explicitly set referral cookie (client-side JS may not run identically
    // across frameworks, so we ensure the cookie is always present)
    await refereeContext.addCookies([{
      name: 'referral_code',
      value: referralCode,
      domain: 'localhost',
      path: '/',
    }]);

    refereeEmail = uniqueEmail('aff-comm-referee');
    const refereeRes = await signUpViaAPI(refereePage, {
      name: 'Commission Referee',
      email: refereeEmail,
      password: 'TestPassword123!',
    });
    expect(
      refereeRes.ok(),
      `Referee sign-up failed: ${refereeRes.status()} ${await refereeRes.text().catch(() => '')}`
    ).toBeTruthy();

    // Claim the referral
    const claimRes = await refereePage.request.post(API.affiliateClaim, {
      timeout: TIMEOUTS.auth,
    });
    expect(claimRes.ok()).toBeTruthy();
    const claimData = await claimRes.json();
    expect(claimData.applied).toBe(true);
  });

  test.afterAll(async () => {
    await referrerPage?.close();
    await referrerContext?.close();
    await refereePage?.close();
    await refereeContext?.close();
  });

  // ── Test: Referee completes Stripe purchase ──────────────────────

  test('referee can complete a Stripe credits purchase', async () => {
    test.slow();

    // Navigate to pricing page and switch to credits tab
    await refereePage.goto(PAGES.pricing, { timeout: TIMEOUTS.navigation });
    await refereePage.waitForLoadState('networkidle');
    await refereePage.locator('h3').first().waitFor({ state: 'attached', timeout: TIMEOUTS.navigation });

    // Switch to credits tab
    const creditsTab = refereePage.locator('.inline-flex.p-1 button').nth(1);
    await creditsTab.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
    await creditsTab.click();
    await refereePage.waitForTimeout(1000);

    // Find the first 100 Credits Stripe plan (dynamic pricing may have duplicates)
    const planHeading = refereePage.locator('h3').filter({ hasText: /100 Credits Stripe/i }).first();
    await planHeading.waitFor({ state: 'attached', timeout: TIMEOUTS.navigation });
    await planHeading.scrollIntoViewIfNeeded();

    // Click CTA button
    const card = planHeading.locator('xpath=ancestor::div[contains(@class,"rounded")]').first();
    const ctaButton = card.locator('button').first();
    await ctaButton.click();

    // Wait for Stripe Checkout
    await refereePage.waitForURL(/checkout\.stripe\.com/, { timeout: TIMEOUTS.stripe });

    // Fill card details and submit
    await fillAndSubmitStripeCheckout(refereePage);

    expect(refereePage.url()).toContain('payment-success');
    expect(refereePage.url()).toContain('provider=stripe');
  });

  // ── Test: Referrer receives commission ───────────────────────────

  test('referrer commission balance increases after referee payment', async () => {
    // Poll the referrer's affiliate stats — webhook may take time
    const MAX_ATTEMPTS = 12;
    const POLL_INTERVAL = 5_000;
    let currentBalance = initialCommissionBalance;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        await referrerPage.waitForTimeout(POLL_INTERVAL);
      }

      const statsRes = await referrerPage.request.get(API.affiliateStats, {
        timeout: TIMEOUTS.auth,
      });

      if (statsRes.ok()) {
        const data = await statsRes.json();
        currentBalance = data.commissionBalance;

        if (currentBalance > initialCommissionBalance) {
          console.log(
            `[affiliate-commission] Commission received after ${attempt} poll(s): ` +
            `${initialCommissionBalance} → ${currentBalance}`
          );
          break;
        }
      }

      if (attempt === MAX_ATTEMPTS) {
        console.warn(
          `[affiliate-commission] Commission balance unchanged after ${MAX_ATTEMPTS} polls. ` +
          `Ensure 'stripe listen --forward-to localhost:7001/api/payment/webhook/stripe' is running.`
        );
      }
    }

    // Commission should have increased
    // For a $5 credits purchase at 20% rate, expected commission = $1.00
    expect(currentBalance).toBeGreaterThan(initialCommissionBalance);
  });

  // ── Test: Commission record visible in referrer's dashboard ──────

  test('referrer dashboard shows updated commission stats', async () => {
    await referrerPage.goto(PAGES.dashboard, { timeout: TIMEOUTS.navigation });

    // Click the Affiliate tab
    const affiliateTab = referrerPage.locator('button').filter({ hasText: /Affiliate/ }).first();
    await expect(affiliateTab).toBeVisible({ timeout: TIMEOUTS.navigation });
    await affiliateTab.click();

    // Wait for data to load
    await referrerPage.waitForFunction(
      () => !document.querySelector('.animate-spin'),
      { timeout: TIMEOUTS.navigation }
    );

    // Verify commission info is displayed
    await expect(
      referrerPage.locator('text=/Commission Balance|佣金余额/').first()
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    // The referrer should see at least 1 referred user
    const statsRes = await referrerPage.request.get(API.affiliateStats, {
      timeout: TIMEOUTS.auth,
    });
    expect(statsRes.ok()).toBeTruthy();
    const stats = await statsRes.json();
    expect(stats.totalRegisteredReferrals).toBeGreaterThanOrEqual(1);
    expect(stats.totalPaidReferrals).toBeGreaterThanOrEqual(1);
  });

  // ── Test: Commission API returns buyer info ──────────────────────

  test('commission records include buyer name and email', async () => {
    const commissionsRes = await referrerPage.request.get(
      `${API.affiliateCommissions}?limit=10`,
      { timeout: TIMEOUTS.auth },
    );
    expect(commissionsRes.ok()).toBeTruthy();

    const data = await commissionsRes.json();
    expect(data.commissions.length).toBeGreaterThanOrEqual(1);

    const latestCommission = data.commissions[0];
    expect(latestCommission.buyer).toBeTruthy();
    expect(latestCommission.buyer.email).toContain('@');
    expect(latestCommission.orderAmount).toBeTruthy();
    expect(parseFloat(latestCommission.commissionAmount)).toBeGreaterThan(0);
  });
});
