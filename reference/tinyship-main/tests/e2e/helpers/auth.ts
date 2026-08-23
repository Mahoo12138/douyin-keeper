import { type Page, expect } from '@playwright/test';
import { API, TIMEOUTS } from './constants';

/**
 * Auth helper utilities for E2E tests.
 *
 * Uses the Better Auth API directly to create/authenticate users,
 * which is faster and more reliable than filling out UI forms for
 * every test that needs an authenticated session.
 *
 * Includes retry logic with exponential backoff to handle
 * Better Auth's built-in rate limiting (429 responses).
 */

interface SignUpOptions {
  name: string;
  email: string;
  password: string;
}

interface SignInOptions {
  email: string;
  password: string;
}

/** Default retry configuration for rate-limited requests */
const RETRY_CONFIG = {
  maxRetries: 3,
  /** Initial delay in ms (doubles on each retry) */
  initialDelay: 2000,
};

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sign up a new user via the API and return the response.
 * Retries on 429 (rate-limited) responses with exponential backoff.
 */
export async function signUpViaAPI(page: Page, options: SignUpOptions) {
  let lastResponse;
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    lastResponse = await page.request.post(API.signUp, {
      data: {
        name: options.name,
        email: options.email,
        password: options.password,
      },
      headers: { Origin: 'http://localhost:7001' },
      timeout: TIMEOUTS.auth,
    });

    if (lastResponse.status() !== 429) {
      return lastResponse;
    }

    // Rate limited — wait and retry
    if (attempt < RETRY_CONFIG.maxRetries) {
      const delay = RETRY_CONFIG.initialDelay * Math.pow(2, attempt);
      console.log(`Sign-up rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries})...`);
      await sleep(delay);
    }
  }

  return lastResponse!;
}

/**
 * Sign in an existing user via the API.
 * Retries on 429 (rate-limited) responses with exponential backoff.
 */
export async function signInViaAPI(page: Page, options: SignInOptions) {
  let lastResponse;
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    lastResponse = await page.request.post(API.signIn, {
      data: {
        email: options.email,
        password: options.password,
        rememberMe: true,
      },
      headers: { Origin: 'http://localhost:7001' },
      timeout: TIMEOUTS.auth,
    });

    if (lastResponse.status() !== 429) {
      return lastResponse;
    }

    // Rate limited — wait and retry
    if (attempt < RETRY_CONFIG.maxRetries) {
      const delay = RETRY_CONFIG.initialDelay * Math.pow(2, attempt);
      console.log(`Sign-in rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries})...`);
      await sleep(delay);
    }
  }

  return lastResponse!;
}

/**
 * Sign out the current user.
 * Calls the API and clears browser cookies to ensure a clean state.
 */
export async function signOutViaAPI(page: Page) {
  const response = await page.request.post(API.signOut, {
    headers: { Origin: 'http://localhost:7001' },
    timeout: TIMEOUTS.auth,
  });

  // Also clear all cookies from the browser context to guarantee
  // a fully unauthenticated state (API call alone doesn't always
  // clear cookies set via Set-Cookie headers)
  await page.context().clearCookies();

  return response;
}

/**
 * Create a new user account, ready for authenticated tests.
 * Better Auth automatically establishes a session on sign-up,
 * so an explicit sign-in call is not needed.
 * Returns the user credentials used.
 */
export async function createAndSignIn(
  page: Page,
  options: SignUpOptions
): Promise<SignUpOptions> {
  // Create account (also establishes session automatically)
  const signUpRes = await signUpViaAPI(page, options);
  expect(signUpRes.ok(), `Sign-up failed: ${signUpRes.status()}`).toBeTruthy();

  return options;
}

/**
 * Assert that the current page URL contains the expected path.
 * Useful after redirects.
 */
export async function expectUrlContains(page: Page, path: string) {
  await expect(page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
