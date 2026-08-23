# @libs/affiliate

Cash-commission referral system for TinyShip. Enables users to earn commissions by referring new customers, with mutual signup credit bonuses and a managed withdrawal flow.

## Features

- **Referral Codes** — Unique 8-char codes generated per user (lazy, via nanoid)
- **Cookie Attribution** — First-touch attribution via `?ref=CODE` URL parameter → cookie
- **Cash Commission** — Percentage-based (default 20%) or fixed amount on every referred purchase
- **Signup Bonuses** — Mutual credit bonuses for referrer and referee (via `@libs/credits`)
- **Withdrawal Management** — User request → admin approval, with immediate balance deduction and rejection refund
- **Feature Flag** — Disabled by default; enable explicitly with `AFFILIATE_ENABLED=true`
- **Cross-DB** — Works on both PostgreSQL and SQLite (standard SQL `CAST()` syntax)

## Quick Start

```typescript
import {
  generateReferralCode,
  applyReferralCodeToUser,
  processReferralCommission,
  requestWithdrawal,
  processWithdrawal,
} from '@libs/affiliate';
```

### Generate a Referral Code

```typescript
const code = await generateReferralCode(userId);
// Returns existing code or generates a new one
```

### Claim a Referral (on signup/dashboard mount)

```typescript
const result = await applyReferralCodeToUser({ userId, referralCode });
// result.applied === true → referral recorded, bonuses granted
```

### Process Commission (in payment webhook)

```typescript
const result = await processReferralCommission(orderId);
// Idempotent: safe to call multiple times for the same order
```

### Request Withdrawal (user action)

```typescript
const result = await requestWithdrawal({
  userId, amount: 150, paymentMethod: 'alipay', paymentAccount: 'user@email.com',
});
```

### Process Withdrawal (admin action)

```typescript
const result = await processWithdrawal({
  withdrawalId, status: 'completed', processedBy: adminId,
});
```

## Configuration

All values configured via environment variables with sensible defaults. See `config/affiliate.ts`.

| Variable | Default | Description |
|----------|---------|-------------|
| `AFFILIATE_ENABLED` | `false` | Master switch; set to `true` to enable |
| `AFFILIATE_COMMISSION_RATE` | `0.20` | Commission percentage (0–1) |
| `AFFILIATE_FIXED_COMMISSION_AMOUNT` | `0` | Fixed amount override |
| `AFFILIATE_CURRENCY` | `USD` | Settlement currency (ISO 4217) |
| `AFFILIATE_MIN_WITHDRAWAL` | `100` | Minimum withdrawal amount |
| `AFFILIATE_REFERRER_SIGNUP_BONUS` | `10` | Credits for referrer on signup |
| `AFFILIATE_REFEREE_SIGNUP_BONUS` | `10` | Credits for referee on signup |
| `AFFILIATE_COOKIE_EXPIRY_DAYS` | `30` | Referral cookie lifetime |

> **Single-currency only:** `commissionBalance` is a flat numeric field without currency bucketing. All plans participating in the affiliate program **must** use the same currency as `AFFILIATE_CURRENCY`. Mixing currencies will produce incorrect totals.

## Database Requirements

Requires three schema additions (both PG and SQLite variants exist):

- **user table** — `referralCode`, `referredByCode`, `commissionBalance`, `kycVerified` columns
- **commission table** — Tracks per-order commission records
- **withdrawal table** — Tracks withdrawal requests and admin processing

Run `pnpm db:generate && pnpm db:push` after pulling changes.

## Documentation

- [AGENTS.md](./AGENTS.md) — Architecture reference for AI agents
- [User Guide](../../docs/user-guide/affiliate.md) — Configuration and usage guide
- [Implementation](../../docs/implementation/affiliate-system.md) — Technical design details
