# TinyShip Database Module

[中文文档](./README.md) | **English**

This module uses Drizzle ORM to manage interactions with PostgreSQL database, providing simple and easy-to-use data access interfaces.

## Usage

### Prerequisites

Make sure you have set up the database connection information in your `.env` file:

```env
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/tinyship"
```

### Usage in Applications

```typescript
// Import database client and models
import { db, user, account, session, verification, subscription, order } from "@libs/database";
import { eq } from "drizzle-orm";

// Query users
const userResult = await db.select().from(user).where(eq(user.email, "user@example.com"));

// Query user's authentication accounts
const userAccounts = await db.select().from(account).where(eq(account.userId, userResult[0].id));

// Create subscription
await db.insert(subscription).values({
  id: "sub_" + crypto.randomUUID(),
  userId: userResult[0].id,
  planId: "monthly", // Corresponds to plan ID in config.payment.plans
  status: "active",
  paymentType: "one_time",
  periodStart: new Date(),
  periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days later
});

// Create payment order
await db.insert(order).values({
  id: "ord_" + crypto.randomUUID(),
  userId: userResult[0].id,
  amount: "100", // Use string type for numeric fields
  currency: "CNY",
  planId: "monthly", // Corresponds to plan ID in config.payment.plans
  provider: "wechat",
  status: "pending"
});
```

## Data Models

### Users

User table manages user account information in the application, including:
- **Basic Information**: `id`, `name`, `email`, `image`
- **Authentication**: `emailVerified` email verification status
- **User Role**: `role` (admin/user)
- **Phone Related**: `phoneNumber`, `phoneNumberVerified`
- **Payment Customer IDs**: `stripeCustomerId`, `creemCustomerId`
- **Admin Features**: `banned`, `banReason`, `banExpires` (Better-Auth admin features)
- **Timestamps**: `createdAt`, `updatedAt`

### Account

Account table stores user authentication information, supporting multiple authentication methods:
- **OAuth Authentication**: Stores access tokens, refresh tokens, etc.
- **Credential Authentication**: Stores user passwords (encrypted)
- **Provider Information**: `providerId` (Google, GitHub, WeChat, etc.)
- **Token Management**: `accessToken`, `refreshToken`, `idToken`
- **Expiration Times**: `accessTokenExpiresAt`, `refreshTokenExpiresAt`
- **Authorization Scope**: `scope` OAuth permission scope

### Verification

Verification table manages various verification requests:
- **Email Verification**: New user registration email verification
- **Password Reset**: Forgot password reset tokens
- **Phone Verification**: SMS verification codes
- **Expiration Management**: `expiresAt` automatically cleans expired verification requests

### Sessions

Session table manages user login sessions, tracking:
- **Session Identifiers**: `id`, `token` unique session tokens
- **Expiration Time**: `expiresAt`
- **User Device**: `ipAddress`, `userAgent`
- **Identity Impersonation**: `impersonatedBy` (Better-Auth feature)
- **Timestamps**: `createdAt`, `updatedAt`

### Subscriptions

Subscription table tracks user payment and subscription information:
- **Plan Information**: `planId` corresponds to ID in `config.payment.plans`
- **Subscription Status**: `status` (active, canceled, past_due, unpaid, trialing, inactive)
- **Payment Type**: `paymentType` (one_time, recurring)
- **Payment Platforms**: `stripeCustomerId`, `stripeSubscriptionId`, `creemCustomerId`, `creemSubscriptionId`
- **Subscription Period**: `periodStart`, `periodEnd`, `cancelAtPeriodEnd`
- **Metadata**: `metadata` stores additional information

### Orders

Order table manages all payment transaction records:
- **Basic Information**: `amount` (numeric), `currency`, `planId`
- **Payment Status**: `status` (pending, paid, failed, refunded, canceled)
- **Payment Provider**: `provider` (wechat, stripe, creem)
- **Platform Order ID**: `providerOrderId` payment platform's order ID
- **Metadata**: `metadata` (JSON) additional information returned by payment platforms
- **Timestamps**: `createdAt`, `updatedAt`

## Database Management Commands

Database can be managed through commands from the root directory:

```bash
# Check database connection
pnpm db:check

# Generate database migration files (using drizzle-kit)
pnpm db:generate

# Push database schema to database (using drizzle-kit)
pnpm db:push

# Apply database migrations
pnpm db:migrate

# Start Drizzle Studio visual interface
pnpm db:studio

# Seed test data
pnpm db:seed
```

### Drizzle Studio

Drizzle Studio provides a visual interface to view and modify database content. Start it using the `pnpm db:studio` command,
then access the provided URL in your browser (usually https://local.drizzle.studio).

Through Studio you can:
- Browse database tables and records
- Add, edit and delete records
- View table relationships
- Execute basic queries

## Important Notes

### Field Type Descriptions

- **`amount` Field**: Uses `numeric` type, requires string when inserting (e.g., `"100"`)
- **`id` Field**: All tables use `text` type primary keys, recommend using UUID format
- **`planId` Field**: Must correspond to plan IDs defined in `config.payment.plans`
- **Timestamps**: Most tables automatically set `createdAt` and `updatedAt`

### Data Consistency

- Subscriptions and orders must be associated with valid user IDs
- Payment platform customer IDs and subscription IDs should be consistent
- Subscription status changes need to update related order statuses accordingly

### Best Practices

1. Use transactions for complex data operations
2. Regularly clean up expired verification records
3. Add appropriate database indexes for important queries
4. Regularly backup the database in production environments

## Reference Documentation

- [Drizzle ORM Official Documentation](https://orm.drizzle.team/) - Query building, relationship definitions, migrations, etc.
- [Drizzle Kit Documentation](https://orm.drizzle.team/kit-docs/overview) - Database migration and management tools
- [PostgreSQL Documentation](https://www.postgresql.org/docs/) - PostgreSQL database reference
- [Database Configuration Guide](../../docs/user-guide/database.md) - Project-specific configuration instructions
