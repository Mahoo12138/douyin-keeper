import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PAGES, TIMEOUTS, API, uniqueEmail } from '../helpers/constants';
import { signUpViaAPI } from '../helpers/auth';

/**
 * Dodo Payments Affiliate Commission E2E Test — Full Payment Flow
 *
 * Verifies the end-to-end path:
 *   Referrer shares link → Referee signs up → Referee purchases via Dodo
 *   → Webhook fires → Referrer's commission balance increases
 *
 * Prerequisites:
 * 1. Dev server running on port 7001
 * 2. Dodo webhook tunnel running:
 *    `dodo wh listen` or cloudflared/ngrok → /api/payment/webhook/dodo
 * 3. .env has DODO_PAYMENTS_API_KEY, DODO_PAYMENTS_WEBHOOK_KEY, DODO_PAYMENTS_TEST_MODE="true"
 * 4. AFFILIATE_ENABLED=true (default)
 */

const DODO_TEST_CARD = {
  number: '4242424242424242',
  expiry: '0632',
  cvc: '123',
  name: 'E2E Referral Buyer',
};

async function fillAndSubmitDodoCheckout(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);

  // Step 1: Fill billing address
  const allSelects = page.locator('select');
  const selectCount = await allSelects.count();

  for (let i = selectCount - 1; i >= 0; i--) {
    const sel = allSelects.nth(i);
    const usOption = sel.locator('option').filter({ hasText: /^United States$/ });
    if (await usOption.count() > 0) {
      await sel.selectOption({ label: 'United States' });
      break;
    }
  }

  await page.waitForTimeout(1000);

  const manualAddressLink = page.locator('button').filter({
    hasText: /Enter address manually|手动输入地址/i,
  }).first();
  if (await manualAddressLink.isVisible().catch(() => false)) {
    await manualAddressLink.click();
    await page.waitForTimeout(1500);
  }

  const addressInput = page.locator(
    'input[placeholder="Address Line"]:visible, input[placeholder="地址行"]:visible'
  ).first();
  await addressInput.waitFor({ state: 'visible', timeout: 5_000 });
  await addressInput.fill('123 Test Street');

  const cityInput = page.locator(
    'input[placeholder="City"]:visible, input[placeholder="城市"]:visible'
  ).first();
  if (await cityInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await cityInput.fill('New York');
  }

  const zipInput = page.locator(
    'input[placeholder="Zip Code"]:visible, input[placeholder="Zip code"]:visible, ' +
    'input[placeholder="邮政编码"]:visible'
  ).first();
  if (await zipInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await zipInput.fill('10001');
  }

  const stateInput = page.locator(
    'input[placeholder="State"]:visible, input[placeholder="州"]:visible'
  ).first();
  if (await stateInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await stateInput.fill('NY');
  }

  await page.waitForTimeout(500);

  const continueButton = page.locator('button').filter({
    hasText: /Continue to Payment|继续付款/i,
  }).first();
  await continueButton.scrollIntoViewIfNeeded();
  await continueButton.waitFor({ state: 'visible', timeout: 10_000 });
  await continueButton.click();

  await page.waitForTimeout(5000);

  // Step 2: Fill card payment (Stripe Elements iframe inside Dodo checkout)
  const stripeIframeSelectors = [
    'iframe[title*="Secure payment" i]',
    'iframe[title*="payment" i]',
    'iframe[title*="card" i]',
    'iframe[name*="__privateStripeFrame"]',
    'iframe[src*="js.stripe.com/v3/elements"]',
    'iframe[src*="stripe.com"]',
    'iframe',
  ];

  let cardFilled = false;

  for (const iframeSel of stripeIframeSelectors) {
    if (cardFilled) break;
    try {
      const iframes = page.locator(iframeSel);
      const iframeCount = await iframes.count();

      for (let idx = 0; idx < iframeCount; idx++) {
        if (cardFilled) break;
        try {
          const frame = iframes.nth(idx).contentFrame();

          const cardInput = frame.locator(
            'input[name="number"], input[name="cardnumber"], ' +
            'input[autocomplete="cc-number"], input[placeholder*="1234"]'
          ).first();

          if (!await cardInput.isVisible({ timeout: 3_000 }).catch(() => false)) continue;

          await cardInput.click();
          await cardInput.pressSequentially(DODO_TEST_CARD.number, { delay: 50 });

          const expiry = frame.locator(
            'input[name="expiry"], input[name="exp-date"], ' +
            'input[autocomplete="cc-exp"], input[placeholder*="MM"]'
          ).first();
          if (await expiry.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await expiry.click();
            await expiry.pressSequentially(DODO_TEST_CARD.expiry, { delay: 50 });
          }

          const cvc = frame.locator(
            'input[name="cvc"], input[name="csc"], ' +
            'input[autocomplete="cc-csc"], input[placeholder*="CVC" i]'
          ).first();
          if (await cvc.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await cvc.click();
            await cvc.pressSequentially(DODO_TEST_CARD.cvc, { delay: 50 });
          }

          const nameInput = frame.locator(
            'input[placeholder*="Name on card" i], input[placeholder*="卡片上" i], ' +
            'input[placeholder*="持卡人" i], input[autocomplete="cc-name"]'
          ).first();
          if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await nameInput.fill(DODO_TEST_CARD.name);
          }

          cardFilled = true;
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(2000);

  const submitButton = page.locator('button').filter({
    hasText: /Pay Now|Pay \$|Subscribe|Purchase|立即支付|立即订阅/i,
  }).first();
  await submitButton.scrollIntoViewIfNeeded();
  await submitButton.waitFor({ state: 'visible', timeout: 10_000 });
  await expect(submitButton).toBeEnabled({ timeout: 30_000 });

  await submitButton.click();

  await page.waitForURL(/payment-success/, { timeout: 120_000 });
}

test.describe('Affiliate Commission via Dodo Payment', () => {
  test.describe.configure({ mode: 'serial' });

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
    testInfo.setTimeout(120_000);

    // Step 1: Create referrer (User A)
    referrerEmail = uniqueEmail('dodo-aff-referrer');
    referrerContext = await browser.newContext();
    referrerPage = await referrerContext.newPage();

    const referrerRes = await signUpViaAPI(referrerPage, {
      name: 'Dodo Commission Referrer',
      email: referrerEmail,
      password: 'TestPassword123!',
    });
    expect(referrerRes.ok(), `Referrer sign-up failed: ${referrerRes.status()}`).toBeTruthy();

    const statsRes = await referrerPage.request.get(API.affiliateStats, {
      timeout: TIMEOUTS.auth,
    });
    expect(statsRes.ok()).toBeTruthy();
    const statsData = await statsRes.json();
    referralCode = statsData.referralCode;
    initialCommissionBalance = statsData.commissionBalance;
    expect(referralCode).toBeTruthy();

    // Step 2: Create referee (User B) with referral link
    await new Promise(r => setTimeout(r, 5000));

    refereeContext = await browser.newContext({
      extraHTTPHeaders: {
        'Origin': 'http://localhost:7001',
      },
    });
    refereePage = await refereeContext.newPage();

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

    await refereeContext.addCookies([{
      name: 'referral_code',
      value: referralCode,
      domain: 'localhost',
      path: '/',
    }]);

    refereeEmail = uniqueEmail('dodo-aff-referee');
    const refereeRes = await signUpViaAPI(refereePage, {
      name: 'Dodo Commission Referee',
      email: refereeEmail,
      password: 'TestPassword123!',
    });
    expect(
      refereeRes.ok(),
      `Referee sign-up failed: ${refereeRes.status()} ${await refereeRes.text().catch(() => '')}`
    ).toBeTruthy();

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

  test('referee can complete a Dodo credits purchase', async () => {
    test.slow();

    await refereePage.goto(PAGES.pricing, { timeout: TIMEOUTS.navigation });
    await refereePage.waitForLoadState('networkidle');
    await refereePage.locator('h3').first().waitFor({ state: 'attached', timeout: TIMEOUTS.navigation });

    // Switch to credits tab
    const creditsTab = refereePage.locator('.inline-flex.p-1 button').nth(1);
    await creditsTab.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
    await creditsTab.click();
    await refereePage.waitForTimeout(1000);

    // Find the 100 Credits Dodo plan
    const planHeading = refereePage.locator('h3').filter({ hasText: /100 Credits Dodo/i });
    await planHeading.waitFor({ state: 'attached', timeout: TIMEOUTS.navigation });
    await planHeading.scrollIntoViewIfNeeded();

    const card = planHeading.locator('xpath=ancestor::div[contains(@class,"rounded")]').first();
    const ctaButton = card.locator('button').first();
    await ctaButton.click();

    // Wait for Dodo Checkout redirect
    await refereePage.waitForURL(
      (url) => url.hostname.includes('dodopayments') && !url.hostname.includes('localhost'),
      { timeout: TIMEOUTS.stripe },
    );

    await fillAndSubmitDodoCheckout(refereePage);

    expect(refereePage.url()).toContain('payment-success');
  });

  test('referrer commission balance increases after referee Dodo payment', async () => {
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
            `[dodo-affiliate-commission] Commission received after ${attempt} poll(s): ` +
            `${initialCommissionBalance} → ${currentBalance}`
          );
          break;
        }
      }

      if (attempt === MAX_ATTEMPTS) {
        console.warn(
          `[dodo-affiliate-commission] Commission balance unchanged after ${MAX_ATTEMPTS} polls. ` +
          `Ensure Dodo webhook tunnel is running (dodo wh listen or cloudflared/ngrok).`
        );
      }
    }

    expect(currentBalance).toBeGreaterThan(initialCommissionBalance);
  });

  test('referrer dashboard shows updated commission stats after Dodo payment', async () => {
    await referrerPage.goto(PAGES.dashboard, { timeout: TIMEOUTS.navigation });

    const affiliateTab = referrerPage.locator('button').filter({ hasText: /Affiliate/ }).first();
    await expect(affiliateTab).toBeVisible({ timeout: TIMEOUTS.navigation });
    await affiliateTab.click();

    await referrerPage.waitForFunction(
      () => !document.querySelector('.animate-spin'),
      { timeout: TIMEOUTS.navigation }
    );

    await expect(
      referrerPage.locator('text=/Commission Balance|佣金余额/').first()
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    const statsRes = await referrerPage.request.get(API.affiliateStats, {
      timeout: TIMEOUTS.auth,
    });
    expect(statsRes.ok()).toBeTruthy();
    const stats = await statsRes.json();
    expect(stats.totalRegisteredReferrals).toBeGreaterThanOrEqual(1);
    expect(stats.totalPaidReferrals).toBeGreaterThanOrEqual(1);
  });

  test('commission records from Dodo payment include buyer info', async () => {
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
