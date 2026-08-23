import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PAGES, TIMEOUTS, API, uniqueEmail, ADMIN_USER } from '../helpers/constants';
import { signUpViaAPI, signInViaAPI } from '../helpers/auth';

/**
 * Affiliate / Referral System E2E Tests
 *
 * Covers:
 * - Referral code generation and stats API
 * - Referral link cookie capture via ?ref= middleware
 * - Referral code claim flow (referrer → referee)
 * - Dashboard Affiliate and Withdrawal tab UI
 * - Withdrawal request validation (insufficient balance)
 */

test.describe('Affiliate System', () => {

  // ── A) Referral Code Generation & Stats API ────────────────────

  test.describe('Referral Stats API', () => {
    test.describe.configure({ mode: 'serial' });

    let sharedContext: BrowserContext;
    let sharedPage: Page;
    let referralCode: string;

    test.beforeAll(async ({ browser }) => {
      sharedContext = await browser.newContext();
      sharedPage = await sharedContext.newPage();

      const res = await signUpViaAPI(sharedPage, {
        name: 'Affiliate Stats User',
        email: uniqueEmail('aff-stats'),
        password: 'TestPassword123!',
      });
      expect(res.ok()).toBeTruthy();
    });

    test.afterAll(async () => {
      await sharedContext?.close();
    });

    test('stats API returns referral code and link', async () => {
      const res = await sharedPage.request.get(API.affiliateStats, {
        timeout: TIMEOUTS.auth,
      });
      expect(res.ok(), `GET /api/affiliate/stats failed: ${res.status()}`).toBeTruthy();

      const data = await res.json();
      expect(data.enabled).toBe(true);
      expect(data.referralCode).toBeTruthy();
      expect(data.referralCode.length).toBe(8);
      expect(data.referralLink).toContain('?ref=');
      expect(data.commissionBalance).toBeGreaterThanOrEqual(0);
      expect(data.commissionRate).toBeGreaterThan(0);

      referralCode = data.referralCode;
    });

    test('stats API returns the same referral code on repeated calls (idempotent)', async () => {
      const res = await sharedPage.request.get(API.affiliateStats, {
        timeout: TIMEOUTS.auth,
      });
      expect(res.ok()).toBeTruthy();

      const data = await res.json();
      expect(data.referralCode).toBe(referralCode);
    });
  });

  // ── B) Referral Link Cookie Capture ────────────────────────────

  test.describe('Referral Cookie Capture', () => {
    test('visiting URL with ?ref= sets referral_code cookie', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto(`${PAGES.home}?ref=TESTCODE123`, {
        timeout: TIMEOUTS.navigation,
      });

      // Wait for redirect/page load
      await page.waitForLoadState('networkidle', { timeout: TIMEOUTS.navigation });

      // Verify cookie was set
      const cookies = await context.cookies();
      const referralCookie = cookies.find(c => c.name === 'referral_code');
      expect(referralCookie).toBeTruthy();
      expect(referralCookie!.value).toBe('TESTCODE123');

      // The ?ref= param should be stripped from the URL
      expect(page.url()).not.toContain('ref=');

      await page.close();
      await context.close();
    });
  });

  // ── C) Referral Claim Flow ─────────────────────────────────────

  test.describe('Referral Claim Flow', () => {
    test('complete referral claim flow: referrer → referee', async ({ browser }) => {
      test.setTimeout(90_000);
      // Step 1: Create referrer (User A) and get referral code
      const referrerContext = await browser.newContext();
      const referrerPage = await referrerContext.newPage();

      const referrerEmail = uniqueEmail('aff-referrer');
      const referrerRes = await signUpViaAPI(referrerPage, {
        name: 'Referrer User',
        email: referrerEmail,
        password: 'TestPassword123!',
      });
      expect(referrerRes.ok()).toBeTruthy();

      const statsRes = await referrerPage.request.get(API.affiliateStats, {
        timeout: TIMEOUTS.auth,
      });
      expect(statsRes.ok()).toBeTruthy();
      const statsData = await statsRes.json();
      const referralCode = statsData.referralCode;
      expect(referralCode).toBeTruthy();

      // Step 2: Create referee (User B) with the referral cookie
      const baseUrl = 'http://localhost:7001';
      const refereeContext = await browser.newContext({
        baseURL: baseUrl,
        extraHTTPHeaders: { Origin: baseUrl },
      });
      await refereeContext.addCookies([{
        name: 'referral_code',
        value: referralCode,
        domain: 'localhost',
        path: '/',
      }]);
      const refereePage = await refereeContext.newPage();

      // Wait to avoid rate limiting from the previous sign-up
      await new Promise(r => setTimeout(r, 5000));

      // Sign up as referee
      const refereeEmail = uniqueEmail('aff-referee');
      const refereeRes = await signUpViaAPI(refereePage, {
        name: 'Referee User',
        email: refereeEmail,
        password: 'TestPassword123!',
      });
      expect(
        refereeRes.ok(),
        `Referee sign-up failed: ${refereeRes.status()} ${await refereeRes.text().catch(() => '')}`
      ).toBeTruthy();

      // Step 3: Claim the referral code
      const claimRes = await refereePage.request.post(API.affiliateClaim, {
        timeout: TIMEOUTS.auth,
      });
      expect(claimRes.ok(), `POST /api/affiliate/claim failed: ${claimRes.status()}`).toBeTruthy();

      const claimData = await claimRes.json();
      expect(claimData.applied).toBe(true);

      // Step 4: Verify referrer can see the referral
      const referralsRes = await referrerPage.request.get(
        `${API.affiliateReferrals}?limit=10`,
        { timeout: TIMEOUTS.auth }
      );
      expect(referralsRes.ok()).toBeTruthy();

      const referralsData = await referralsRes.json();
      expect(referralsData.referrals.length).toBeGreaterThanOrEqual(1);

      await referrerPage.close();
      await referrerContext.close();
      await refereePage.close();
      await refereeContext.close();
    });

    test('claim with no referral code returns gracefully', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      const res = await signUpViaAPI(page, {
        name: 'No Referral User',
        email: uniqueEmail('aff-noref'),
        password: 'TestPassword123!',
      });
      expect(res.ok()).toBeTruthy();

      const claimRes = await page.request.post(API.affiliateClaim, {
        timeout: TIMEOUTS.auth,
      });
      expect(claimRes.ok()).toBeTruthy();

      const claimData = await claimRes.json();
      expect(claimData.applied).toBe(false);

      await page.close();
      await context.close();
    });
  });

  // ── D) Dashboard Affiliate & Withdrawal Tab UI ─────────────────

  test.describe('Dashboard Affiliate Tabs', () => {
    test.describe.configure({ mode: 'serial' });

    let sharedContext: BrowserContext;
    let sharedPage: Page;

    test.beforeAll(async ({ browser }) => {
      sharedContext = await browser.newContext();
      sharedPage = await sharedContext.newPage();

      // Use existing admin user to avoid sign-up rate limiting
      const res = await signInViaAPI(sharedPage, {
        email: ADMIN_USER.email,
        password: ADMIN_USER.password,
      });
      expect(res.ok(), `Dashboard tab sign-in failed: ${res.status()}`).toBeTruthy();
    });

    test.afterAll(async () => {
      await sharedContext?.close();
    });

    test('dashboard shows Affiliate tab with stats', async () => {
      test.setTimeout(60_000);
      await sharedPage.goto(PAGES.dashboard, { timeout: TIMEOUTS.navigation });
      await sharedPage.waitForSelector('h1', { timeout: TIMEOUTS.navigation });

      // Find and click the Affiliate tab
      const affiliateTab = sharedPage.locator(
        'button'
      ).filter({ hasText: /Affiliate/ }).first();

      await expect(affiliateTab).toBeVisible({ timeout: TIMEOUTS.navigation });
      await affiliateTab.click();

      // Wait for loading spinner to disappear (AffiliateCard fetches data async)
      await sharedPage.waitForFunction(
        () => !document.querySelector('.animate-spin'),
        { timeout: TIMEOUTS.navigation }
      );

      // Verify affiliate content is showing: stats area with commission info or referral link
      await expect(
        sharedPage.locator('text=/Commission Balance|Commission Rate|Referral Link|佣金余额|推荐链接/').first()
      ).toBeVisible({ timeout: TIMEOUTS.navigation });
    });

    test('dashboard shows Withdrawal tab with form', async () => {
      // Find and click the Withdrawal tab (no need to reload - tabs are client-side)
      const withdrawalTab = sharedPage.locator(
        'button'
      ).filter({ hasText: /Withdrawal/ }).first();

      await expect(withdrawalTab).toBeVisible({ timeout: TIMEOUTS.navigation });
      await withdrawalTab.click();

      // Wait for loading spinner to disappear
      await sharedPage.waitForFunction(
        () => !document.querySelector('.animate-spin'),
        { timeout: TIMEOUTS.navigation }
      );

      // Should show withdrawal form elements — amount input or balance display
      await expect(
        sharedPage.locator('text=/Available Balance|Payment Method|Request Withdrawal|可提现余额|支付方式/').first()
      ).toBeVisible({ timeout: TIMEOUTS.navigation });
    });
  });

  // ── E) Withdrawal Request Validation ───────────────────────────

  test.describe('Withdrawal Request', () => {
    test('withdrawal fails with insufficient balance', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      const res = await signUpViaAPI(page, {
        name: 'Withdrawal Test User',
        email: uniqueEmail('aff-withdraw'),
        password: 'TestPassword123!',
      });
      expect(res.ok()).toBeTruthy();

      const withdrawRes = await page.request.post(API.withdrawalRequest, {
        data: {
          amount: '100',
          paymentMethod: 'alipay',
          paymentAccount: 'test@test.com',
        },
        timeout: TIMEOUTS.auth,
      });

      // Should fail with 400 (insufficient balance)
      expect(withdrawRes.status()).toBe(400);

      const errorData = await withdrawRes.json();
      expect(errorData.error).toBeTruthy();

      await page.close();
      await context.close();
    });
  });
});
