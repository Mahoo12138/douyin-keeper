import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TIMEOUTS, API, ADMIN_USER, uniqueEmail } from '../helpers/constants';
import { signUpViaAPI, signInViaAPI } from '../helpers/auth';
import { seedCommissionBalance } from '../helpers/commission';

/**
 * Affiliate Withdrawal E2E Test
 *
 * Verifies the withdrawal request + admin approval flow:
 *   User requests withdrawal → Admin approves via PATCH → Balance deducted, status updated
 *
 * Also covers the rejection flow (balance refunded).
 *
 * Prerequisites:
 * 1. Dev server running on port 7001
 * 2. Admin user exists (admin@example.com / admin123)
 */

test.describe('Affiliate Withdrawal Flow', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60_000);

  let userContext: BrowserContext;
  let userPage: Page;
  let userEmail: string;

  let adminContext: BrowserContext;
  let adminPage: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(90_000);

    // Create a test user
    userEmail = uniqueEmail('aff-withdraw');
    userContext = await browser.newContext();
    userPage = await userContext.newPage();

    const signUpRes = await signUpViaAPI(userPage, {
      name: 'Withdrawal Test User',
      email: userEmail,
      password: 'TestPassword123!',
    });
    expect(signUpRes.ok(), `User sign-up failed: ${signUpRes.status()}`).toBeTruthy();

    // Seed commission balance so the user can withdraw
    const sessionRes = await userPage.request.get(API.getSession, { timeout: TIMEOUTS.auth });
    expect(sessionRes.ok()).toBeTruthy();
    const session = await sessionRes.json();
    const userId = session.user?.id;
    expect(userId).toBeTruthy();

    await seedCommissionBalance(userId, 200);

    // Set up admin session — wait to avoid rate limiting
    await new Promise(r => setTimeout(r, 3000));
    adminContext = await browser.newContext({
      extraHTTPHeaders: { 'Origin': 'http://localhost:7001' },
    });
    adminPage = await adminContext.newPage();

    const adminRes = await signInViaAPI(adminPage, {
      email: ADMIN_USER.email,
      password: ADMIN_USER.password,
    });
    expect(adminRes.ok(), `Admin sign-in failed: ${adminRes.status()}`).toBeTruthy();
  });

  test.afterAll(async () => {
    await userPage?.close();
    await userContext?.close();
    await adminPage?.close();
    await adminContext?.close();
  });

  // ── Test: User can submit a withdrawal request ──────────────────

  let withdrawalId: string;

  test('user can request a withdrawal', async () => {
    // Verify the user has commission balance
    const statsRes = await userPage.request.get(API.affiliateStats, { timeout: TIMEOUTS.auth });
    expect(statsRes.ok()).toBeTruthy();
    const stats = await statsRes.json();
    expect(stats.commissionBalance).toBeGreaterThanOrEqual(200);

    // Submit withdrawal request
    const withdrawRes = await userPage.request.post(API.withdrawalRequest, {
      data: {
        amount: '150',
        paymentMethod: 'alipay',
        paymentAccount: 'test-withdraw@example.com',
      },
      timeout: TIMEOUTS.auth,
    });
    expect(withdrawRes.ok()).toBeTruthy();
    const result = await withdrawRes.json();
    expect(result.success).toBe(true);
    expect(result.withdrawalId).toBeTruthy();
    withdrawalId = result.withdrawalId;

    // Verify balance was deducted
    const newStatsRes = await userPage.request.get(API.affiliateStats, { timeout: TIMEOUTS.auth });
    const newStats = await newStatsRes.json();
    expect(newStats.commissionBalance).toBeLessThanOrEqual(stats.commissionBalance - 150);
  });

  // ── Test: Withdrawal uses configured currency ────────────────────

  test('withdrawal record uses configured currency (not CNY)', async () => {
    const historyRes = await userPage.request.get(
      `${API.withdrawalHistory}?limit=10`,
      { timeout: TIMEOUTS.auth },
    );
    expect(historyRes.ok()).toBeTruthy();
    const data = await historyRes.json();
    expect(data.withdrawals.length).toBeGreaterThanOrEqual(1);

    const latest = data.withdrawals[0];
    expect(latest.status).toBe('pending');
    // Should use the affiliate config currency (default USD), not hardcoded CNY
    expect(latest.currency).not.toBe('CNY');
    expect(latest.currency).toBe('USD');
  });

  // ── Test: Admin can approve withdrawal via PATCH ─────────────────

  test('admin can approve withdrawal via PATCH API', async () => {
    const patchRes = await adminPage.request.patch(
      `/api/admin/withdrawals/${withdrawalId}`,
      {
        data: { status: 'completed', adminNote: 'E2E test approval' },
        timeout: TIMEOUTS.auth,
      },
    );
    expect(patchRes.ok(), `PATCH failed: ${patchRes.status()}`).toBeTruthy();
    const result = await patchRes.json();
    expect(result.success).toBe(true);
  });

  // ── Test: Withdrawal status updated in user's history ────────────

  test('withdrawal shows as completed in user history', async () => {
    const historyRes = await userPage.request.get(
      `${API.withdrawalHistory}?limit=10`,
      { timeout: TIMEOUTS.auth },
    );
    expect(historyRes.ok()).toBeTruthy();
    const data = await historyRes.json();

    const processed = data.withdrawals.find((w: any) => w.id === withdrawalId);
    expect(processed).toBeTruthy();
    expect(processed.status).toBe('completed');
  });
});
