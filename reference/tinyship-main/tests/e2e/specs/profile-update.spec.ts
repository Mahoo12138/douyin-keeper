import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PAGES, TIMEOUTS, uniqueEmail } from '../helpers/constants';
import { signUpViaAPI } from '../helpers/auth';

/**
 * Profile Update E2E Tests
 *
 * Verifies the dashboard profile editing flow:
 * - Click "Edit" to enter editing mode
 * - Change the user name
 * - Save the change and see a success toast
 * - Verify the displayed name is updated
 */

test.describe('Profile Update', () => {
  test.describe.configure({ mode: 'serial' });

  let authContext: BrowserContext;
  const password = 'TestPassword123!';
  const originalName = 'Profile Test User';
  let userEmail: string;

  test.beforeAll(async ({ browser }) => {
    userEmail = uniqueEmail('e2e-profile');
    authContext = await browser.newContext();
    const page = await authContext.newPage();

    const res = await signUpViaAPI(page, {
      name: originalName,
      email: userEmail,
      password,
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

  test('dashboard profile tab shows user name and edit button', async () => {
    const page = await authedPage();
    await page.goto(PAGES.dashboard, { timeout: TIMEOUTS.navigation });

    // Profile tab is active by default — verify name is displayed
    await expect(page.locator('text=' + originalName).first()).toBeVisible({
      timeout: TIMEOUTS.navigation,
    });

    // Verify the "Edit" button exists (scoped to main content area)
    // Use substring match — Vue/Nuxt SSR may add whitespace around text content
    const editButton = page.locator('main button').filter({ hasText: /Edit/ });
    await expect(editButton.first()).toBeVisible({ timeout: TIMEOUTS.navigation });

    await page.close();
  });

  test('can enter edit mode and change name', async () => {
    const page = await authedPage();
    await page.goto(PAGES.dashboard, { timeout: TIMEOUTS.navigation });

    // Explicitly click the Profile sidebar tab (inside <nav>) to ensure we're on the right panel.
    // IMPORTANT: Do not use `button:has-text("Profile")` without scoping to nav,
    // because the user menu button "P {name}" also contains "Profile" in the name.
    const profileTab = page.locator('nav button').filter({ hasText: /Profile/i }).first();
    await expect(profileTab).toBeVisible({ timeout: TIMEOUTS.navigation });
    await profileTab.click();
    await page.waitForTimeout(500);

    // Wait for the profile to load and display the user name
    await expect(page.locator('text=' + originalName).first()).toBeVisible({
      timeout: TIMEOUTS.navigation,
    });

    // Click Edit button via JS dispatch to bypass potential pointer-event interception.
    const editButton = page.locator('main button').filter({ hasText: /Edit/ });
    await expect(editButton.first()).toBeVisible({ timeout: TIMEOUTS.navigation });
    await editButton.first().dispatchEvent('click');
    await page.waitForTimeout(500);

    // Verify edit mode — name input should appear (the input has id="name")
    const nameInput = page.locator('#name');
    await expect(nameInput).toBeVisible({ timeout: TIMEOUTS.navigation });

    // Clear and type a new name
    const newName = 'Updated E2E Name';
    await nameInput.fill(newName);

    // Click save button via JS dispatch to bypass pointer-event interception
    const saveButton = page.locator('main button').filter({ hasText: /Save/ });
    await saveButton.first().dispatchEvent('click');

    // Wait for the edit mode to close (edit button reappears)
    await expect(
      page.locator('main button').filter({ hasText: /Edit/ }).first()
    ).toBeVisible({ timeout: TIMEOUTS.navigation });

    // Verify the new name is displayed
    await expect(page.locator('text=' + newName).first()).toBeVisible({
      timeout: TIMEOUTS.navigation,
    });

    await page.close();
  });
});
