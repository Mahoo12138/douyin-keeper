import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PAGES, TIMEOUTS, ADMIN_USER } from '../helpers/constants';
import { signInViaAPI } from '../helpers/auth';

/**
 * Admin Affiliate Management E2E Tests
 *
 * Verifies the admin panel pages for commission and withdrawal management,
 * plus the referral-related columns in the user list.
 * Uses the pre-existing admin account (admin@example.com).
 *
 * Covers:
 * - Admin commissions page loads with table and search filters
 * - Admin withdrawals page loads with table and search filters
 * - Admin sidebar includes commission/withdrawal navigation links
 * - Admin user list has referral column toggle (view filter)
 * - Commission/withdrawal search field dropdown works
 * - Commission/withdrawal status filter works
 */

test.describe('Admin Affiliate Management', () => {
  test.describe.configure({ mode: 'serial' });

  let adminContext: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    adminContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await adminContext.newPage();

    const res = await signInViaAPI(page, {
      email: ADMIN_USER.email,
      password: ADMIN_USER.password,
    });
    expect(res.ok(), `Admin sign-in failed: ${res.status()}`).toBeTruthy();
    await page.close();
  });

  test.afterAll(async () => {
    await adminContext?.close();
  });

  async function adminPage(): Promise<Page> {
    return adminContext.newPage();
  }

  // ── A) Admin Commissions Page ──────────────────────────────────

  test('admin commissions page loads and shows table', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminCommissions, { timeout: TIMEOUTS.navigation });

    await expect(
      page.locator('h1').filter({ hasText: /Commission Records|佣金记录/ })
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    const contentLocator = page.locator('table, :text-matches("No commission|暂无佣金|commission records")');
    await expect(contentLocator.first()).toBeVisible({ timeout: TIMEOUTS.navigation });

    await page.close();
  });

  test('admin commissions page has search field dropdown', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminCommissions, { timeout: TIMEOUTS.navigation });

    await expect(
      page.locator('h1').filter({ hasText: /Commission Records|佣金记录/ })
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    const searchFieldDropdown = page.locator('[role="combobox"]').first();
    await expect(searchFieldDropdown).toBeVisible({ timeout: TIMEOUTS.navigation });

    const searchInput = page.locator('input[type="text"], input[placeholder]').first();
    await expect(searchInput).toBeVisible({ timeout: TIMEOUTS.navigation });

    await page.close();
  });

  test('admin commissions page search works without error', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminCommissions, { timeout: TIMEOUTS.navigation });

    const searchInput = page.locator('input[type="text"], input[placeholder]').first();
    await expect(searchInput).toBeVisible({ timeout: TIMEOUTS.navigation });

    await searchInput.fill('admin');
    await page.waitForTimeout(1000);

    await expect(
      page.locator('h1').filter({ hasText: /Commission Records|佣金记录/ })
    ).toBeVisible();

    await page.close();
  });

  test('admin commissions page has status filter', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminCommissions, { timeout: TIMEOUTS.navigation });

    await expect(
      page.locator('h1').filter({ hasText: /Commission Records|佣金记录/ })
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    const comboboxes = page.locator('[role="combobox"]');
    const count = await comboboxes.count();
    expect(count).toBeGreaterThanOrEqual(2);

    await page.close();
  });

  // ── B) Admin Withdrawals Page ──────────────────────────────────

  test('admin withdrawals page loads and shows table', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminWithdrawals, { timeout: TIMEOUTS.navigation });

    await expect(
      page.locator('h1').filter({ hasText: /Withdrawal Requests|提现管理/ })
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    const contentLocator = page.locator('table, :text-matches("No withdrawal|暂无提现|withdrawal requests")');
    await expect(contentLocator.first()).toBeVisible({ timeout: TIMEOUTS.navigation });

    await page.close();
  });

  test('admin withdrawals page has search field dropdown', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminWithdrawals, { timeout: TIMEOUTS.navigation });

    await expect(
      page.locator('h1').filter({ hasText: /Withdrawal Requests|提现管理/ })
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    const searchFieldDropdown = page.locator('[role="combobox"]').first();
    await expect(searchFieldDropdown).toBeVisible({ timeout: TIMEOUTS.navigation });

    const searchInput = page.locator('input[type="text"], input[placeholder]').first();
    await expect(searchInput).toBeVisible({ timeout: TIMEOUTS.navigation });

    await page.close();
  });

  test('admin withdrawals page search works without error', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminWithdrawals, { timeout: TIMEOUTS.navigation });

    const searchInput = page.locator('input[type="text"], input[placeholder]').first();
    await expect(searchInput).toBeVisible({ timeout: TIMEOUTS.navigation });

    await searchInput.fill('admin');
    await page.waitForTimeout(1000);

    await expect(
      page.locator('h1').filter({ hasText: /Withdrawal Requests|提现管理/ })
    ).toBeVisible();

    await page.close();
  });

  test('admin withdrawals page has status filter', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminWithdrawals, { timeout: TIMEOUTS.navigation });

    await expect(
      page.locator('h1').filter({ hasText: /Withdrawal Requests|提现管理/ })
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    const comboboxes = page.locator('[role="combobox"]');
    const count = await comboboxes.count();
    expect(count).toBeGreaterThanOrEqual(2);

    await page.close();
  });

  // ── C) Admin Sidebar Navigation ────────────────────────────────

  test('admin sidebar contains commissions and withdrawals links', async () => {
    const page = await adminPage();
    await page.goto(PAGES.admin, { timeout: TIMEOUTS.navigation });

    await page.waitForSelector('aside, [data-slot="sidebar"]', {
      timeout: TIMEOUTS.navigation,
    });

    const commissionsLink = page.locator('aside, [data-slot="sidebar"]').locator(
      'text=/Commissions|佣金/'
    );
    await expect(commissionsLink.first()).toBeVisible({ timeout: TIMEOUTS.navigation });

    const withdrawalsLink = page.locator('aside, [data-slot="sidebar"]').locator(
      'text=/Withdrawals|提现/'
    );
    await expect(withdrawalsLink.first()).toBeVisible({ timeout: TIMEOUTS.navigation });

    await page.close();
  });

  // ── D) Admin Users Page — Referral Column Toggle ───────────────
  // Note: Nuxt's user list uses a different DataTable without view toggle.
  // These tests only verify on frameworks that have the column toggle feature.

  test('admin users page has referral columns in view toggle', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminUsers, { timeout: TIMEOUTS.navigation });

    await page.waitForSelector('table', { timeout: TIMEOUTS.navigation });

    const viewButton = page.locator('button').filter({ hasText: /View|视图/ });
    const viewButtonVisible = await viewButton.isVisible().catch(() => false);
    if (!viewButtonVisible) {
      test.skip(true, 'View toggle not present on this framework (Nuxt)');
      await page.close();
      return;
    }

    // Click and wait for dropdown to open — use retries for Reka UI timing issues
    for (let attempt = 0; attempt < 3; attempt++) {
      await viewButton.click();
      const dropdownOpened = await page.locator('text=/Referral Code|推荐码/').first()
        .isVisible({ timeout: 3000 }).catch(() => false);
      if (dropdownOpened) break;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    await expect(
      page.locator('text=/Referral Code|推荐码/').first()
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('text=/Referred By|邀请人/').first()
    ).toBeVisible({ timeout: 2000 });
    await expect(
      page.locator('text=/Commission Balance|佣金余额/').first()
    ).toBeVisible({ timeout: 2000 });

    await page.close();
  });

  test('admin users page can toggle referral columns visible', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminUsers, { timeout: TIMEOUTS.navigation });

    await page.waitForSelector('table', { timeout: TIMEOUTS.navigation });

    const viewButton = page.locator('button').filter({ hasText: /View|视图/ });
    const viewButtonVisible = await viewButton.isVisible().catch(() => false);
    if (!viewButtonVisible) {
      test.skip(true, 'View toggle not present on this framework');
      await page.close();
      return;
    }

    // Open dropdown with retries for Reka UI timing
    for (let attempt = 0; attempt < 3; attempt++) {
      await viewButton.click();
      const opened = await page.locator('text=/Referral Code|推荐码/').first()
        .isVisible({ timeout: 3000 }).catch(() => false);
      if (opened) break;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Click on the Referral Code toggle item
    const referralCodeItem = page.locator('text=/Referral Code|推荐码/').first();
    await expect(referralCodeItem).toBeVisible({ timeout: 5000 });
    await referralCodeItem.click();
    await page.waitForTimeout(300);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const headerCells = page.locator('th, [role="columnheader"]');
    const allHeaders = await headerCells.allTextContents();
    const hasReferralHeader = allHeaders.some(h =>
      /Referral Code|推荐码/.test(h)
    );
    expect(hasReferralHeader).toBeTruthy();

    await page.close();
  });

  // ── E) Admin Users API — Referral Info ─────────────────────────

  test('admin users API returns referredBy user info', async () => {
    const page = await adminPage();

    const res = await page.request.get('/api/admin/users?limit=50', {
      timeout: TIMEOUTS.auth,
    });
    expect(res.ok(), `GET /api/admin/users failed: ${res.status()}`).toBeTruthy();

    const data = await res.json();
    expect(data.users).toBeTruthy();
    expect(data.users.length).toBeGreaterThan(0);

    const referredUsers = data.users.filter((u: any) => u.referredByCode);
    if (referredUsers.length > 0) {
      const firstReferred = referredUsers[0];
      expect(firstReferred.referredBy).toBeTruthy();
      expect(firstReferred.referredBy.email).toBeTruthy();
    }

    await page.close();
  });
});
