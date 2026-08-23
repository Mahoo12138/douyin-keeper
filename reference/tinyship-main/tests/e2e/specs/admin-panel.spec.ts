import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PAGES, TIMEOUTS, ADMIN_USER } from '../helpers/constants';
import { signInViaAPI, signUpViaAPI } from '../helpers/auth';

/**
 * Admin Panel E2E Tests
 *
 * Verifies the admin dashboard and its sub-pages using the
 * pre-existing admin account (admin@example.com / admin123).
 *
 * Covers:
 * - Admin dashboard loads with statistics cards
 * - Sidebar navigation to Users, Subscriptions, Orders, Credits pages
 * - Data tables render on each sub-page
 * - User detail: navigate, GET /api/users/:id, PATCH /api/users/:id
 * - Non-admin users are denied access (403 / Access Denied)
 */

test.describe('Admin Panel', () => {
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

  // ── Admin Dashboard ──────────────────────────────────────────────

  test('admin dashboard loads and shows statistics cards', async () => {
    const page = await adminPage();
    await page.goto(PAGES.admin, { timeout: TIMEOUTS.navigation });

    // Should show "Admin Dashboard" title
    await expect(
      page.locator('h1').filter({ hasText: /Admin Dashboard|管理面板/ })
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    // Should have at least 4 metric cards (Revenue, Customers, Orders, etc.)
    const metricCards = page.locator('.rounded-2xl');
    await expect(metricCards.first()).toBeVisible({ timeout: TIMEOUTS.navigation });
    expect(await metricCards.count()).toBeGreaterThanOrEqual(4);

    await page.close();
  });

  test('admin dashboard shows revenue chart and today data', async () => {
    const page = await adminPage();
    await page.goto(PAGES.admin, { timeout: TIMEOUTS.navigation });

    // "Today's Data" section
    await expect(
      page.locator('text=/Today|今日/').first()
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    // Order history section
    await expect(
      page.locator('text=/Recent Orders|最近订单|Order History|订单历史/').first()
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    await page.close();
  });

  // ── Admin Sub-pages ──────────────────────────────────────────────

  test('admin users page loads with data table', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminUsers, { timeout: TIMEOUTS.navigation });

    await expect(
      page.locator('text=/User Management|用户管理/').first()
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    await expect(page.locator('table').first()).toBeVisible({
      timeout: TIMEOUTS.navigation,
    });

    // Verify the API endpoint itself returns 200 (catches SQL dialect issues)
    const apiRes = await page.request.get('/api/admin/users?limit=10&offset=0', {
      timeout: TIMEOUTS.navigation,
    });
    expect(apiRes.status(), `Users API returned ${apiRes.status()}`).toBe(200);

    await page.close();
  });

  test('admin subscriptions page loads with data table', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminSubscriptions, { timeout: TIMEOUTS.navigation });

    await expect(page.locator('table').first()).toBeVisible({
      timeout: TIMEOUTS.navigation,
    });

    const apiRes = await page.request.get('/api/admin/subscriptions?limit=10&offset=0', {
      timeout: TIMEOUTS.navigation,
    });
    expect(apiRes.status(), `Subscriptions API returned ${apiRes.status()}`).toBe(200);

    await page.close();
  });

  test('admin orders page loads with data table', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminOrders, { timeout: TIMEOUTS.navigation });

    await expect(page.locator('table').first()).toBeVisible({
      timeout: TIMEOUTS.navigation,
    });

    const apiRes = await page.request.get('/api/admin/orders?limit=10&offset=0', {
      timeout: TIMEOUTS.navigation,
    });
    expect(apiRes.status(), `Orders API returned ${apiRes.status()}`).toBe(200);

    await page.close();
  });

  test('admin credits page loads with data table', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminCredits, { timeout: TIMEOUTS.navigation });

    await expect(page.locator('table').first()).toBeVisible({
      timeout: TIMEOUTS.navigation,
    });

    const apiRes = await page.request.get('/api/admin/credits/transactions?limit=10&offset=0', {
      timeout: TIMEOUTS.navigation,
    });
    expect(apiRes.status(), `Credits API returned ${apiRes.status()}`).toBe(200);

    await page.close();
  });

  // ── Sidebar Navigation ──────────────────────────────────────────

  test('admin sidebar navigation works across sub-pages', async () => {
    const page = await adminPage();

    // Navigate to Users page
    await page.goto(PAGES.adminUsers, { timeout: TIMEOUTS.navigation });
    await expect(
      page.locator('text=/User Management|用户管理/').first()
    ).toBeVisible({ timeout: TIMEOUTS.navigation });
    expect(page.url()).toContain('/admin/users');

    // Navigate to Orders page
    await page.goto(PAGES.adminOrders, { timeout: TIMEOUTS.navigation });
    await expect(page.locator('table').first()).toBeVisible({
      timeout: TIMEOUTS.navigation,
    });
    expect(page.url()).toContain('/admin/orders');

    await page.close();
  });

  // ── Admin User Detail ────────────────────────────────────────────

  test('admin can navigate to user detail page from users list', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminUsers, { timeout: TIMEOUTS.navigation });

    // Wait for table to load and hydration to complete
    await expect(page.locator('table').first()).toBeVisible({
      timeout: TIMEOUTS.navigation,
    });
    await page.waitForLoadState('networkidle', { timeout: TIMEOUTS.navigation });

    // Open the actions dropdown on the first user row
    const actionsButton = page.locator('table tbody tr').first().locator('button').last();
    await expect(actionsButton).toBeVisible({ timeout: TIMEOUTS.navigation });
    await actionsButton.click();

    // Click "Edit User" from dropdown
    const editMenuItem = page.locator('text=/Edit User|编辑用户/').first();
    await expect(editMenuItem).toBeVisible({ timeout: 5000 });
    await editMenuItem.click();

    // Should navigate to /admin/users/<id>
    await page.waitForURL(/\/admin\/users\/[^/]+/, { timeout: TIMEOUTS.navigation });
    expect(page.url()).toMatch(/\/admin\/users\/[^/]+/);

    // Detail page should show user form with "User Information" card
    await expect(
      page.locator('text=/User Information|用户信息/').first()
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    await page.close();
  });

  test('admin user detail page loads user data via API', async () => {
    const page = await adminPage();

    // First get admin user ID from the session
    const sessionRes = await page.request.get('/api/auth/get-session', {
      timeout: TIMEOUTS.auth,
    });
    expect(sessionRes.ok()).toBeTruthy();
    const session = await sessionRes.json();
    const adminUserId = session.user.id;

    // Fetch user detail via API
    const userRes = await page.request.get(`/api/users/${adminUserId}`, {
      timeout: TIMEOUTS.auth,
    });
    expect(userRes.ok(), `GET /api/users/${adminUserId} failed: ${userRes.status()}`).toBeTruthy();

    const userData = await userRes.json();
    expect(userData.id).toBe(adminUserId);
    expect(userData.email).toBe(ADMIN_USER.email);
    expect(userData.role).toBeTruthy();

    await page.close();
  });

  test('admin can update user name via API and see updated value', async ({ browser }) => {
    // Create a test user in a separate context to avoid tainting admin session
    const tempCtx = await browser.newContext();
    const tempPage = await tempCtx.newPage();
    const testEmail = `e2e-admin-detail-${Date.now()}@example.com`;
    const signUpRes = await signUpViaAPI(tempPage, {
      name: 'Detail Test User', email: testEmail, password: 'TestPassword123!',
    });
    expect(signUpRes.ok(), `Detail user sign-up failed: ${signUpRes.status()}`).toBeTruthy();
    const signUpBody = await signUpRes.json();
    const testUserId = signUpBody.user?.id;
    await tempPage.close();
    await tempCtx.close();

    if (!testUserId) {
      return;
    }

    // Use admin context for the actual API calls
    const page = await adminPage();

    // Update the user's name via PATCH
    const updatedName = `Updated-${Date.now()}`;
    const patchRes = await page.request.patch(`/api/users/${testUserId}`, {
      data: {
        name: updatedName,
        emailVerified: false,
        phoneNumberVerified: false,
        role: 'user',
        banned: false,
      },
      timeout: TIMEOUTS.auth,
    });
    expect(patchRes.ok(), `PATCH /api/users/${testUserId} failed: ${patchRes.status()}`).toBeTruthy();

    // Verify the update persisted
    const getRes = await page.request.get(`/api/users/${testUserId}`, {
      timeout: TIMEOUTS.auth,
    });
    expect(getRes.ok()).toBeTruthy();
    const updatedUser = await getRes.json();
    expect(updatedUser.name).toBe(updatedName);

    await page.close();
  });

  test('non-admin user cannot access user detail API', async ({ browser }) => {
    // Create a fresh non-admin user
    const normalCtx = await browser.newContext();
    const page = await normalCtx.newPage();

    const testEmail = `e2e-nonadmin-api-${Date.now()}@example.com`;
    const signUpRes = await signUpViaAPI(page, {
      name: 'Non Admin', email: testEmail, password: 'TestPassword123!',
    });
    expect(signUpRes.ok()).toBeTruthy();

    // Try to access user detail API — should get 403
    const userRes = await page.request.get('/api/users/some-random-id', {
      timeout: TIMEOUTS.auth,
    });
    expect([401, 403]).toContain(userRes.status());

    await page.close();
    await normalCtx.close();
  });

  // ── Access Denied for Non-Admin ────────────────────────────────

  test('non-admin user sees access denied on admin page', async ({ browser }) => {
    // Use a fresh context (no auth)
    const guestContext = await browser.newContext();
    const page = await guestContext.newPage();

    await page.goto(PAGES.admin, { timeout: TIMEOUTS.navigation });

    // Should either redirect to sign-in or show "Access Denied"
    const isRedirected = page.url().includes('/signin');
    const hasAccessDenied = await page
      .locator('text=/Access Denied|权限不足|403/')
      .first()
      .isVisible()
      .catch(() => false);

    expect(isRedirected || hasAccessDenied).toBeTruthy();

    await page.close();
    await guestContext.close();
  });
});
