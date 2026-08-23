# API Permission Tests

This directory contains minimal API permission checks using Vitest + native `fetch`.
No Postman, Bruno, or extra test framework is required.

## What is checked

### 1) Unauthenticated requests must be rejected (401)

File: `tests/api/auth-protection.test.ts`

Checks that protected endpoints return `401` when no session cookie is provided.

Covered endpoint groups:
- Credits: `/api/credits/balance`, `/api/credits/transactions`, `/api/credits/status`
- Orders: `/api/orders`
- Subscription: `/api/subscription/status`, `/api/subscription/portal`
- AI: `/api/chat`, `/api/image-generate`, `/api/video-generate`, `/api/video-generate/status`
- Upload: `/api/upload`
- Payment (user-initiated): `/api/payment/initiate`, `/api/payment/query`, `/api/payment/cancel`
- Admin: `/api/admin/users`, `/api/admin/orders`, `/api/admin/subscriptions`, `/api/admin/credits/transactions`, `/api/admin/blog`
- User management: `/api/users/:id` (tested with a fake ID)

### 2) Authenticated non-admin must be forbidden on admin APIs (403)

File: `tests/api/admin-permission.test.ts`

The test creates a normal user via Better Auth, then checks admin-only endpoints return `403`.

Covered endpoints:
- `/api/admin/users`
- `/api/admin/orders`
- `/api/admin/subscriptions`
- `/api/admin/credits/transactions`
- `/api/admin/blog`
- `/api/admin/blog/:id` (tested with a fake ID)
- `/api/users/:id` (admin-only user detail API)

### 3) Public endpoints must stay public (not 401)

File: `tests/api/public-endpoints.test.ts`

Checks that intentionally public endpoints are still accessible without login.
Assertion is `status !== 401` (response may be `200`, `400`, `404`, etc. depending on payload).

Covered endpoints:
- `/api/health`
- `/api/blog`
- `/api/payment/webhook/stripe`
- `/api/payment/webhook/paypal`
- `/api/payment/webhook/creem`

### 4) Ownership boundary for user-scoped APIs

File: `tests/api/ownership-boundary.test.ts`

Checks cross-user isolation for user-scoped data APIs.
Current coverage uses `/api/orders` with two real users:
- User A has order A (seeded directly in DB)
- User B has order B (seeded directly in DB)
- A calling `/api/orders` must not see order B
- B calling `/api/orders` must not see order A
- B querying A's order via `/api/payment/query` must not succeed (`status !== 200`)

This catches IDOR-style regressions where an endpoint accidentally leaks another user's data.

## How to run

1. Start one app on port `7001`:
   - `pnpm dev:next`
   - `pnpm dev:nuxt`
   - `pnpm dev:tanstack`
2. Run API tests:
   - `pnpm test:api`

The same suite is designed to run against all three apps (one app at a time on port `7001`).

## Scope and non-goals

This suite focuses on permission contracts only:
- `401` for missing auth
- `403` for missing admin permission
- public endpoints not accidentally protected
- ownership boundaries for user-scoped resources (cross-user isolation)

This suite does **not** verify:
- full response schema for each API
- full business logic correctness
- provider-side integrations (Stripe/PayPal/Creem behavior details)
- UI behavior (covered by E2E tests)
