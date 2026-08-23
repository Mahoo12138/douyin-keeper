/**
 * Public Endpoint Tests
 *
 * Endpoints that are intentionally public MUST remain accessible
 * without authentication. Verifies they do NOT return 401.
 *
 * Note: the actual response may be 200, 204, 400, 404, etc.
 * depending on request validity — we only assert "not 401".
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { api, ensureServerRunning } from './helpers';

const PUBLIC_ENDPOINTS: Array<{ method: string; path: string }> = [
  // Health check
  { method: 'GET', path: '/api/health' },

  // Public blog
  { method: 'GET', path: '/api/blog' },

  // Payment webhooks (called by external payment providers)
  { method: 'POST', path: '/api/payment/webhook/stripe' },
  { method: 'POST', path: '/api/payment/webhook/paypal' },
  { method: 'POST', path: '/api/payment/webhook/creem' },
];

describe('Public Endpoints — accessible without auth', () => {
  beforeAll(async () => {
    await ensureServerRunning();
  });

  for (const { method, path } of PUBLIC_ENDPOINTS) {
    test(`${method} ${path} does NOT return 401`, async () => {
      const res = await api(method, path);
      expect(res.status, `Got 401 — endpoint may be incorrectly protected`).not.toBe(401);
    });
  }
});
