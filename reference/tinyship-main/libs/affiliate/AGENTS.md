# AGENTS.md

## Overview

Affiliate/referral system library providing cash-commission referrals, signup bonuses, and withdrawal management. Referrers earn a percentage commission on every purchase made by their referred users, plus mutual credit bonuses on signup. The system is feature-flagged, disabled by default, and is enabled only with `AFFILIATE_ENABLED=true`.

## Setup Commands

```bash
# Database migration (adds referralCode/commissionBalance to user, creates commission/withdrawal tables)
pnpm db:generate
pnpm db:push          # PostgreSQL
pnpm db:push:sqlite   # SQLite

# No additional package installation needed
# Uses existing @libs/database, @libs/credits, and @config
```

## Code Style

- Pure functions with explicit params/return types (no classes)
- All monetary values stored as strings for precision, parsed with `parseFloat` at boundaries
- Idempotent operations: `processReferralCommission` skips duplicate orders
- Transaction-safe balance mutations using Drizzle ORM transactions
- SQL uses `CAST()` syntax (compatible with both PostgreSQL and SQLite)
- Structured logging with `[Affiliate][Module]` prefix

## Directory Structure

```
libs/affiliate/
├── AGENTS.md           # This file
├── index.ts            # Barrel exports
├── types.ts            # TypeScript interfaces
├── referral.ts         # Referral code generation, cookie parsing, claim flow
├── commission.ts       # Commission processing (called by payment webhooks)
└── withdrawal.ts       # Withdrawal request + admin processing
```

## Usage Examples

### Referral Code Generation

```typescript
import { generateReferralCode } from '@libs/affiliate';

// Lazy-generates a unique 8-char code on first call; returns existing code after that
const code = await generateReferralCode(userId);
// => "NjMDryrv"
```

### Cookie-Based Referral Attribution

```typescript
import { getReferralCodeFromCookieHeader } from '@libs/affiliate';
import { config } from '@config';

const code = getReferralCodeFromCookieHeader(
  request.headers.get('cookie'),
  config.affiliate.cookie.name  // "referral_code"
);
```

### Claiming a Referral Code

```typescript
import { applyReferralCodeToUser } from '@libs/affiliate';

const result = await applyReferralCodeToUser({
  userId: referee.id,
  referralCode: 'NjMDryrv',
});

if (result.applied) {
  // Referral recorded, signup bonuses granted to both parties
}
// Possible reasons for !applied: no_referral_code, already_claimed,
// invalid_referrer, self_referral, affiliate_disabled
```

### Processing Commission (Payment Webhook)

```typescript
import { processReferralCommission } from '@libs/affiliate';

// Called inside every payment provider's webhook handler after order is marked PAID
const result = await processReferralCommission(orderId);
if (result.created) {
  console.log(`Commission: ${result.amount} (ID: ${result.commissionId})`);
}
```

### Withdrawal Requests

```typescript
import { requestWithdrawal, processWithdrawal } from '@libs/affiliate';

// User requests withdrawal
const req = await requestWithdrawal({
  userId,
  amount: 150,
  paymentMethod: 'alipay',
  paymentAccount: 'user@email.com',
  currency: 'CNY',
});
// Balance is deducted immediately; refunded on rejection

// Admin processes withdrawal
const proc = await processWithdrawal({
  withdrawalId: req.withdrawalId!,
  status: 'completed', // or 'rejected'
  processedBy: adminUserId,
  adminNote: 'Transferred via Alipay',
});
```

## Common Tasks

### Adding a New Payment Provider

When integrating a new payment provider webhook:

1. After marking the order as `PAID`, add one line:
   ```typescript
   await processReferralCommission(orderId);
   ```
2. In the payment initiation route, attach referral metadata to the order:
   ```typescript
   const referralCode = user.referredByCode;
   if (referralCode) {
     order.metadata = { referralCode, referrerId: referrer.id };
   }
   ```

### Adjusting Commission Rates

Set environment variables — no code changes needed:

```env
AFFILIATE_COMMISSION_RATE=0.15          # 15% commission (default: 20%)
AFFILIATE_FIXED_COMMISSION_AMOUNT=5.00  # Flat $5 per order (overrides percentage)
```

### Disabling the System

```env
AFFILIATE_ENABLED=false
```

This hides all affiliate UI tabs, blocks API routes, and skips commission processing in webhooks.

## Integration Points

| Integration | Where | What happens |
|-------------|-------|-------------|
| Payment webhooks | `libs/payment/providers/*.ts` | Calls `processReferralCommission(orderId)` after PAID |
| Payment initiation | `apps/*/api/payment/initiate` | Attaches `{ referralCode, referrerId }` to order metadata |
| Referral cookie capture | Framework middleware (Next/Nuxt/TanStack) | Reads `?ref=CODE` from URL, sets `referral_code` cookie |
| Referral claim | Dashboard mount / `POST /api/affiliate/claim` | Calls `applyReferralCodeToUser()` with cookie value |
| Signup bonuses | Inside `applyReferralCodeToUser()` | Grants credits via `creditService.addCredits()` |
| Admin withdrawal | `PATCH /api/admin/withdrawals/[id]` | Calls `processWithdrawal()` |

## Database Schema

### Extended Fields on `user` Table

| Column | Type | Description |
|--------|------|-------------|
| `referralCode` | text, unique | User's own referral code (lazy-generated) |
| `referredByCode` | text | Code of the referrer who brought this user |
| `commissionBalance` | numeric, default "0" | Cash commission balance available for withdrawal |
| `kycVerified` | boolean, default true | KYC gate for withdrawals (future expansion) |

### `commission` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | Unique commission ID |
| `referrerId` | text FK→user | The referrer earning the commission |
| `orderId` | text FK→order | The order that triggered the commission |
| `buyerId` | text | The buyer who made the purchase |
| `orderAmount` | text | Original order amount |
| `currency` | text | Order currency |
| `commissionRate` | text | Rate applied (e.g. "0.20") |
| `commissionAmount` | text | Computed commission amount |
| `status` | text | `credited`, `withdrawn`, `cancelled` |

### `withdrawal` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | Unique withdrawal ID |
| `userId` | text FK→user | Requesting user |
| `amount` | text | Withdrawal amount |
| `currency` | text | Currency |
| `paymentMethod` | text | e.g. `alipay`, `bank_transfer` |
| `paymentAccount` | text | Account identifier |
| `status` | text | `pending`, `processing`, `completed`, `rejected` |
| `processedBy` | text | Admin who processed it |
| `adminNote` | text | Admin notes |

## Configuration Reference

All values are configurable via environment variables with sensible defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `AFFILIATE_ENABLED` | `false` | Master switch; set to `true` to enable the system |
| `AFFILIATE_COMMISSION_RATE` | `0.20` | Percentage commission (0–1 range) |
| `AFFILIATE_FIXED_COMMISSION_AMOUNT` | `0` | Fixed amount override (0 = use percentage) |
| `AFFILIATE_COOKIE_EXPIRY_DAYS` | `30` | Referral cookie lifetime |
| `AFFILIATE_MIN_WITHDRAWAL` | `100` | Minimum withdrawal amount |
| `AFFILIATE_REFERRER_SIGNUP_BONUS` | `10` | Credits granted to referrer on signup |
| `AFFILIATE_REFEREE_SIGNUP_BONUS` | `10` | Credits granted to referee on signup |

## Testing Instructions

```bash
# E2E tests cover the full affiliate flow
npx playwright test --config=tests/e2e/playwright.config.ts --grep "Affiliate"

# Test files:
# - tests/e2e/specs/affiliate.spec.ts       (8 user-facing tests)
# - tests/e2e/specs/admin-affiliate.spec.ts  (5 admin tests)
```

## Troubleshooting

### Commission Not Created

- Verify `AFFILIATE_ENABLED=true` is configured
- Check that order metadata contains `{ referralCode, referrerId }` (set during payment initiation)
- Look for `[Affiliate][Commission]` log entries in the server console
- Ensure `processReferralCommission(orderId)` is called in the payment webhook

### Referral Code Not Claimed

- Cookie `referral_code` must be set before the claim API is called
- User cannot claim their own code (self-referral blocked)
- Each user can only claim once (`already_claimed`)
- The referral code must belong to an existing user (`invalid_referrer`)

### SQLite Compatibility

- All SQL uses `CAST(... AS REAL)` / `CAST(... AS INTEGER)` — never PG-specific `::numeric` / `::int`
- Tested on both PostgreSQL and SQLite across all three frameworks

## Architecture Notes

- **No Service Class**: Pure exported functions (unlike credits module) — simpler for a smaller surface area
- **Idempotent Commission**: `processReferralCommission` checks for existing commission by `orderId` before creating
- **Immediate Balance Deduction**: Withdrawal requests deduct from `commissionBalance` immediately; rejected withdrawals refund
- **First-Touch Attribution**: Cookie-based, set on first visit with `?ref=` parameter, claimed on dashboard mount
- **Feature Flag**: `config.affiliate.enabled` controls UI visibility, API access, and webhook processing
- **Cross-DB**: All raw SQL uses ANSI `CAST()` for PostgreSQL + SQLite compatibility
- **Consumed by**: All three apps (Next.js, Nuxt.js, TanStack Start) via `@libs/affiliate` path alias
