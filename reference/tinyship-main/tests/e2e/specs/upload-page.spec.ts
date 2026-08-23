import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PAGES, TIMEOUTS, uniqueEmail } from '../helpers/constants';
import { signUpViaAPI } from '../helpers/auth';

/**
 * Upload Page E2E Tests
 *
 * Covers real upload behavior:
 * - Successful image upload
 * - Invalid file type validation
 * - File size validation
 *
 * Prerequisite:
 * Storage provider credentials must be configured in env.
 */

test.describe('Upload Page', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  let authContext: BrowserContext;
  let userEmail: string;

  test.beforeAll(async ({ browser }) => {
    userEmail = uniqueEmail('e2e-upload');
    authContext = await browser.newContext();
    const page = await authContext.newPage();

    const res = await signUpViaAPI(page, {
      name: 'Upload Test User',
      email: userEmail,
      password: 'TestPassword123!',
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

  /**
   * Attach file payload to file input directly.
   * Works for both hidden and visible file inputs used by the upload component.
   */
  async function chooseFile(
    page: Page,
    payload: { name: string; mimeType: string; buffer: Buffer }
  ): Promise<void> {
    // Nuxt hydration can finish slightly after first paint in dev mode.
    // If we attach files too early, the change handler may not be bound yet.
    await page.waitForTimeout(2500);
    const input = page.locator('input[type="file"]').first();
    await input.setInputFiles(payload, { timeout: TIMEOUTS.navigation });
  }

  const SMALL_IMAGE = {
    name: 'tiny-image.png',
    mimeType: 'image/png',
    // 1x1 transparent PNG
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAukB9p3vZfQAAAAASUVORK5CYII=',
      'base64'
    ),
  };

  const INVALID_TEXT_FILE = {
    name: 'invalid-notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('this is not an image', 'utf8'),
  };

  const OVERSIZE_IMAGE = {
    name: 'oversize-image.png',
    mimeType: 'image/png',
    // Client-side limit is 1MB on upload page.
    buffer: Buffer.alloc(1_100_000, 1),
  };

  test('upload page loads with storage provider selector', async () => {
    const page = await authedPage();
    await page.goto(PAGES.upload, { timeout: TIMEOUTS.navigation });

    await expect(page).toHaveURL(/\/upload/);
    await expect(page.locator('h1').first()).toBeVisible({ timeout: TIMEOUTS.navigation });

    const providerSelect = page.locator('[role="combobox"], select').first();
    await expect(providerSelect).toBeVisible({ timeout: TIMEOUTS.navigation });

    await page.close();
  });

  test('can upload an image file and display uploaded summary', async () => {
    const page = await authedPage();
    await page.goto(PAGES.upload, { timeout: TIMEOUTS.navigation });
    await expect(page).toHaveURL(/\/upload/);

    const uploadResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/upload') && resp.request().method() === 'POST',
      { timeout: 90_000 }
    );

    await chooseFile(page, SMALL_IMAGE);
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.ok(), `Upload failed: ${uploadResponse.status()}`).toBeTruthy();

    // Uploaded summary card appears when at least one file is uploaded.
    await expect(page.locator('img[alt="tiny-image.png"]').first()).toBeVisible({ timeout: TIMEOUTS.navigation });
    await expect(page.locator('a[target="_blank"]').first()).toBeVisible({ timeout: TIMEOUTS.navigation });
    await expect(page.locator('text=Uploaded').first()).toBeVisible({ timeout: TIMEOUTS.navigation });

    await page.close();
  });

  test('rejects non-image files on client validation', async () => {
    const page = await authedPage();
    await page.goto(PAGES.upload, { timeout: TIMEOUTS.navigation });
    await expect(page).toHaveURL(/\/upload/);

    await chooseFile(page, INVALID_TEXT_FILE);

    await expect(page.locator('text=Only image files are allowed')).toBeVisible({
      timeout: TIMEOUTS.navigation,
    });
    await expect(page.locator('img[alt="invalid-notes.txt"]')).toHaveCount(0);

    await page.close();
  });

  test('rejects files larger than 1MB on client validation', async () => {
    const page = await authedPage();
    await page.goto(PAGES.upload, { timeout: TIMEOUTS.navigation });
    await expect(page).toHaveURL(/\/upload/);

    await chooseFile(page, OVERSIZE_IMAGE);

    await expect(page.locator('text=File size must be less than 1MB')).toBeVisible({
      timeout: TIMEOUTS.navigation,
    });
    await expect(page.locator('img[alt="oversize-image.png"]')).toHaveCount(0);

    await page.close();
  });
});
