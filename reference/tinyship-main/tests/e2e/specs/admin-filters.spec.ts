import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PAGES, TIMEOUTS, ADMIN_USER } from '../helpers/constants';
import { signInViaAPI } from '../helpers/auth';

/**
 * Admin Sub-page Filter E2E Tests
 *
 * Verifies search and filter controls on each admin sub-page:
 * - Users: role filter, banned filter, clear
 * - Subscriptions: status filter, payment type / provider filter
 * - Orders: status filter, provider filter
 * - Credits: type filter
 *
 * Text search is tested via URL navigation (query params -> verify page state)
 * because Vue's useVModel reactive propagation has timing issues with Playwright's fill().
 * Dropdown filters are tested via Radix/Reka combobox interaction.
 *
 * Uses the pre-existing admin account (admin@example.com).
 */

test.describe('Admin Sub-page Filters', () => {
  test.describe.configure({ mode: 'serial' });

  let adminContext: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    adminContext = await browser.newContext();
    page = await adminContext.newPage();
    const res = await signInViaAPI(page, {
      email: ADMIN_USER.email,
      password: ADMIN_USER.password,
    });
    expect(res.ok(), `Admin sign-in failed: ${res.status()}`).toBeTruthy();
  });

  test.afterAll(async () => {
    await page?.close();
    await adminContext?.close();
  });

  /**
   * Select a value from a Radix/Reka combobox by finding the trigger
   * via its displayed text, then picking the desired option.
   * Uses retries because Reka UI may need the trigger opened twice.
   */
  async function pickFromCombobox(
    triggerText: string | RegExp,
    optionText: string | RegExp,
  ) {
    const trigger = page
      .locator('[data-slot="select-trigger"]')
      .filter({ hasText: triggerText });
    await trigger.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });

    const option = page.getByRole('option', { name: optionText });
    for (let attempt = 0; attempt < 3; attempt++) {
      await trigger.click();
      try {
        await option.waitFor({ state: 'visible', timeout: 3_000 });
        break;
      } catch {
        // Dismiss the open dropdown before retrying, otherwise
        // the Radix/Reka overlay blocks subsequent clicks.
        await page.keyboard.press('Escape');
        if (attempt === 2) throw new Error(`Failed to open combobox "${triggerText}" after 3 attempts`);
      }
    }
    await option.click();
  }

  /**
   * Navigate to an admin sub-page, wait for the data table to appear,
   * and wait for network idle to ensure SSR hydration is complete
   * (Vue event handlers need hydration before they respond to clicks).
   */
  async function goToPage(url: string) {
    await page.goto(url, { timeout: TIMEOUTS.navigation });
    await page.locator('table').first().waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
    await page.waitForLoadState('networkidle', { timeout: TIMEOUTS.navigation });
  }

  /**
   * Click the clear/reset button inside the filter form.
   * The clear button is the second non-combobox button in the form
   * (the first is the search/submit button).
   */
  async function clickClearButton() {
    const clearBtn = page.locator('form button:not([role="combobox"])').nth(1);
    await clearBtn.click();
  }

  // ── A) Users page ──────────────────────────────────────────────────

  test.describe('Users page filters', () => {
    test('search by email via URL reflects in page state', async () => {
      await goToPage(`${PAGES.adminUsers}?searchField=email&searchValue=admin&page=1`);

      const input = page.getByRole('textbox', { name: /Search/i });
      await expect(input).toHaveValue('admin');
    });

    test('filter by role updates URL', async () => {
      await goToPage(PAGES.adminUsers);

      await pickFromCombobox(/All Roles|Filter by role/i, 'Admin');
      await page.waitForURL(/role=admin/, { timeout: TIMEOUTS.navigation });

      expect(page.url()).toContain('role=admin');
    });

    test('filter by banned status updates URL', async () => {
      await goToPage(PAGES.adminUsers);

      await pickFromCombobox(/All users|Ban status|封禁/i, /Banned|封禁/);
      await page.waitForURL(/banned=true/, { timeout: TIMEOUTS.navigation });

      expect(page.url()).toContain('banned=true');
    });

    test('clear button resets all filters', async () => {
      await goToPage(`${PAGES.adminUsers}?searchField=name&searchValue=test&role=admin&banned=true`);

      await clickClearButton();

      await page.waitForURL(
        (url) => !url.search.includes('role=') && !url.search.includes('banned='),
        { timeout: TIMEOUTS.navigation },
      );

      const url = page.url();
      expect(url).not.toContain('searchValue=');
      expect(url).not.toContain('role=');
      expect(url).not.toContain('banned=');
    });
  });

  // ── B) Subscriptions page ─────────────────────────────────────────

  test.describe('Subscriptions page filters', () => {
    test('search via URL reflects in page state', async () => {
      await goToPage(`${PAGES.adminSubscriptions}?searchField=userEmail&searchValue=test&page=1`);

      const input = page.getByRole('textbox', { name: /Search/i });
      await expect(input).toBeVisible({ timeout: TIMEOUTS.navigation });
      await expect(input).toHaveValue('test', { timeout: TIMEOUTS.navigation });
    });

    test('filter by status updates URL', async () => {
      await goToPage(PAGES.adminSubscriptions);

      await pickFromCombobox(/All Status|Filter by status|状态/i, /Active|活跃/);
      await page.waitForURL(/status=active/, { timeout: TIMEOUTS.navigation });

      expect(page.url()).toContain('status=active');
    });

    test('third filter (paymentType or provider) updates URL', async () => {
      await goToPage(PAGES.adminSubscriptions);

      // Next.js has a "Payment Type" filter (trigger text: "All Types"),
      // Nuxt has a "Provider" filter (trigger text: "All Providers").
      const allTriggers = page.getByRole('combobox');
      const count = await allTriggers.count();

      let foundPaymentType = false;
      for (let i = 0; i < count; i++) {
        const text = await allTriggers.nth(i).textContent();
        if (text && /All Types|Payment Type|All Payment|支付类型/i.test(text)) {
          foundPaymentType = true;
          break;
        }
      }

      if (foundPaymentType) {
        await pickFromCombobox(/All Types|Payment Type|支付类型/i, /Recurring|循环/i);
        await page.waitForURL(/paymentType=recurring/, { timeout: TIMEOUTS.navigation });
        expect(page.url()).toContain('paymentType=recurring');
      } else {
        await pickFromCombobox(/All Providers|Provider|提供商/i, /Stripe/i);
        await page.waitForURL(/provider=stripe/, { timeout: TIMEOUTS.navigation });
        expect(page.url()).toContain('provider=stripe');
      }
    });
  });

  // ── C) Orders page ────────────────────────────────────────────────

  test.describe('Orders page filters', () => {
    test('filter by status updates URL', async () => {
      await goToPage(PAGES.adminOrders);

      await pickFromCombobox(/All Status|Filter by status|状态/i, /Paid|已支付/);
      await page.waitForURL(/status=paid/, { timeout: TIMEOUTS.navigation });

      expect(page.url()).toContain('status=paid');
    });

    test('filter by provider updates URL', async () => {
      await goToPage(PAGES.adminOrders);

      await pickFromCombobox(/Provider|All Provider|提供商/i, /Stripe/i);
      await page.waitForURL(/provider=stripe/, { timeout: TIMEOUTS.navigation });

      expect(page.url()).toContain('provider=stripe');
    });

    test('combined filters all appear in URL', async () => {
      await goToPage(PAGES.adminOrders);

      await pickFromCombobox(/All Status|Filter by status|状态/i, /Paid|已支付/);
      await page.waitForURL(/status=paid/, { timeout: TIMEOUTS.navigation });

      await pickFromCombobox(/Provider|All Provider|提供商/i, /Stripe/i);
      await page.waitForURL(/provider=stripe/, { timeout: TIMEOUTS.navigation });

      const url = page.url();
      expect(url).toContain('status=paid');
      expect(url).toContain('provider=stripe');
    });
  });

  // ── D) Credits page ───────────────────────────────────────────────

  test.describe('Credits page filters', () => {
    test('filter by type updates URL', async () => {
      await goToPage(PAGES.adminCredits);

      await pickFromCombobox(/All Types|Filter by type|类型/i, /Purchase|购买/);
      await page.waitForURL(/type=purchase/, { timeout: TIMEOUTS.navigation });

      expect(page.url()).toContain('type=purchase');
    });

    test('search via URL reflects in page state', async () => {
      await goToPage(`${PAGES.adminCredits}?searchField=userEmail&searchValue=admin&page=1`);

      const input = page.getByRole('textbox', { name: /Search/i });
      await expect(input).toHaveValue('admin');
    });

    test('clear button resets filters', async () => {
      await goToPage(`${PAGES.adminCredits}?searchField=userEmail&searchValue=test&type=purchase`);

      await clickClearButton();

      await page.waitForURL(
        (url) => !url.search.includes('type='),
        { timeout: TIMEOUTS.navigation },
      );

      const url = page.url();
      expect(url).not.toContain('searchValue=');
      expect(url).not.toContain('type=');
    });
  });
});
