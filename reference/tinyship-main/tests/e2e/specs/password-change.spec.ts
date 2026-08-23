import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PAGES, TIMEOUTS, uniqueEmail } from '../helpers/constants';
import { signUpViaAPI, signInViaAPI, signOutViaAPI } from '../helpers/auth';

/**
 * Password Change E2E Tests
 *
 * Verifies the password change flow from the dashboard Account tab:
 * - Navigate to Account tab
 * - Open the "Change Password" dialog
 * - Fill current + new + confirm password
 * - Submit and verify success
 * - Sign out and sign back in with the new password
 */

test.describe('Password Change', () => {
  test.describe.configure({ mode: 'serial' });

  let authContext: BrowserContext;
  const originalPassword = 'TestPassword123!';
  const newPassword = 'NewPassword456!';
  const userName = 'Password Test User';
  let userEmail: string;

  test.beforeAll(async ({ browser }) => {
    userEmail = uniqueEmail('e2e-pwchange');
    authContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await authContext.newPage();

    const res = await signUpViaAPI(page, {
      name: userName,
      email: userEmail,
      password: originalPassword,
    });
    expect(res.ok(), `Sign-up failed: ${res.status()}`).toBeTruthy();
    await page.close();
  });

  test.afterAll(async () => {
    await authContext?.close();
  });

  async function authedPage(): Promise<Page> {
    return authContext.newPage();
  }

  test('account tab shows change password section', async () => {
    const page = await authedPage();
    await page.goto(PAGES.dashboard, { timeout: TIMEOUTS.navigation });

    // Click the Account Management sidebar button
    const accountTab = page.locator('button').filter({
      hasText: /Account Management|账户管理/,
    });
    await expect(accountTab.first()).toBeVisible({ timeout: TIMEOUTS.navigation });
    await accountTab.first().click();
    await page.waitForTimeout(500);

    // Verify the "Change Password" section is visible
    await expect(
      page.locator('text=/Change Password|修改密码/').first()
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    // Verify the change password button is visible
    const changePasswordButton = page
      .locator('button')
      .filter({ hasText: /Change Password|修改密码/ });
    await expect(changePasswordButton.first()).toBeVisible();

    await page.close();
  });

  test('can open change password dialog and fill form', async () => {
    const page = await authedPage();
    await page.goto(PAGES.dashboard, { timeout: TIMEOUTS.navigation });

    // Navigate to Account Management tab
    const accountTab = page.locator('button').filter({
      hasText: /Account Management|账户管理/,
    });
    await expect(accountTab.first()).toBeVisible({ timeout: TIMEOUTS.navigation });
    await accountTab.first().click();
    await page.waitForTimeout(500);

    // Click the "Change Password" button to open dialog
    const changePasswordButton = page
      .locator('button')
      .filter({ hasText: /Change Password|修改密码/ });
    await changePasswordButton.first().click();

    // Wait for dialog to open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.navigation });

    // Fill the form – IDs differ between Next.js (camelCase) and Nuxt (kebab-case)
    const currentPwInput = page.locator('#currentPassword, #current-password');
    const newPwInput = page.locator('#newPassword, #new-password');
    const confirmPwInput = page.locator('#confirmPassword, #confirm-password');

    await currentPwInput.first().fill(originalPassword);
    await newPwInput.first().fill(newPassword);
    await confirmPwInput.first().fill(newPassword);

    // Click submit button inside the dialog
    const submitButton = dialog.locator(
      'button[type="submit"], button:has-text("Update Password"), button:has-text("更新密码")'
    );
    await submitButton.first().dispatchEvent('click');

    // Wait for dialog to close (indicates success)
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.navigation });

    await page.close();
  });

  test('can sign in with the new password', async ({ browser }) => {
    // Create a fresh browser context (no existing cookies)
    const freshContext = await browser.newContext();
    const page = await freshContext.newPage();

    // Try signing in with the new password
    const res = await signInViaAPI(page, {
      email: userEmail,
      password: newPassword,
    });
    expect(res.ok(), `Sign-in with new password failed: ${res.status()}`).toBeTruthy();

    // Navigate to dashboard to confirm session is valid
    await page.goto(PAGES.dashboard, { timeout: TIMEOUTS.navigation });
    await expect(page.locator('text=' + userName).first()).toBeVisible({
      timeout: TIMEOUTS.navigation,
    });

    await page.close();
    await freshContext.close();
  });
});
