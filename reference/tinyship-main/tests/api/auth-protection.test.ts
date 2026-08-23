/**
 * Auth Protection Tests
 *
 * Every protected API endpoint MUST return 401 when called without
 * a session cookie. This catches missing auth guards — especially in
 * TanStack Start where there is no global API middleware.
 *
 * Run against whichever app is on port 7001:
 *   pnpm dev:next   && pnpm test:api
 *   pnpm dev:nuxt   && pnpm test:api
 *   pnpm dev:tanstack && pnpm test:api
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { api, ensureServerRunning } from './helpers';

const PROTECTED_ENDPOINTS: Array<{ method: string; path: string }> = [
  // ── Credits ──────────────────────────────────────────────
  { method: 'GET', path: '/api/credits/balance' },
  { method: 'GET', path: '/api/credits/transactions' },
  { method: 'GET', path: '/api/credits/status' },

  // ── Orders ───────────────────────────────────────────────
  { method: 'GET', path: '/api/orders' },

  // ── Subscription ─────────────────────────────────────────
  { method: 'GET', path: '/api/subscription/status' },
  { method: 'POST', path: '/api/subscription/portal' },

  // ── AI Features ──────────────────────────────────────────
  { method: 'POST', path: '/api/chat' },
  { method: 'POST', path: '/api/image-generate' },
  { method: 'POST', path: '/api/video-generate' },
  { method: 'GET', path: '/api/video-generate/status' },

  // ── Upload ───────────────────────────────────────────────
  { method: 'POST', path: '/api/upload' },

  // ── Payment (user-initiated, requires session) ──────────
  { method: 'POST', path: '/api/payment/initiate' },
  { method: 'GET', path: '/api/payment/query' },
  { method: 'POST', path: '/api/payment/cancel' },

  // ── Admin ────────────────────────────────────────────────
  { method: 'GET', path: '/api/admin/users' },
  { method: 'GET', path: '/api/admin/orders' },
  { method: 'GET', path: '/api/admin/subscriptions' },
  { method: 'GET', path: '/api/admin/credits/transactions' },
  { method: 'GET', path: '/api/admin/blog' },
  { method: 'POST', path: '/api/admin/blog' },

  // ── User management (admin-only) ────────────────────────
  { method: 'GET', path: '/api/users/nonexistent-test-id' },
];

describe('Auth Protection — unauthenticated requests return 401', () => {
  beforeAll(async () => {
    await ensureServerRunning();
  });

  for (const { method, path } of PROTECTED_ENDPOINTS) {
    test(`${method} ${path}`, async () => {
      const res = await api(method, path);
      expect(res.status, `Expected 401 but got ${res.status}`).toBe(401);
    });
  }
});
