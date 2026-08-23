/**
 * Ownership Boundary Tests
 *
 * Verifies user-scoped APIs do not leak cross-user data.
 * Current focus: `/api/orders` must only return the caller's own orders.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { inArray } from 'drizzle-orm';
import { config } from 'dotenv';
import { resolve } from 'path';
import { api, ensureServerRunning, signUp, uniqueEmail } from './helpers';

interface TestUser {
  id: string;
  cookies: string;
}

describe('Ownership Boundary — user-scoped APIs', () => {
  const insertedOrderIds: string[] = [];
  const testUserIds: string[] = [];
  let orderAId = '';
  let orderBId = '';
  let dbClient: any;
  let orderTable: any;
  let userTable: any;
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    await ensureServerRunning();
    config({ path: resolve(__dirname, '../../.env') });

    const dbModule = await import('@libs/database');
    const orderSchema = await import('@libs/database/schema/order');
    const userSchema = await import('@libs/database/schema/user');
    dbClient = dbModule.db;
    orderTable = orderSchema.order;
    userTable = userSchema.user;

    const userAEmail = uniqueEmail('owner-a');
    const userBEmail = uniqueEmail('owner-b');

    const signUpA = await signUp('Owner A', userAEmail, 'TestPassword123!');
    const signUpB = await signUp('Owner B', userBEmail, 'TestPassword123!');

    expect(signUpA.status, `Sign-up A failed with ${signUpA.status}`).toBe(200);
    expect(signUpB.status, `Sign-up B failed with ${signUpB.status}`).toBe(200);
    expect(signUpA.userId).toBeTruthy();
    expect(signUpB.userId).toBeTruthy();
    expect(signUpA.cookies).toBeTruthy();
    expect(signUpB.cookies).toBeTruthy();

    userA = { id: signUpA.userId!, cookies: signUpA.cookies };
    userB = { id: signUpB.userId!, cookies: signUpB.cookies };
    testUserIds.push(userA.id, userB.id);

    orderAId = `api-own-a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    orderBId = `api-own-b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    insertedOrderIds.push(orderAId, orderBId);

    await dbClient.insert(orderTable).values([
      {
        id: orderAId,
        userId: userA.id,
        amount: '9.99',
        currency: 'USD',
        planId: 'ownership-test-plan',
        status: 'pending',
        provider: 'stripe',
      },
      {
        id: orderBId,
        userId: userB.id,
        amount: '19.99',
        currency: 'USD',
        planId: 'ownership-test-plan',
        status: 'pending',
        provider: 'stripe',
      },
    ]);
  });

  afterAll(async () => {
    if (insertedOrderIds.length > 0) {
      await dbClient.delete(orderTable).where(inArray(orderTable.id, insertedOrderIds));
    }
    if (testUserIds.length > 0) {
      await dbClient.delete(userTable).where(inArray(userTable.id, testUserIds));
    }
  });

  test('user A cannot see user B orders in /api/orders', async () => {
    const response = await api('GET', '/api/orders?page=1&limit=100', userA.cookies);
    expect(response.status).toBe(200);

    const payload = await response.json() as { orders?: Array<{ id: string }> };
    const orderIds = (payload.orders || []).map((o) => o.id);

    expect(orderIds.length).toBeGreaterThan(0);
    expect(orderIds.some((id) => id.startsWith('api-own-a-'))).toBe(true);
    expect(orderIds.some((id) => id.startsWith('api-own-b-'))).toBe(false);
  });

  test('user B cannot see user A orders in /api/orders', async () => {
    const response = await api('GET', '/api/orders?page=1&limit=100', userB.cookies);
    expect(response.status).toBe(200);

    const payload = await response.json() as { orders?: Array<{ id: string }> };
    const orderIds = (payload.orders || []).map((o) => o.id);

    expect(orderIds.length).toBeGreaterThan(0);
    expect(orderIds.some((id) => id.startsWith('api-own-b-'))).toBe(true);
    expect(orderIds.some((id) => id.startsWith('api-own-a-'))).toBe(false);
  });

  test('user B cannot successfully query user A order via /api/payment/query', async () => {
    const response = await api(
      'GET',
      `/api/payment/query?orderId=${encodeURIComponent(orderAId)}&provider=stripe`,
      userB.cookies,
    );

    // Next/TanStack should return 403 for ownership denial.
    // Nuxt currently returns 400 for unsupported provider in this route.
    // In all cases, cross-user access must never be successful.
    expect(response.status).not.toBe(200);
  });
});
