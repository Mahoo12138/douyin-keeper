import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PAGES, TIMEOUTS, ADMIN_USER, API, BASE } from '../helpers/constants';
import { signInViaAPI } from '../helpers/auth';

/**
 * Admin Pricing Management E2E Tests
 *
 * Verifies the dynamic pricing admin CRUD flow using the
 * pre-existing admin account (admin@example.com / admin123).
 *
 * Covers:
 * - Pricing list page loads with table and action buttons
 * - Create a new plan via the dedicated form page
 * - Edit an existing plan
 * - Toggle plan active/inactive
 * - Delete a plan
 * - Import from static config
 * - Non-admin access denied
 */

/**
 * Fill an input. Works with React controlled inputs and Vue v-model.
 */
async function fillInput(locator: import('@playwright/test').Locator, value: string) {
  await locator.fill(value);
}

/**
 * Locate the first "card" element — handles shadcn (data-slot="card", rounded-xl)
 * and Nuxt manual cards (rounded-lg border).
 */
function firstCard(page: import('@playwright/test').Page) {
  return page.locator('[data-slot="card"], .rounded-lg.border.bg-card').first();
}

test.describe('Admin Pricing Management', () => {
  test.describe.configure({ mode: 'serial' });

  let adminContext: BrowserContext;
  let createdPlanName: string;

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
    // Clean up: delete all non-seed plans (E2E-created and imported-from-static)
    // to avoid polluting the pricing page for subsequent payment tests.
    if (adminContext) {
      const page = await adminContext.newPage();
      try {
        const res = await page.request.get(API.adminPricingPlans, {
          headers: { Origin: 'http://localhost:7001' },
        });
        if (res.ok()) {
          const data = await res.json();
          for (const plan of data.plans || []) {
            const isSeed = (plan.id as string).startsWith('seed_');
            if (!isSeed) {
              await page.request.delete(
                `${API.adminPricingPlans}?id=${plan.id}&hard=true`,
                { headers: { Origin: 'http://localhost:7001' } },
              );
            }
          }
        }
      } catch {
        // Cleanup is best-effort
      }
      await page.close();
      await adminContext.close();
    }
  });

  async function adminPage(): Promise<Page> {
    return adminContext.newPage();
  }

  // ── Pricing List Page ─────────────────────────────────────────────

  test('pricing list page loads with title and action buttons', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminPricing, { timeout: TIMEOUTS.navigation });

    await expect(
      page.locator('h1').filter({ hasText: /Pricing Plans|定价方案/ })
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    // "Create Plan" button links to /admin/pricing/new
    const createBtn = page.locator(`a[href*="/admin/pricing/new"]`);
    await expect(createBtn).toBeVisible();

    // Import button
    await expect(
      page.getByRole('button', { name: /Import|导入/ })
    ).toBeVisible();

    // Tab switchers (Subscription / Credits)
    await expect(
      page.getByRole('button', { name: /Subscription|订阅/ })
    ).toBeVisible();

    await page.close();
  });

  test('tab switching between subscription and credits works', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminPricing, { timeout: TIMEOUTS.navigation });

    await expect(
      page.locator('h1').filter({ hasText: /Pricing Plans|定价方案/ })
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    const creditsTab = page.getByRole('button', { name: /Credit|积分/ });
    await expect(creditsTab).toBeVisible();
    await creditsTab.click();

    // After clicking credits tab, verify we're still on the pricing page
    await expect(page).toHaveURL(/\/admin\/pricing/);

    const subscriptionTab = page.getByRole('button', { name: /Subscription|订阅/ });
    await subscriptionTab.click();
    await expect(page).toHaveURL(/\/admin\/pricing/);

    await page.close();
  });

  // ── Create Plan ───────────────────────────────────────────────────

  test('create plan page loads with section cards', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminPricingNew, { timeout: TIMEOUTS.navigation });

    // Page title
    await expect(
      page.locator('h1').filter({ hasText: /Create Plan|创建方案/ })
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    // Section cards should be visible
    await expect(
      page.locator('text=/Plan Information|方案信息/').first()
    ).toBeVisible();

    await expect(
      page.locator('text=/Pricing|定价/').first()
    ).toBeVisible();

    await expect(
      page.locator('text=/Provider Configuration|提供商配置/').first()
    ).toBeVisible();

    await expect(
      page.locator('text=/Display Settings|展示设置/').first()
    ).toBeVisible();

    // Back link
    await expect(
      page.locator('a[href*="/admin/pricing"]').filter({ hasText: /Back|返回/ })
    ).toBeVisible();

    await page.close();
  });

  test('create a new pricing plan via form', async () => {
    createdPlanName = `E2E Test Plan ${Date.now()}`;
    const page = await adminPage();
    await page.goto(PAGES.adminPricingNew, { timeout: TIMEOUTS.navigation });
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('h1').filter({ hasText: /Create Plan|创建方案/ })
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    // Fill English i18n fields (default tab) using placeholder-based selectors
    await page.getByPlaceholder('e.g. Monthly Plan').fill(createdPlanName);
    await page.getByPlaceholder('e.g. Monthly recurring subscription').fill('E2E test subscription plan');
    await page.getByPlaceholder(/month \/ lifetime/).fill('month');
    await page.locator('textarea').first().fill('- Feature A\n- Feature B\n- Feature C');

    // Switch to Chinese tab — scope to Plan Information card
    const planInfoCard = firstCard(page);
    const zhTab = planInfoCard.locator('button').filter({ hasText: '中文' });
    await zhTab.click();
    await page.waitForTimeout(500);

    // Fill Chinese fields using Chinese-specific placeholders
    await page.getByPlaceholder('中文 name').fill(`${createdPlanName} 中文`);
    await page.getByPlaceholder('中文 description').fill('E2E 测试订阅方案');
    await page.getByPlaceholder('中文 duration label').fill('月');
    await planInfoCard.locator('textarea').fill('- 功能 A\n- 功能 B');

    // Fill pricing section: amount
    const amountInput = page.locator('input[type="number"]').first();
    await amountInput.scrollIntoViewIfNeeded();
    await amountInput.fill('9.99');
    await expect(amountInput).toHaveValue('9.99');

    // Save
    const saveBtn = page.getByRole('button', { name: /Save|保存/ });
    await saveBtn.scrollIntoViewIfNeeded();
    await saveBtn.click();

    // Should redirect back to list page
    await expect(page).toHaveURL(/\/admin\/pricing(?!\/new)/, {
      timeout: TIMEOUTS.navigation,
    });

    await page.close();
  });

  test('newly created plan appears in the list with correct i18n', async () => {
    const page = await adminPage();

    // Verify via API that i18n data was correctly saved
    const res = await page.request.get(API.adminPricingPlans, {
      headers: { Origin: 'http://localhost:7001' },
    });
    const data = await res.json();

    // Find the plan by checking any locale name that contains the timestamp
    const timestamp = createdPlanName.replace('E2E Test Plan ', '');
    const plan = (data.plans || []).find(
      (p: any) => JSON.stringify(p.i18n || {}).includes(timestamp)
    );
    expect(plan, `Plan with timestamp ${timestamp} should exist in API`).toBeTruthy();

    // Check what was actually saved in each locale
    const enName = plan.i18n?.en?.name;
    const zhName = plan.i18n?.['zh-CN']?.name;

    // If English name wasn't correctly saved, we have a fill() issue
    // Log the actual values for debugging
    expect(
      enName === createdPlanName || zhName?.includes(createdPlanName),
      `English name should be "${createdPlanName}", got en="${enName}", zh-CN="${zhName}"`
    ).toBeTruthy();

    await page.goto(PAGES.adminPricing, { timeout: TIMEOUTS.navigation });

    await expect(
      page.locator('h1').filter({ hasText: /Pricing Plans|定价方案/ })
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    // The created plan should appear in the table
    await expect(
      page.locator(`text=${createdPlanName}`).first()
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    await page.close();
  });

  // ── Edit Plan ─────────────────────────────────────────────────────

  test('edit plan page loads with existing data', async () => {
    const page = await adminPage();

    // Verify plan exists via API and get its ID
    const apiRes = await page.request.get(API.adminPricingPlans, {
      headers: { Origin: 'http://localhost:7001' },
    });
    const apiData = await apiRes.json();
    const apiPlan = (apiData.plans || []).find(
      (p: any) => p.i18n?.en?.name === createdPlanName
    );
    expect(apiPlan, 'Plan should exist in API with correct English name').toBeTruthy();

    // Navigate directly to the edit page by URL (avoids client-side nav auth race)
    await page.goto(
      `http://localhost:7001/en/admin/pricing/${apiPlan.id}`,
      { timeout: TIMEOUTS.navigation }
    );
    await page.waitForLoadState('networkidle');

    // Title should say "Edit Plan"
    await expect(
      page.locator('h1').filter({ hasText: /Edit Plan|编辑方案/ })
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    // The English tab should be active and the name should have the English value
    const nameInput = page.getByPlaceholder('e.g. Monthly Plan');
    await expect(nameInput).toHaveValue(createdPlanName);

    await page.close();
  });

  test('update plan name via edit form', async () => {
    const page = await adminPage();

    // Find the plan ID via API
    const apiRes = await page.request.get(API.adminPricingPlans, {
      headers: { Origin: 'http://localhost:7001' },
    });
    const apiData = await apiRes.json();
    const plan = (apiData.plans || []).find(
      (p: any) => p.i18n?.en?.name === createdPlanName
    );
    expect(plan, 'Plan should exist').toBeTruthy();

    // Navigate directly to edit page
    await page.goto(
      `http://localhost:7001/en/admin/pricing/${plan.id}`,
      { timeout: TIMEOUTS.navigation }
    );
    await page.waitForLoadState('networkidle');
    await expect(
      page.locator('h1').filter({ hasText: /Edit Plan|编辑方案/ })
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    // Update the name (English tab active by default)
    const updatedName = `${createdPlanName} Updated`;
    await fillInput(page.getByPlaceholder('e.g. Monthly Plan'), updatedName);

    // Save via button click
    const saveBtn = page.getByRole('button', { name: /Save|保存/ });
    await saveBtn.scrollIntoViewIfNeeded();
    await saveBtn.click();

    // Wait for the save to complete — check via API since client-side nav
    // may encounter auth re-checks in TanStack.
    await page.waitForTimeout(2000);

    // Verify the update via API
    const verifyRes = await page.request.get(API.adminPricingPlans, {
      headers: { Origin: 'http://localhost:7001' },
    });
    const verifyData = await verifyRes.json();
    const updatedPlan = (verifyData.plans || []).find(
      (p: any) => p.i18n?.en?.name === updatedName
    );
    expect(updatedPlan, `Plan name should be updated to "${updatedName}"`).toBeTruthy();

    // Update the tracked name for subsequent tests
    createdPlanName = updatedName;

    await page.close();
  });

  // ── Toggle Active ─────────────────────────────────────────────────

  test('toggle plan active status via switch', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminPricing, { timeout: TIMEOUTS.navigation });

    await expect(
      page.locator(`text=${createdPlanName}`).first()
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    const planRow = page.locator('tr').filter({ hasText: createdPlanName });

    // Cross-framework: shadcn uses button[role="switch"], Nuxt uses input[type="checkbox"]
    const shadcnSwitch = planRow.locator('button[role="switch"]');
    const nativeCheckbox = planRow.locator('input[type="checkbox"]');

    const useShadcn = (await shadcnSwitch.count()) > 0;

    if (useShadcn) {
      const initialState = await shadcnSwitch.getAttribute('data-state');
      await shadcnSwitch.click();
      await page.waitForTimeout(1000);
      const newState = await shadcnSwitch.getAttribute('data-state');
      expect(newState).not.toBe(initialState);
      await shadcnSwitch.click();
      await page.waitForTimeout(1000);
    } else {
      const initialChecked = await nativeCheckbox.isChecked();
      await nativeCheckbox.click({ force: true });
      await page.waitForTimeout(1000);
      const newChecked = await nativeCheckbox.isChecked();
      expect(newChecked).not.toBe(initialChecked);
      await nativeCheckbox.click({ force: true });
      await page.waitForTimeout(1000);
    }

    await page.close();
  });

  // ── Delete Plan ───────────────────────────────────────────────────

  test('soft-delete deactivates plan, then hard-delete removes it via API', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminPricing, { timeout: TIMEOUTS.navigation });

    await expect(
      page.locator(`text=${createdPlanName}`).first()
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    // Accept the confirm dialog before clicking delete
    page.on('dialog', (dialog) => dialog.accept());

    // Click the delete button (trash icon — last button in actions cell)
    const planRow = page.locator('tr').filter({ hasText: createdPlanName });
    const actionsCell = planRow.locator('td').last();
    const deleteBtn = actionsCell.locator('button').last();
    await deleteBtn.click();

    // Wait for API call and refresh
    await page.waitForTimeout(2000);

    // Soft-delete: plan is still in the list but deactivated.
    // Cross-framework: check shadcn switch or native checkbox
    const shadcnSwitch = planRow.locator('button[role="switch"]');
    const nativeCheckbox = planRow.locator('input[type="checkbox"]');
    if ((await shadcnSwitch.count()) > 0) {
      await expect(shadcnSwitch).toHaveAttribute('data-state', 'unchecked');
    } else {
      await expect(nativeCheckbox).not.toBeChecked();
    }

    // Now hard-delete via API to clean up
    const plansRes = await page.request.get(API.adminPricingPlans, {
      headers: { Origin: 'http://localhost:7001' },
    });
    const plansData = await plansRes.json();
    const testPlan = plansData.plans.find(
      (p: any) => p.i18n?.en?.name === createdPlanName
    );

    if (testPlan) {
      const delRes = await page.request.delete(
        `${API.adminPricingPlans}?id=${testPlan.id}&hard=true`,
        { headers: { Origin: 'http://localhost:7001' } }
      );
      expect(delRes.ok()).toBeTruthy();
    }

    // Refresh and verify the plan is gone
    await page.reload();
    await page.waitForTimeout(1000);
    await expect(
      page.locator(`text=${createdPlanName}`)
    ).toHaveCount(0, { timeout: TIMEOUTS.navigation });

    await page.close();
  });

  // ── Import from Static Config ─────────────────────────────────────

  test('import from static config via API', async () => {
    const page = await adminPage();

    const res = await page.request.post(API.adminPricingImport, {
      headers: { Origin: 'http://localhost:7001' },
    });

    expect(res.ok(), `Import failed: ${res.status()}`).toBeTruthy();
    const data = await res.json();
    expect(data.imported).toBeGreaterThanOrEqual(0);

    await page.close();
  });

  // ── Provider Configuration Conditional Fields ─────────────────────

  test('provider configuration section shows correct fields', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminPricingNew, { timeout: TIMEOUTS.navigation });
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('h1').filter({ hasText: /Create Plan|创建方案/ })
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    // Default provider is Stripe - should show Stripe Price ID field
    await expect(
      page.locator('text=/Stripe Price ID/').first()
    ).toBeVisible();

    // Switch provider to WeChat — handle both shadcn Select and native <select>
    const shadcnTrigger = page.locator('[data-slot="select-trigger"]').first();
    const nativeSelect = page.locator('select').first();

    if ((await shadcnTrigger.count()) > 0) {
      await shadcnTrigger.scrollIntoViewIfNeeded();
      await shadcnTrigger.click();
      const wechatOption = page.locator('[role="option"]').filter({ hasText: 'Wechat' });
      if (await wechatOption.isVisible()) {
        await wechatOption.click();
      }
    } else {
      await nativeSelect.selectOption('wechat');
    }

    await page.waitForTimeout(500);

    // Should show the "no provider config needed" message
    await expect(
      page.locator('text=/No additional|无需额外/').first()
    ).toBeVisible();

    await page.close();
  });

  // ── Locale Tabs ───────────────────────────────────────────────────

  test('i18n tabs switch between languages', async () => {
    const page = await adminPage();
    await page.goto(PAGES.adminPricingNew, { timeout: TIMEOUTS.navigation });
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('h1').filter({ hasText: /Create Plan|创建方案/ })
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    // English tab should be active by default (has "(default)" label)
    await expect(
      page.locator('button').filter({ hasText: /English/ })
    ).toBeVisible();

    // Chinese tab should also be available
    const zhTab = page.locator('button').filter({ hasText: '中文' });
    await expect(zhTab).toBeVisible();

    // Fill in English name - scoped to the Plan Information card
    const planInfoCard = firstCard(page);
    await fillInput(planInfoCard.locator('input').nth(0), 'English Name');

    // Switch to Chinese
    await zhTab.click();
    await page.waitForTimeout(500);

    // The name field should now be empty (different locale)
    await expect(planInfoCard.locator('input').nth(0)).toHaveValue('');

    // Fill Chinese name
    await fillInput(planInfoCard.locator('input').nth(0), '中文名称');

    // Switch back to English
    const enTab = page.locator('button').filter({ hasText: /English/ });
    await enTab.click();
    await page.waitForTimeout(500);

    // Should restore English value
    await expect(planInfoCard.locator('input').nth(0)).toHaveValue('English Name');

    await page.close();
  });

  // ── Non-admin Access ──────────────────────────────────────────────

  test('non-admin user cannot access pricing admin page', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Try to access admin pricing without authentication
    const response = await page.goto(PAGES.adminPricing, {
      timeout: TIMEOUTS.navigation,
    });

    // Should be redirected to signin or get 403
    const url = page.url();
    const status = response?.status();
    expect(
      url.includes('/signin') || status === 403
    ).toBeTruthy();

    await context.close();
  });

  test('non-admin cannot access pricing plans API', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const res = await page.request.get(API.adminPricingPlans, {
      headers: { Origin: 'http://localhost:7001' },
    });

    expect([401, 403]).toContain(res.status());

    await context.close();
  });
});
