/**
 * Admin Permission Tests
 *
 * Admin-only API endpoints MUST return 403 when called by an
 * authenticated normal (non-admin) user. This verifies the
 * RBAC layer works across all three apps.
 *
 * A fresh normal user is created in beforeAll via Better Auth sign-up.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { api, signUp, uniqueEmail, ensureServerRunning } from './helpers';

const ADMIN_ENDPOINTS: Array<{ method: string; path: string }> = [
  { method: 'GET', path: '/api/admin/users' },
  { method: 'GET', path: '/api/admin/orders' },
  { method: 'GET', path: '/api/admin/subscriptions' },
  { method: 'GET', path: '/api/admin/credits/transactions' },
  { method: 'GET', path: '/api/admin/blog' },
  { method: 'POST', path: '/api/admin/blog' },
  { method: 'GET', path: '/api/admin/blog/nonexistent-test-id' },
  { method: 'GET', path: '/api/users/nonexistent-test-id' },
];

describe('Admin Permission — normal user gets 403', () => {
  let cookies = '';

  beforeAll(async () => {
    await ensureServerRunning();

    const email = uniqueEmail('admin-perm');
    const result = await signUp('API Perm Test', email, 'TestPassword123!');
    expect(result.status, `Sign-up failed with ${result.status}`).toBe(200);
    cookies = result.cookies;
    expect(cookies).toBeTruthy();
  });

  for (const { method, path } of ADMIN_ENDPOINTS) {
    test(`${method} ${path}`, async () => {
      const res = await api(method, path, cookies);
      expect(res.status, `Expected 403 but got ${res.status}`).toBe(403);
    });
  }
});
