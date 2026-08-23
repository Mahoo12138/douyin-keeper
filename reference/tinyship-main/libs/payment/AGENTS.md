# AGENTS.md

## Overview

Unified payment integration library supporting WeChat Pay, Stripe, Creem, Alipay, and PayPal payment providers. Handles one-time payments, recurring subscriptions, and **credit purchases** with webhook processing, database integration, and automated plan configuration from `@config`. Includes a complete credit system for AI-powered features with consumption tracking.

## Setup Commands

```bash
# Environment variables (add to .env based on chosen providers):

# WeChat Pay (China market, CNY only)
WECHAT_PAY_APP_ID=wx1234567890abcdef
WECHAT_PAY_MCH_ID=1234567890
WECHAT_PAY_API_KEY=your-32-char-api-key
WECHAT_PAY_NOTIFY_URL=https://yourdomain.com/api/payment/webhook/wechat
WECHAT_PAY_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
WECHAT_PAY_PUBLIC_KEY="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"

# Stripe (Global market)
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Creem (Global market, developer-friendly)
CREEM_API_KEY=creem_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CREEM_SERVER_URL=https://api.creem.io
CREEM_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Alipay (China market, CNY only)
# Reference: https://opendocs.alipay.com/open/00dn7o (Sandbox environment)
# Keys use Base64 string format (no PEM headers)
ALIPAY_APP_ID=2021000000000000
ALIPAY_APP_PRIVATE_KEY="MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC..."
ALIPAY_PUBLIC_KEY="MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAgatiwfGM3RTw..."
ALIPAY_NOTIFY_URL=https://yourdomain.com/api/payment/webhook/alipay
ALIPAY_SANDBOX=false  # Set to "true" for sandbox testing

# PayPal (Global market, supports subscriptions)
# Reference: https://developer.paypal.com/docs/checkout/
# Get credentials from: https://developer.paypal.com/dashboard/applications
PAYPAL_CLIENT_ID=AYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAYPAL_CLIENT_SECRET=ELxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAYPAL_WEBHOOK_ID=WH-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAYPAL_SANDBOX=true  # Set to "false" for production

# No additional installation - configured via @config
```

## Code Style

- Factory pattern: `createPaymentProvider<T>(provider)` for type-safe provider instantiation
- Unified interface: `PaymentProvider` with `createPayment()` and `handleWebhook()` methods
- Configuration integration: Payment plans from `config.payment.plans` with auto-pricing page generation
- Database integration: Orders and subscriptions tracked via `@libs/database`
- Multi-currency support: CNY (WeChat/Alipay), USD/EUR (Stripe/Creem/PayPal)
- Webhook verification: Provider-specific signature validation

## Usage Examples

### Basic Payment Flow
```typescript
import { createPaymentProvider } from '@libs/payment';

// Factory function creates type-safe provider instances
const stripeProvider = createPaymentProvider('stripe');
const wechatProvider = createPaymentProvider('wechat');
const creemProvider = createPaymentProvider('creem');
const alipayProvider = createPaymentProvider('alipay');

// Create payment (unified interface)
const paymentResult = await stripeProvider.createPayment({
  planId: 'monthly',          // Must exist in config.payment.plans
  userId: 'user_123',
  orderId: 'ord_456',
  amount: 10,                 // Display amount (actual amount from plan config)
  currency: 'USD',
  metadata: { customField: 'value' }
});

// Redirect user to payment URL
window.location.href = paymentResult.paymentUrl;
```

### Webhook Handling
```typescript
// API route: /api/payment/webhook/stripe
import { createPaymentProvider } from '@libs/payment';

export async function POST(request: Request) {
  const provider = createPaymentProvider('stripe');
  
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature') || '';
  
  const verification = await provider.handleWebhook(payload, signature);
  
  if (verification.success) {
    console.log('Payment successful for order:', verification.orderId);
    // Database is automatically updated via provider implementation
    return new Response('OK', { status: 200 });
  }
  
  return new Response('Webhook verification failed', { status: 400 });
}
```

### Payment Plan Configuration (config.ts)
```typescript
// config.ts - Plans auto-appear on /pricing page
export const config = {
  payment: {
    plans: {
      // WeChat Pay (one-time only)
      monthlyWechat: {
        provider: 'wechat',
        id: 'monthlyWechat',
        amount: 0.01,
        currency: 'CNY',
        duration: { months: 1, type: 'one_time' },
        i18n: {
          'en': { name: 'WeChat Monthly', description: '...', features: [...] },
          'zh-CN': { name: '微信月度', description: '...', features: [...] }
        }
      },
      
      // Stripe (recurring subscription)
      monthly: {
        provider: 'stripe',
        id: 'monthly',
        amount: 10,
        currency: 'USD',
        duration: { months: 1, type: 'recurring' },
        stripePriceId: 'price_1RL2GgDjHLfDWeHDBHjoZaap', // Required for Stripe
        i18n: { /* ... */ }
      },
      
      // Creem (recurring subscription)
      monthlyCreem: {
        provider: 'creem',
        id: 'monthlyCreem',
        amount: 10,
        currency: 'USD',
        duration: { months: 1, type: 'recurring' },
        creemProductId: 'prod_1M1c4ktVmvLgrNtpVB9oQf', // Required for Creem
        i18n: { /* ... */ }
      },
      
      // Alipay (one-time only, similar to WeChat Pay)
      monthlyAlipay: {
        provider: 'alipay',
        id: 'monthlyAlipay',
        amount: 0.01,
        currency: 'CNY',
        duration: { months: 1, type: 'one_time' },
        i18n: {
          'en': { name: 'Alipay Monthly', description: '...', features: [...] },
          'zh-CN': { name: '支付宝月度', description: '...', features: [...] }
        }
      }
    }
  }
};
```

### Stripe Customer Portal
```typescript
// Stripe provider includes customer portal access
const stripeProvider = createPaymentProvider('stripe');

if (stripeProvider.createCustomerPortal) {
  const portalSession = await stripeProvider.createCustomerPortal(
    'cus_customer_id',
    'https://yourapp.com/dashboard'
  );
  
  window.location.href = portalSession.url;
}
```

### Credit System Usage
```typescript
import { creditService, calculateCreditConsumption, safeNumber, TransactionTypeCode } from '@libs/credits';

// Get user credit balance
const balance = await creditService.getBalance(userId);

// Add credits (called automatically on credit purchase via webhook)
await creditService.addCredits({
  userId: 'user_123',
  amount: 100,
  description: TransactionTypeCode.PURCHASE,
  relatedOrderId: 'order_456',
  metadata: { provider: 'stripe', planId: 'credits100' }
});

// Consume credits (e.g., for AI chat)
const totalTokens = safeNumber(usageData.totalTokens);
const creditsToConsume = calculateCreditConsumption({
  totalTokens,
  model: 'qwen-turbo',
  provider: 'qwen'
});

const result = await creditService.consumeCredits({
  userId: 'user_123',
  amount: creditsToConsume,
  description: TransactionTypeCode.AI_CHAT,
  metadata: { model: 'qwen-turbo', tokens: totalTokens }
});

// Get credit transaction history
const transactions = await creditService.getTransactions(userId, { page: 1, limit: 10 });

// Get complete user status (credits + subscription)
const status = await creditService.getStatus(userId);
```

### Credit Plan Configuration (config.ts)
```typescript
// Credit purchase plans
credits100: {
  provider: 'stripe',
  id: 'credits100',
  amount: 10,
  currency: 'USD',
  duration: { type: 'credits', credits: 100 },
  stripePriceId: 'price_xxx',
  i18n: { /* ... */ }
},

// Credit consumption configuration
credits: {
  consumptionMode: 'dynamic',           // 'fixed' or 'dynamic'
  fixedChatCost: 10,                    // Credits per chat (fixed mode)
  dynamicChatCostPerKiloToken: 1,       // Credits per 1K tokens (dynamic mode)
  modelMultipliers: {                   // Cost multipliers by AI model
    'qwen-turbo': 1.0,
    'gpt-4': 2.0,
    'default': 1.0
  }
}
```

## Common Tasks

### Provider Capabilities
- **WeChat Pay**: One-time payments and credit purchases, CNY currency, requires business license
- **Stripe**: Full subscription management, credit purchases, global currencies, customer portal
- **Creem**: Developer-friendly, credit purchases, global currencies, simplified onboarding
- **Alipay**: One-time payments and credit purchases, CNY currency, uses official `alipay-sdk`
- **PayPal**: Full subscription management, credit purchases, global currencies, requires manual capture

### Payment Types
- **One-time**: Single payment (supported by all providers)
- **Recurring**: Subscription billing (Stripe, Creem, and PayPal)
- **Credits**: One-time credit purchase with automatic balance update (all providers)

### Database Operations
- **Orders**: Created automatically on payment initiation
- **Subscriptions**: Created/updated via webhook processing
- **Credits**: User balance updated on successful credit purchase
- **Credit Transactions**: Full audit trail of all credit operations
- **Status Tracking**: `pending` → `paid`/`failed` status updates

### Add New Payment Plan
1. Add plan configuration to `config.payment.plans`
2. Set provider-specific IDs (`stripePriceId` or `creemProductId`)
3. Configure i18n content for display
4. Plan automatically appears on pricing page

### Add New Payment Provider
1. Implement `PaymentProvider` interface in `providers/`
2. Add provider type to `PaymentProviderType` union
3. Update `createPaymentProvider` factory function
4. Add environment variable configuration to `config.ts`

## Testing Instructions

```bash
# Test different providers and payment types:
# 1. Configure provider credentials (use test/sandbox modes)
# 2. Create test payment plans in config.ts
# 3. Test payment flow: initiation → webhook → database update

# WeChat Pay: Uses real 0.01 CNY payments (no sandbox)
# Stripe: Use test mode keys (sk_test_..., pk_test_...)
# Creem: Use test mode credentials
# Alipay: Use sandbox credentials from Alipay Open Platform

# Webhook testing with tools like ngrok for local development
# Verify signature validation and database updates
```

## Troubleshooting

### Environment Configuration
- Verify provider credentials are valid and match environment (test/live)
- Check webhook URLs are publicly accessible (use ngrok for local testing)
- Ensure certificate formats are correct for WeChat Pay (PEM with \n)

### Payment Plan Issues
- Confirm `stripePriceId`, `creemProductId`, or `paypalPlanId` exist in provider dashboards
- Verify plan `id` matches exactly in payment requests
- Check currency compatibility with chosen provider

### Webhook Problems
- Validate webhook signatures match provider requirements
- Ensure webhook endpoints return 200 status for successful processing
- Check database permissions for order/subscription updates

### Database Errors
- Verify `@libs/database` connection and schema
- Check foreign key constraints (planId must exist in config)
- Ensure `amount` fields use string format for numeric database type

### Provider-Specific Issues
- **WeChat Pay**: Certificate validation, public key configuration
- **Stripe**: API version compatibility, webhook endpoint setup
- **Creem**: API key permissions, product configuration
- **Alipay**: Private key format (PEM), public key for signature verification, webhook returns "success"/"fail" plain text
- **PayPal**: Plan ID must be pre-created in PayPal Dashboard, requires explicit capture after user approval, sandbox/production URL differences

## Architecture Notes

- **Multi-Provider Design**: Factory pattern with unified interface abstracts provider differences
- **Configuration-Driven**: Payment plans defined in `@config` auto-generate pricing UI
- **Dual Payment Model**: Traditional subscriptions + AI-era credit system running in parallel
- **Database Integration**: Automatic order/subscription/credit tracking via `@libs/database`
- **Credit System**: Complete implementation via `@libs/credits` with balance management, consumption tracking, and transaction history
- **Consumption Modes**: Fixed (per-operation) and dynamic (per-token) credit consumption with model multipliers
- **Webhook Security**: Provider-specific signature verification for payment confirmation
- **Type Safety**: Generic factory function ensures compile-time provider type checking
- **Internationalization**: Built-in i18n support for payment plan display content
- **Currency Flexibility**: Multi-currency support with provider-specific constraints
- **Subscription Management**: Full lifecycle support (create, update, cancel, portal access)
- **Modular Architecture**: Easy to add new providers without changing existing code
- **Error Handling**: Comprehensive error types and validation for payment operations
- **Safe Number Handling**: Utility functions to prevent NaN/Infinity in credit calculations
- **Development Experience**: Test mode support with detailed logging and debugging info
