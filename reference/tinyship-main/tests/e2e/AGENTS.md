# E2E Test Guidelines

Conventions, architecture, and instructions for writing and running E2E tests in this monorepo.

For a **detailed catalog of all test flows** (step-by-step descriptions, flow diagrams, result tracking), see [`TEST-CATALOG.md`](./TEST-CATALOG.md).

---

## Prerequisites

Playwright and its browser binaries are installed **globally** (not per-project `node_modules`).
Before running any E2E tests, make sure you have:

```bash
# 1) Install Playwright globally
npm install -g playwright @playwright/test

# 2) Download the Chromium browser binary (required by our config)
npx playwright install chromium
```

Without these, `pnpm test:e2e` will fail with "Executable doesn't exist" errors.

---

## Running Tests

> All three apps use the same port (7001). Run tests **sequentially** — finish one app before switching.

```bash
# 1) Start a dev server (pick one)
pnpm dev:next      # Next.js
pnpm dev:nuxt      # Nuxt.js
pnpm dev:tanstack  # TanStack Start

# 2) For Stripe payment tests, also start webhook forwarding in another terminal
stripe listen --forward-to localhost:7001/api/payment/webhook/stripe

# 3) Run all E2E tests
pnpm test:e2e

# Cloudflare Workers + local D1
pnpm test:e2e:cf

# 4) Interactive UI mode (for debugging)
pnpm test:e2e:ui

# 5) Headed mode (watch tests in a real browser window)
pnpm test:e2e -- --headed

# 6) Run a specific test file or grep pattern
pnpm test:e2e -- --grep "Stripe"
pnpm test:e2e -- --headed --grep "Admin Panel"
```

---

## Browser Tooling — agent-browser

[`agent-browser`](https://agent-browser.dev) is a standalone CLI for browser automation (independent of Playwright).
Use it to **explore page structure and discover selectors** before writing Playwright specs.

```bash
# 1) Navigate + wait for page ready
agent-browser open <url> && agent-browser wait --load networkidle

# 2) Snapshot interactive elements — get @e* refs
agent-browser snapshot -i

# 3) Interact using refs
agent-browser click @e3
agent-browser fill @e5 "hello"

# 4) Re-snapshot after DOM/navigation changes
agent-browser snapshot -i

# 5) Check current URL
agent-browser get url
```

> Refs (`@e1`, `@e2`, …) are invalidated after navigation or DOM changes — always re-snapshot before using new refs.

---

## File Structure

```
tests/e2e/
├── playwright.config.ts          # Playwright config (baseURL, browser, timeouts)
├── global-teardown.ts            # Cleanup script (deletes test users after run)
├── AGENTS.md                     # This file — conventions & guidelines
├── TEST-CATALOG.md               # Detailed test flow documentation (Chinese)
├── helpers/
│   ├── constants.ts              # URL paths, API endpoints, timeouts, test user data
│   ├── auth.ts                   # Auth helper functions (sign-up, sign-in, sign-out)
│   └── credits.ts                # Credit seeding (direct SQL for AI test users)
└── specs/
    ├── public-pages.spec.ts      # Public page smoke tests
    ├── auth-flow.spec.ts         # Authentication flow tests
    ├── access-control.spec.ts    # Access control tests
    ├── dashboard.spec.ts         # Dashboard tests
    ├── pricing.spec.ts           # Pricing page tests
    ├── ai-features.spec.ts       # AI feature page tests
    ├── stripe-payment.spec.ts    # Stripe payment flow tests
    ├── profile-update.spec.ts    # Profile update tests
    ├── password-change.spec.ts   # Password change tests
    ├── i18n-switching.spec.ts    # Language switching tests
    ├── upload-page.spec.ts       # Upload page tests
    ├── admin-panel.spec.ts       # Admin panel tests
    ├── ai-chat.spec.ts           # AI chat real interaction tests
    ├── ai-image-generate.spec.ts # AI image generation real tests
    ├── creem-payment.spec.ts     # Creem payment flow tests
    ├── paypal-payment.spec.ts    # PayPal payment flow tests
    ├── affiliate.spec.ts         # Affiliate/referral system tests
    ├── admin-affiliate.spec.ts   # Admin commission/withdrawal management tests
    └── admin-pricing.spec.ts     # Admin dynamic pricing management tests
```

---

## Conventions

### Selector Priority

To stay i18n-independent, prefer selectors in this order:

1. `data-testid` attributes (most stable)
2. HTML element IDs (`#email`, `#password`)
3. ARIA roles (`[role="tab"]`, `[role="combobox"]`)
4. Element type + attributes (`input[type="email"]`, `button[type="submit"]`)
5. CSS class patterns (least stable, avoid when possible)

### Authentication Strategy

- **Tests that need a logged-in user**: use API calls (`signUpViaAPI` / `signInViaAPI`) to set session cookies directly — faster and more reliable than UI login.
- **Tests that verify the auth flow itself**: use UI form interactions to test the sign-in/sign-up pages.
- **Rate limit handling**: auth helpers include exponential backoff retry (up to 3 attempts) for Better Auth's 429 rate limiting.

### Test Data & Cleanup

- All test user emails follow the pattern `e2e-xxx-{timestamp}@example.com`.
- After all tests complete, `global-teardown.ts` connects to the database and deletes users matching `email LIKE 'e2e-%'`.
- Database foreign keys are set to `ON DELETE CASCADE`, so deleting a user automatically removes:
  - `account` (auth accounts)
  - `session` (sessions)
  - `order` (orders)
  - `subscription` (subscriptions)
  - `credit_transaction` (credit transactions)
- The admin account (`admin@example.com`) is **pre-existing** and is NOT cleaned up.
- To skip cleanup (e.g., to inspect test data), set `E2E_SKIP_CLEANUP=true`.
- For TanStack Cloudflare Workers tests, use `pnpm test:e2e:cf`. It sets
  `E2E_DB_DIALECT=d1` so seed and cleanup helpers operate on Wrangler's local D1,
  rather than the PostgreSQL connection configured in the root `.env`.

### API Helpers vs E2E Tests

API calls in `helpers/auth.ts` are **test setup utilities** — they speed up login and account creation. They are NOT standalone API contract tests.

If you need API behavior assertions (status codes, error shapes, edge cases), put them in a separate `tests/api/` directory, not in E2E specs.

### AI Credits (Token) Preparation Strategy

For AI chat / image generation tests, the user must have enough credits.

Use the helper `seedCredits(userId, amount)` from `helpers/credits.ts` in `beforeAll` to directly set the user's credit balance via SQL.
This is fast, deterministic, and avoids running the full payment flow just to seed test data.

```typescript
// In beforeAll, after sign-up:
const signUpRes = await signUpViaAPI(page, { name, email, password });
const body = await signUpRes.json();
const userId = body.user.id;
await seedCredits(userId, 500); // Give 500 credits
```

### Sandbox Credentials for Payment E2E

Do not hardcode sandbox buyer credentials in spec files.
Provide them through environment variables:

- PayPal:
  - `E2E_PAYPAL_SANDBOX_EMAIL`
  - `E2E_PAYPAL_SANDBOX_PASSWORD`
- Alipay:
  - `E2E_ALIPAY_SANDBOX_ACCOUNT`
  - `E2E_ALIPAY_SANDBOX_PASSWORD`

If credentials are missing, the corresponding provider specs should call `test.skip(...)` with a clear reason.

### Test Structure Patterns

- Use `test.describe()` for grouping related tests.
- Use `test.describe.configure({ mode: 'serial' })` when tests share state (e.g., one browser context).
- Use `test.beforeAll()` to create a shared user + context, reducing API calls and avoiding rate limits.
- Each test should be independent — do not rely on side effects from a previous test.

---

## How to Add a New Test

1. **Create spec file**: `tests/e2e/specs/<flow-name>.spec.ts`
2. **Import helpers**: use `constants.ts` for URLs and `auth.ts` for auth setup.
3. **Write tests**:
   - Follow the selector priority above.
   - For authenticated tests, use `signUpViaAPI` / `signInViaAPI` in `beforeAll`.
   - Share a browser context across tests with `test.describe.configure({ mode: 'serial' })`.
4. **Update TEST-CATALOG.md**: add the new flow to the catalog with step-by-step details.
5. **Run & verify**: `pnpm test:e2e` against all three apps (Next.js, Nuxt.js, and TanStack Start).

---

## Backlog (Not Yet Implemented)

| Priority | Flow | Prerequisites | Notes |
|----------|------|---------------|-------|
| P3 | Social/OAuth login | OAuth provider config | Google/GitHub; WeChat requires QR scan — skip for now |
| P3 | Email verification | Email service | Full verification flow |
