# AGENTS.md

## Overview

Credits management library for token-based consumption model. Provides balance tracking, transaction logging, and consumption calculation for AI chat and other features. Works alongside the existing subscription system as an alternative payment model.

## Setup Commands

```bash
# Database migration required after adding this library
pnpm db:generate
pnpm db:push

# No additional package installation needed
# Uses existing @libs/database for data persistence
```

## Code Style

- Singleton service pattern: `creditService` for easy import
- Transaction-safe operations using Drizzle ORM transactions
- Numeric amounts stored as strings for precision
- Dual consumption modes: fixed or dynamic (token-based)
- Comprehensive transaction logging with metadata

## Usage Examples

### Basic Operations

```typescript
import { creditService, calculateCreditConsumption } from '@libs/credits';

// Get user's credit balance
const balance = await creditService.getBalance(userId);

// Check if user has enough credits
const canProceed = await creditService.hasEnoughCredits(userId, 5);

// Add credits (after payment)
await creditService.addCredits({
  userId,
  amount: 100,
  type: 'purchase',
  orderId: 'ord_123',
  description: 'Purchased 100 credits'
});

// Consume credits
const result = await creditService.consumeCredits({
  userId,
  amount: 1,
  description: 'AI chat consumption',
  metadata: { provider: 'qwen', model: 'qwen-turbo', totalTokens: 500 }
});

if (result.success) {
  console.log('New balance:', result.newBalance);
}
```

### Dynamic Consumption Calculation

```typescript
import { calculateCreditConsumption, isDynamicMode } from '@libs/credits';

// After AI response completes
const usage = await result.usage; // From Vercel AI SDK

const creditsToConsume = calculateCreditConsumption({
  totalTokens: usage.totalTokens,
  model: 'qwen-turbo',
  provider: 'qwen'
});

console.log(`Consuming ${creditsToConsume} credits for ${usage.totalTokens} tokens`);
```

### Transaction History

```typescript
// Get recent transactions
const transactions = await creditService.getTransactions(userId, {
  limit: 20,
  offset: 0,
  type: 'consumption' // Optional filter
});

// Get credit status summary
const status = await creditService.getStatus(userId);
console.log(`Balance: ${status.balance}, Purchased: ${status.totalPurchased}, Used: ${status.totalConsumed}`);
```

## Common Tasks

### Credit Transaction Types

| Type | Description | Amount Sign |
|------|-------------|-------------|
| `purchase` | Credits bought via payment | Positive |
| `bonus` | Free credits awarded | Positive |
| `refund` | Credits returned | Positive |
| `consumption` | Credits used | Negative |
| `adjustment` | Admin manual change | Either |

### Consumption Modes

**Fixed Mode** (`config.credits.consumptionMode: 'fixed'`):
- Each AI chat consumes a fixed amount (e.g., 1 credit)
- Simple and predictable for users
- Good for basic usage patterns

**Dynamic Mode** (`config.credits.consumptionMode: 'dynamic'`):
- Credits calculated based on actual token usage
- Fair pricing: short chats cost less, long chats cost more
- Model multipliers for premium/economy pricing
- Formula: `ceil((totalTokens / tokensPerCredit) * modelMultiplier)`

### Integration Points

1. **Payment Webhook**: Call `creditService.addCredits()` after credit pack purchase
2. **Chat API**: Call `calculateCreditConsumption()` and `creditService.consumeCredits()` after AI response
3. **Middleware**: Call `creditService.hasEnoughCredits()` to gate access
4. **Dashboard**: Call `creditService.getStatus()` to display balance

## Testing Instructions

```bash
# 1. Run database migrations
pnpm db:generate
pnpm db:push

# 2. Test via API endpoints or Drizzle Studio
pnpm db:studio

# 3. Manual testing flow:
# - Add credits to test user
# - Verify balance increased
# - Consume credits
# - Check transaction history
```

## Troubleshooting

### Balance Issues
- Verify transaction records in `credit_transaction` table
- Check for failed transactions that didn't complete
- Ensure `creditBalance` field exists on user table

### Consumption Calculation
- Check `config.credits.consumptionMode` setting
- Verify model multipliers for dynamic mode
- Ensure token usage is being passed correctly

### Database Errors
- Run `pnpm db:generate` after schema changes
- Check foreign key constraints
- Verify user exists before credit operations

## Architecture Notes

- **Service Layer**: `CreditService` class handles all credit operations
- **Calculator**: Separate module for consumption calculations
- **Transaction Safety**: All balance changes use database transactions
- **Audit Trail**: Every credit change creates a transaction record
- **Balance Snapshots**: Each transaction stores post-transaction balance
- **Metadata Storage**: JSONB field for storing AI usage details
- **Precision**: Uses string storage for numeric amounts

