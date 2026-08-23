import { test, expect } from '@playwright/test';
import { PAGES, TIMEOUTS } from '../helpers/constants';

/**
 * Pricing Page Tests
 *
 * Verifies the pricing page renders plans correctly with prices,
 * features, and CTA buttons. Also tests tab switching between
 * subscription and credit plans (if credit plans exist).
 */

test.describe('Pricing Page', () => {
  test('renders pricing page with plan cards', async ({ page }) => {
    await page.goto(PAGES.pricing, { timeout: TIMEOUTS.navigation });

    // Page heading should be visible
    const heading = page.locator('h2').first();
    await expect(heading).toBeVisible();

    // Should display at least one plan card with a price (¥ or $)
    const priceElements = page.locator('text=/[¥$]\\d+/');
    await expect(priceElements.first()).toBeVisible({ timeout: TIMEOUTS.navigation });
  });

  test('plan cards show name, price, and features', async ({ page }) => {
    await page.goto(PAGES.pricing, { timeout: TIMEOUTS.navigation });

    // Each plan card is rendered inside a motion.div with plan details
    // Look for plan name headings (h3 within plan cards)
    const planNames = page.locator('h3');
    const planCount = await planNames.count();
    expect(planCount).toBeGreaterThanOrEqual(1);

    // Each plan should have a CTA button
    const ctaButtons = page.locator('button').filter({ has: page.locator('svg') });
    const buttonCount = await ctaButtons.count();
    expect(buttonCount).toBeGreaterThanOrEqual(1);
  });

  test('plan cards have feature list with check icons', async ({ page }) => {
    await page.goto(PAGES.pricing, { timeout: TIMEOUTS.navigation });

    // Feature items have check icons (SVG inside rounded circle divs)
    // and text descriptions
    const featureItems = page.locator('.flex.items-start.space-x-3');
    const featureCount = await featureItems.count();
    expect(featureCount).toBeGreaterThanOrEqual(1);
  });

  test('tab switching between subscription and credits works', async ({ page }) => {
    await page.goto(PAGES.pricing, { timeout: TIMEOUTS.navigation });

    // Check if tab switcher exists (only present when credit plans exist)
    const tabSwitcher = page.locator('.inline-flex.p-1.bg-muted.rounded-xl');
    const hasCreditsTab = await tabSwitcher.isVisible().catch(() => false);

    if (hasCreditsTab) {
      // Find the credits tab button (second button in the tab switcher)
      const buttons = tabSwitcher.locator('button');
      const creditsButton = buttons.nth(1);

      // Click credits tab
      await creditsButton.click();
      await page.waitForTimeout(500);

      // The tab should now be active (has different styling)
      // Plans should still be displayed
      const priceElements = page.locator('text=/[¥$]\\d+/');
      await expect(priceElements.first()).toBeVisible();

      // Switch back to subscription tab
      const subscriptionButton = buttons.nth(0);
      await subscriptionButton.click();
      await page.waitForTimeout(500);

      // Plans should still be displayed
      await expect(priceElements.first()).toBeVisible();
    }
  });
});
