import { test, expect } from '@playwright/test';
import { PAGES, TIMEOUTS } from '../helpers/constants';

/**
 * Public Pages Smoke Tests
 *
 * Verify that all public pages load correctly without authentication.
 * These are the most basic sanity checks -- if any of these fail,
 * there is likely a build or routing issue.
 */

test.describe('Public Pages', () => {
  test('Home page loads and renders hero section', async ({ page }) => {
    await page.goto(PAGES.home, { timeout: TIMEOUTS.navigation });

    // Page should load without errors
    await expect(page).not.toHaveTitle(/error|500|404/i);

    // Header should be visible
    await expect(page.locator('header')).toBeVisible();

    // Hero section should contain a heading
    const heroHeading = page.locator('h1').first();
    await expect(heroHeading).toBeVisible();

    // Navigation links should be present
    await expect(page.locator('nav')).toBeVisible();
  });

  test('Sign in page loads and shows login form', async ({ page }) => {
    await page.goto(PAGES.signin, { timeout: TIMEOUTS.navigation });

    // Should have email and password inputs
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Should have a submit button
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('Sign up page loads and shows registration form', async ({ page }) => {
    await page.goto(PAGES.signup, { timeout: TIMEOUTS.navigation });

    // Should have name, email, and password inputs
    await expect(page.locator('input#name')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Should have a submit button
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('Forgot password page loads and shows form', async ({ page }) => {
    await page.goto(PAGES.forgotPassword, { timeout: TIMEOUTS.navigation });

    // Should have an email input
    await expect(page.locator('input[type="email"]')).toBeVisible();

    // Should have a button inside the form (the submit button may not have explicit type="submit")
    await expect(page.locator('form button').first()).toBeVisible();
  });

  test('Pricing page loads and shows plan cards', async ({ page }) => {
    await page.goto(PAGES.pricing, { timeout: TIMEOUTS.navigation });

    // Page should not show error
    await expect(page).not.toHaveTitle(/error|500|404/i);

    // Should display at least one plan card with a price
    const priceElements = page.locator('text=/[¥$]\\d+/');
    await expect(priceElements.first()).toBeVisible({ timeout: TIMEOUTS.navigation });
  });
});
