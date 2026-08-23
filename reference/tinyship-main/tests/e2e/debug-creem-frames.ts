/**
 * Debug script: Discovers iframe structure on Creem checkout page.
 * Run: npx playwright test tests/e2e/debug-creem-frames.ts --timeout 120000
 */
import { test, expect, type Page } from '@playwright/test';
import { PAGES, TIMEOUTS, uniqueEmail } from './helpers/constants';
import { signUpViaAPI } from './helpers/auth';

test('debug: discover Creem checkout iframe structure', async ({ browser }) => {
  test.setTimeout(120_000);

  // Create authenticated context
  const email = uniqueEmail('e2e-debug-creem');
  const password = 'TestPassword123!';
  const context = await browser.newContext();
  const setupPage = await context.newPage();
  const res = await signUpViaAPI(setupPage, { name: 'Debug User', email, password });
  expect(res.ok()).toBeTruthy();
  await setupPage.close();

  const page = await context.newPage();

  // Navigate to pricing
  await page.goto(PAGES.pricing, { timeout: TIMEOUTS.navigation });
  await page.waitForLoadState('networkidle');

  // Find the Creem Monthly Plan card
  const planHeading = page.locator('h3').filter({ hasText: /Creem Monthly Plan$/i });
  await planHeading.waitFor({ state: 'attached', timeout: TIMEOUTS.navigation });
  await planHeading.scrollIntoViewIfNeeded();

  const card = planHeading.locator('xpath=ancestor::div[contains(@class,"rounded")]').first();
  const ctaButton = card.locator('button').first();
  await ctaButton.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
  await expect(ctaButton).toBeEnabled({ timeout: TIMEOUTS.navigation });
  await ctaButton.click();

  // Wait for Creem checkout
  await page.waitForURL(
    (url) => url.hostname.includes('creem') && !url.hostname.includes('localhost'),
    { timeout: TIMEOUTS.stripe },
  );

  console.log('\n===== Creem Checkout URL =====');
  console.log(page.url());

  // Wait for page to fully load
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000); // Extra time for Stripe to initialize

  // Dump all frames
  console.log('\n===== ALL FRAMES =====');
  for (const frame of page.frames()) {
    const name = frame.name();
    const url = frame.url();
    console.log(`\nFrame: name="${name}" url="${url}"`);

    // Try to find common Stripe input selectors
    const selectors = [
      '#Field-numberInput',
      '#Field-expiryInput',
      '#Field-cvcInput',
      'input[name="cardnumber"]',
      'input[name="exp-date"]',
      'input[name="cvc"]',
      'input[name="number"]',
      'input[name="expiry"]',
      'input[placeholder*="1234"]',
      'input[placeholder*="MM"]',
      'input[placeholder*="CVC"]',
      'input[autocomplete="cc-number"]',
      'input[autocomplete="cc-exp"]',
      'input[autocomplete="cc-csc"]',
      'input[data-elements-stable-field-name="cardNumber"]',
      'input[data-elements-stable-field-name="cardExpiry"]',
      'input[data-elements-stable-field-name="cardCvc"]',
    ];

    for (const sel of selectors) {
      try {
        const count = await frame.locator(sel).count();
        if (count > 0) {
          const visible = await frame.locator(sel).first().isVisible({ timeout: 500 }).catch(() => false);
          console.log(`  FOUND: ${sel} (count=${count}, visible=${visible})`);
        }
      } catch {
        // skip
      }
    }

    // List all input elements in this frame
    try {
      const inputCount = await frame.locator('input').count();
      if (inputCount > 0) {
        console.log(`  Total inputs: ${inputCount}`);
        for (let i = 0; i < Math.min(inputCount, 20); i++) {
          const input = frame.locator('input').nth(i);
          const attrs = await input.evaluate((el) => {
            return {
              id: el.id,
              name: el.getAttribute('name'),
              type: el.type,
              placeholder: el.getAttribute('placeholder'),
              autocomplete: el.getAttribute('autocomplete'),
              'data-elements-stable-field-name': el.getAttribute('data-elements-stable-field-name'),
              'aria-label': el.getAttribute('aria-label'),
            };
          }).catch(() => null);
          if (attrs) {
            console.log(`  Input[${i}]: ${JSON.stringify(attrs)}`);
          }
        }
      }
    } catch {
      // Frame might have been detached
    }
  }

  // Also check for iframes that we see
  console.log('\n===== IFRAMES ON PAGE =====');
  const iframeCount = await page.locator('iframe').count();
  console.log(`Total iframes on main page: ${iframeCount}`);
  for (let i = 0; i < iframeCount; i++) {
    const iframe = page.locator('iframe').nth(i);
    const attrs = await iframe.evaluate((el) => {
      return {
        name: el.getAttribute('name'),
        title: el.getAttribute('title'),
        id: el.id,
        src: el.getAttribute('src')?.substring(0, 200),
        class: el.className,
      };
    }).catch(() => null);
    console.log(`  iframe[${i}]: ${JSON.stringify(attrs)}`);
  }

  // Check main page inputs too
  console.log('\n===== MAIN PAGE INPUTS =====');
  const mainInputCount = await page.locator('input').count();
  console.log(`Total inputs on main page: ${mainInputCount}`);
  for (let i = 0; i < mainInputCount; i++) {
    const input = page.locator('input').nth(i);
    const attrs = await input.evaluate((el) => {
      return {
        id: el.id,
        name: el.getAttribute('name'),
        type: el.type,
        placeholder: el.getAttribute('placeholder'),
        'aria-label': el.getAttribute('aria-label'),
      };
    }).catch(() => null);
    if (attrs) {
      console.log(`  Input[${i}]: ${JSON.stringify(attrs)}`);
    }
  }

  // Check main page buttons
  console.log('\n===== MAIN PAGE BUTTONS =====');
  const buttonCount = await page.locator('button').count();
  for (let i = 0; i < buttonCount; i++) {
    const btn = page.locator('button').nth(i);
    const text = await btn.textContent().catch(() => '');
    const type = await btn.getAttribute('type').catch(() => '');
    if (text && text.trim()) {
      console.log(`  Button[${i}]: type="${type}" text="${text.trim().substring(0, 100)}"`);
    }
  }

  await context.close();
});
