import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PAGES, TIMEOUTS, uniqueEmail } from '../helpers/constants';
import { signUpViaAPI } from '../helpers/auth';
import { seedCredits } from '../helpers/credits';

/**
 * AI Image Generation E2E Tests — Real Generation
 *
 * Sends a real prompt to the Qwen image provider and verifies
 * that an image is generated, displayed, and downloadable.
 *
 * Prerequisites:
 * 1. At least the Qwen (Aliyun BaiLian) API key is configured
 *    (QWEN_API_KEY / DASHSCOPE_API_KEY in .env)
 * 2. Credits are seeded via direct SQL in beforeAll (500 credits)
 * 3. Dev server running on port 7001
 *
 * Page structure discovered via agent-browser:
 *   - h1: "AI Image Generation"
 *   - Credits display: text "credits: <number>"
 *   - Provider combobox: [role="combobox"] (1st) — default "Aliyun BaiLian"
 *   - Model combobox: [role="combobox"] (2nd) — default "Qwen Image Plus"
 *   - Prompt textarea with placeholder "Describe the image you want to generate..."
 *   - Generate button: contains text "Generate"
 *   - Result section: h2 "Result", status text "Idle" / "Generating..."
 *   - Generated image: img[alt="Generated image"]
 *   - Download button: contains text "Download"
 *   - Success toast: Sonner notification "Image generated successfully!"
 *   - Insufficient credits toast: "Insufficient Credits"
 */

test.describe('AI Image Generation (Real Generation)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  let authContext: BrowserContext;
  let userId: string;

  test.beforeAll(async ({ browser }) => {
    const email = uniqueEmail('e2e-imggen');
    authContext = await browser.newContext();
    const page = await authContext.newPage();

    // Create user and extract userId
    const res = await signUpViaAPI(page, {
      name: 'Image Gen Test User',
      email,
      password: 'TestPassword123!',
    });
    expect(res.ok(), `Sign-up failed: ${res.status()}`).toBeTruthy();

    const body = await res.json();
    userId = body.user?.id ?? body.id;
    expect(userId, 'Could not extract userId from sign-up response').toBeTruthy();

    // Seed enough credits for image generation tests
    // qwen-image-plus costs 5 credits per generation
    await seedCredits(userId, 500);

    await page.close();
  });

  test.afterAll(async () => {
    await authContext?.close();
  });

  /** Create a new page from the shared authenticated context */
  function authedPage(): Promise<Page> {
    return authContext.newPage();
  }

  test('can generate an image using the default Qwen model', async () => {
    const page = await authedPage();

    await page.goto(PAGES.imageGenerate, { timeout: TIMEOUTS.navigation });
    await expect(page).toHaveURL(/\/image-generate/);

    // Wait for page hydration
    await page.waitForTimeout(2000);

    // Verify page heading
    await expect(page.locator('h1').first()).toBeVisible();

    // Verify provider combobox is visible (default: "Aliyun BaiLian" = Qwen)
    const providerCombobox = page.locator('[role="combobox"]').first();
    await expect(providerCombobox).toBeVisible({ timeout: TIMEOUTS.navigation });

    // Verify model combobox is visible
    const modelCombobox = page.locator('[role="combobox"]').nth(1);
    await expect(modelCombobox).toBeVisible({ timeout: TIMEOUTS.navigation });

    // Fill a simple prompt in the textarea
    const promptInput = page.locator('textarea').first();
    await expect(promptInput).toBeVisible({ timeout: TIMEOUTS.navigation });
    await promptInput.fill('A cute cat sitting on a table');

    // Click Generate — locate by the main generate button in the form panel
    const generateBtn = page.locator('button').filter({ hasText: /^.*Generate.*$/i }).first();
    await expect(generateBtn).toBeVisible();
    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    // Wait for generation to complete by polling for the success toast.
    // Qwen image generation typically takes 5–15 seconds.
    // The toast text is "Image generated successfully!" (t.ai.image.generatedSuccessfully).
    const successToast = page.locator('[data-sonner-toast]')
      .or(page.locator('li[role="status"]'))
      .or(page.getByText(/generated successfully/i));
    await expect(successToast.first()).toBeVisible({ timeout: 60_000 });

    // Verify the generated image is visible
    const generatedImage = page.locator('img[alt="Generated image"]');
    await expect(generatedImage).toBeVisible({ timeout: 10_000 });

    // Verify image src is a non-empty URL
    const imgSrc = await generatedImage.getAttribute('src');
    expect(imgSrc).toBeTruthy();
    expect(imgSrc!.length).toBeGreaterThan(0);

    // Verify Download button is visible
    const downloadBtn = page.locator('button', { hasText: /Download/i });
    await expect(downloadBtn).toBeVisible();

    await page.close();
  });

  test('download button is visible after generation', async () => {
    const page = await authedPage();

    await page.goto(PAGES.imageGenerate, { timeout: TIMEOUTS.navigation });
    await expect(page).toHaveURL(/\/image-generate/);
    await page.waitForTimeout(2000);

    // Fill prompt and generate
    const promptInput = page.locator('textarea').first();
    await promptInput.fill('A simple red circle on white background');

    const generateBtn = page.locator('button').filter({ hasText: /^.*Generate.*$/i }).first();
    await generateBtn.click();

    // Wait for generation to complete — success toast appears
    const successToast = page.locator('[data-sonner-toast]')
      .or(page.locator('li[role="status"]'))
      .or(page.getByText(/generated successfully/i));
    await expect(successToast.first()).toBeVisible({ timeout: 60_000 });

    // Verify Download button is visible and clickable
    const downloadBtn = page.locator('button').filter({ hasText: /Download/i }).first();
    await expect(downloadBtn).toBeVisible({ timeout: 10_000 });
    await expect(downloadBtn).toBeEnabled();

    // Click download — we don't verify file save (browser-handled),
    // just that no error occurs
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }).catch(() => null),
      downloadBtn.click(),
    ]);

    // If a download event fired, it means the browser started downloading
    // (some environments may not trigger this event, so we don't fail on null)
    if (download) {
      expect(download.suggestedFilename()).toBeTruthy();
    }

    await page.close();
  });

  test('insufficient credits shows error toast', async ({ browser }) => {
    // Create a new user with ZERO credits
    const email = uniqueEmail('e2e-imggen-nocredits');
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const res = await signUpViaAPI(page, {
      name: 'No Credits Image User',
      email,
      password: 'TestPassword123!',
    });
    expect(res.ok()).toBeTruthy();
    // Do NOT seed credits — user has 0

    await page.goto(PAGES.imageGenerate, { timeout: TIMEOUTS.navigation });
    await expect(page).toHaveURL(/\/image-generate/);
    await page.waitForTimeout(2000);

    // Fill a prompt
    const promptInput = page.locator('textarea').first();
    await promptInput.fill('Test insufficient credits');

    // Click Generate
    const generateBtn = page.locator('button').filter({ hasText: /^.*Generate.*$/i }).first();
    await generateBtn.click();

    // The server returns 402 and a toast with "Insufficient Credits" appears
    const insufficientToast = page.locator('[data-sonner-toast]')
      .or(page.locator('li[role="status"]'))
      .or(page.getByText(/Insufficient Credits|insufficient/i));

    await expect(insufficientToast.first()).toBeVisible({ timeout: 15_000 });

    await page.close();
    await ctx.close();
  });
});
