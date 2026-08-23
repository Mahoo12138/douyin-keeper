import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PAGES, TIMEOUTS, uniqueEmail } from '../helpers/constants';
import { signUpViaAPI } from '../helpers/auth';
import { seedCredits } from '../helpers/credits';

/**
 * AI Chat E2E Tests — Real Interaction
 *
 * Sends a real message using the default AI model and verifies
 * the assistant responds. Requires:
 * - At least one AI provider API key configured (e.g. Qwen / DeepSeek / OpenAI)
 * - Credits are seeded via direct SQL in beforeAll
 */

test.describe('AI Chat (Real Interaction)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  let authContext: BrowserContext;
  let userId: string;

  test.beforeAll(async ({ browser }) => {
    const email = uniqueEmail('e2e-aichat');
    authContext = await browser.newContext();
    const page = await authContext.newPage();

    // Create user and get userId
    const res = await signUpViaAPI(page, {
      name: 'AI Chat Test User',
      email,
      password: 'TestPassword123!',
    });
    expect(res.ok(), `Sign-up failed: ${res.status()}`).toBeTruthy();

    const body = await res.json();
    userId = body.user?.id ?? body.id;
    expect(userId, 'Could not extract userId from sign-up response').toBeTruthy();

    // Seed credits so the user can send messages
    await seedCredits(userId, 500);

    await page.close();
  });

  test.afterAll(async () => {
    await authContext?.close();
  });

  function authedPage(): Promise<Page> {
    return authContext.newPage();
  }

  test('can send a message and receive an assistant response', async () => {
    const page = await authedPage();
    await page.goto(PAGES.ai, { timeout: TIMEOUTS.navigation });
    await expect(page).toHaveURL(/\/ai/);

    // Wait for hydration and initial messages to render
    await page.waitForTimeout(2000);

    // Click "New Chat" to clear initial demo messages (if present)
    const newChatBtn = page.locator('button', { hasText: 'New Chat' });
    if (await newChatBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newChatBtn.click();
      await page.waitForTimeout(500);
    }

    // Type a simple message in the prompt textarea
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: TIMEOUTS.navigation });
    await textarea.fill('Hello, please respond with OK');

    // Click the Submit button (icon button with aria-label)
    const submitBtn = page.locator('button[aria-label="Submit"], button[type="submit"]').last();
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Wait for user message to appear
    await expect(page.locator('.is-user').last()).toBeVisible({ timeout: 10_000 });

    // Wait for assistant response — the streaming response creates a new .is-assistant element.
    // Content streams in gradually via Streamdown, so we must wait for non-empty text.
    const assistantMsg = page.locator('.is-assistant').last();
    await expect(assistantMsg).toBeVisible({ timeout: 60_000 });

    // Poll until the streamed text is non-empty (streaming may take a few seconds)
    await expect(async () => {
      const text = await assistantMsg.innerText();
      expect(text.trim().length).toBeGreaterThan(0);
    }).toPass({ timeout: 60_000, intervals: [1000, 2000, 3000] });

    await page.close();
  });

  test('conversation shows user and assistant messages in order', async () => {
    const page = await authedPage();
    await page.goto(PAGES.ai, { timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(2000);

    // Clear demo messages
    const newChatBtn = page.locator('button', { hasText: 'New Chat' });
    if (await newChatBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newChatBtn.click();
      await page.waitForTimeout(500);
    }

    // Send a message
    const textarea = page.locator('textarea').first();
    await textarea.fill('Say the word PINEAPPLE');
    const submitBtn = page.locator('button[aria-label="Submit"], button[type="submit"]').last();
    await submitBtn.click();

    // Wait for both user and assistant messages
    await expect(page.locator('.is-user').last()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.is-assistant').last()).toBeVisible({ timeout: 60_000 });

    // Verify ordering: user message appears before assistant
    const allMessages = page.locator('.is-user, .is-assistant');
    const count = await allMessages.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // The last two should be user then assistant
    const secondToLast = await allMessages.nth(count - 2).getAttribute('class');
    const last = await allMessages.nth(count - 1).getAttribute('class');
    expect(secondToLast).toContain('is-user');
    expect(last).toContain('is-assistant');

    await page.close();
  });

  test('credits are deducted after sending a message', async () => {
    const page = await authedPage();

    // Fetch initial balance
    const balanceBefore = await page.request.get('/api/credits/balance').then(r => r.json());
    expect(balanceBefore.balance).toBeGreaterThan(0);

    await page.goto(PAGES.ai, { timeout: TIMEOUTS.navigation });
    await page.waitForTimeout(2000);

    const newChatBtn = page.locator('button', { hasText: 'New Chat' });
    if (await newChatBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newChatBtn.click();
      await page.waitForTimeout(500);
    }

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: TIMEOUTS.navigation });
    await textarea.fill('Say OK');

    const submitBtn = page.locator('button[aria-label="Submit"], button[type="submit"]').last();
    await submitBtn.click();

    // Wait for the full assistant response to finish streaming
    const assistantMsg = page.locator('.is-assistant').last();
    await expect(assistantMsg).toBeVisible({ timeout: 60_000 });
    await expect(async () => {
      const text = await assistantMsg.innerText();
      expect(text.trim().length).toBeGreaterThan(0);
    }).toPass({ timeout: 60_000, intervals: [1000, 2000, 3000] });

    // Give the server a moment to finish credit consumption
    // (TransformStream approach closes the stream after credits are consumed,
    //  and Node.js uses a floating promise that should complete quickly)
    await page.waitForTimeout(3000);

    // Fetch balance again and verify it decreased
    const balanceAfter = await page.request.get('/api/credits/balance').then(r => r.json());
    expect(balanceAfter.balance).toBeLessThan(balanceBefore.balance);

    await page.close();
  });

  test('insufficient credits shows error toast', async ({ browser }) => {
    // Create a new user with ZERO credits
    const email = uniqueEmail('e2e-nocredits');
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const res = await signUpViaAPI(page, {
      name: 'No Credits User',
      email,
      password: 'TestPassword123!',
    });
    expect(res.ok()).toBeTruthy();
    // Do NOT seed credits — user has 0

    await page.goto(PAGES.ai, { timeout: TIMEOUTS.navigation });

    // Wait for the client-side credit check (/api/credits/status) to complete.
    // The page sets hasAccess=false when balance=0.
    await page.waitForTimeout(3000);

    // Clear demo messages
    const newChatBtn = page.locator('button', { hasText: 'New Chat' });
    if (await newChatBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newChatBtn.click();
      await page.waitForTimeout(500);
    }

    // Send a message
    const textarea = page.locator('textarea').first();
    await textarea.fill('Hello');
    const submitBtn = page.locator('button[aria-label="Submit"], button[type="submit"]').last();
    await submitBtn.click();

    // The page checks credits client-side before sending to the API.
    // If hasAccess=false, a Sonner toast with "Insufficient Credits" appears.
    // If the message reaches the API, the server returns 402 and an error block shows.
    // Check for either scenario using .or() chaining.
    const toastOrError = page.locator('[data-sonner-toast]')
      .or(page.locator('li[role="status"]'))
      .or(page.getByText(/Insufficient Credits|insufficient/i))
      .or(page.locator('.bg-destructive'));

    await expect(toastOrError.first()).toBeVisible({ timeout: 15_000 });

    await page.close();
    await ctx.close();
  });
});
