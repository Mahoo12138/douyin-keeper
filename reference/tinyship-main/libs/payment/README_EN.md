# TinyShip Payment Integration Library

[中文文档](./README.md) | **English**

This is a unified payment integration solution supporting WeChat Pay, Stripe, Creem, and Alipay payment methods, providing simple factory functions to create payment provider instances.

## 🔧 Configuration Guide

### Payment Plans Configuration

Configure all payment plans in `config.ts` under `payment.plans`. These plans will automatically appear on the pricing page:

```typescript
// config.ts
export const config = {
  payment: {
    plans: {
      // WeChat Pay plan (one-time payment)
      monthlyWechat: {
        provider: 'wechat',
        id: 'monthlyWechat',
        amount: 0.01,
        currency: 'CNY',
        duration: { months: 1, type: 'one_time' },
        i18n: { /* Multi-language configuration */ }
      },
      
      // Stripe subscription plan
      monthly: {
        provider: 'stripe',
        id: 'monthly',
        amount: 10,
        currency: 'USD',
        duration: { months: 1, type: 'recurring' },
        stripePriceId: 'price_1RL2GgDjHLfDWeHDBHjoZaap',
        i18n: { /* Multi-language configuration */ }
      },
      
      // Creem plan
      monthlyCreem: {
        provider: 'creem',
        id: 'monthlyCreem', 
        amount: 10,
        currency: 'USD',
        duration: { months: 1, type: 'recurring' },
        creemProductId: 'prod_1M1c4ktVmvLgrNtpVB9oQf',
        i18n: { /* Multi-language configuration */ }
      },
      
      // Alipay plan (one-time payment)
      monthlyAlipay: {
        provider: 'alipay',
        id: 'monthlyAlipay',
        amount: 0.01,
        currency: 'CNY',
        duration: { months: 1, type: 'one_time' },
        i18n: { /* Multi-language configuration */ }
      }
    }
  }
};
```

#### Plan Field Description

- `provider`: Payment provider (`wechat`/`stripe`/`creem`)
- `id`: Unique plan identifier
- `amount`: Display amount
- `currency`: Currency (WeChat Pay only supports CNY)
- `duration.type`: `one_time` or `recurring`
- `stripePriceId`: Stripe price ID (required for actual billing)
- `creemProductId`: Creem product ID (required for actual billing)
- `i18n`: Multi-language display content (name, description, features)

### Environment Variables Configuration

The system automatically loads environment variables through `config.ts`, supporting development defaults and runtime validation.

#### WeChat Pay

```env
# Basic configuration
WECHAT_PAY_APP_ID=wx1234567890abcdef
WECHAT_PAY_MCH_ID=1234567890
WECHAT_PAY_API_KEY=your-32-char-api-key
WECHAT_PAY_NOTIFY_URL=https://yourdomain.com/api/payment/webhook/wechat

# Merchant certificates (required)
WECHAT_PAY_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
WECHAT_PAY_PUBLIC_KEY="-----BEGIN CERTIFICATE-----\n..."

# WeChat Pay public key (recommended, improves performance)
WECHAT_PAY_PAYMENT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n..."
WECHAT_PAY_PUBLIC_KEY_ID="PUB_KEY_ID_0000000000000024101100397200000006"
```

#### Stripe

```env
STRIPE_SECRET_KEY=sk_test_xxxxxxxx
STRIPE_PUBLIC_KEY=pk_test_xxxxxxxx  
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxx
```

#### Creem

```env
CREEM_API_KEY=creem_xxxxxxxx
CREEM_SERVER_URL=https://api.creem.io
CREEM_WEBHOOK_SECRET=whsec_xxxxxxxx
```

#### Alipay

```env
ALIPAY_APP_ID=2021000000000000
# Base64 string format, no PEM headers required
ALIPAY_APP_PRIVATE_KEY="MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC..."
ALIPAY_PUBLIC_KEY="MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAgatiwfGM3RTw..."
ALIPAY_NOTIFY_URL=https://yourdomain.com/api/payment/webhook/alipay
ALIPAY_SANDBOX=false  # Set to "true" for sandbox testing
```

## 🎯 Supported Payment Methods

| Payment Method | One-time | Subscription | Payment Flow | Primary Market | Currency Support |
|---------------|----------|---------------|---------------|----------------|------------------|
| WeChat Pay | ✅ | ❌ | QR Code Scan | Mainland China | CNY |
| Alipay | ✅ | ❌ | Page Redirect | Mainland China | CNY |
| Stripe | ✅ | ✅ | Page Redirect | Global | Multi-currency |
| Creem | ✅ | ✅ | Page Redirect | Global | USD, EUR, etc. |

## 📁 Directory Structure

```
libs/payment/
├── providers/           # Payment provider implementations
│   ├── wechat.ts       # WeChat Pay (QR code)
│   ├── alipay.ts       # Alipay (page redirect)
│   ├── stripe.ts       # Stripe (checkout session)
│   └── creem.ts        # Creem (checkout session)
├── types.ts            # TypeScript type definitions
└── index.ts            # Factory function exports
```

## 💻 Usage

### Unified Provider Creation

```typescript
import { createPaymentProvider } from '@libs/payment';

// Create different payment provider instances
const stripeProvider = createPaymentProvider('stripe');
const wechatProvider = createPaymentProvider('wechat');
const creemProvider = createPaymentProvider('creem');
const alipayProvider = createPaymentProvider('alipay');
```

### Initiate Payment

```typescript
// Stripe/Creem Payment (Page Redirect)
const stripeResult = await stripeProvider.createPayment({
  orderId: 'order_123',
  userId: 'user_123',
  planId: 'monthly',
  amount: 10,
  currency: 'USD',
  provider: 'stripe'
});

// Redirect to payment page
window.location.href = stripeResult.paymentUrl;

// WeChat Pay (QR Code Scan)
const wechatResult = await wechatProvider.createPayment({
  orderId: 'order_456',
  userId: 'user_123',
  planId: 'monthlyWechat',
  amount: 0.01,
  currency: 'CNY',
  provider: 'wechat'
});

// Display QR code for user to scan
console.log('WeChat QR Code URL:', wechatResult.paymentUrl);

// Alipay Payment (Page Redirect)
const alipayResult = await alipayProvider.createPayment({
  orderId: 'order_789',
  userId: 'user_123',
  planId: 'monthlyAlipay',
  amount: 0.01,
  currency: 'CNY',
  provider: 'alipay'
});

// Redirect to Alipay page (via data URL containing auto-submitting HTML form)
window.location.href = alipayResult.paymentUrl;
```

### Webhook Handling

```typescript
// Handle payment callback notifications
const result = await provider.handleWebhook(
  req.body,
  req.headers['stripe-signature'] // Signature verification
);
```

## ⚙️ Application Integration

### Frontend Payment Interface

#### Pricing Page
- **Next.js**: See `apps/next-app/app/[lang]/(root)/pricing/page.tsx`
- **Nuxt.js**: See `apps/nuxt-app/pages/pricing.vue`
- Display all plans configured in `config.payment.plans`
- User selects plan and calls payment initiation API

#### WeChat Pay QR Code Component
- **Next.js**: See payment components in `apps/next-app/components/`
- **Nuxt.js**: See payment components in `apps/nuxt-app/components/`
- Display QR code, poll payment status (every 3 seconds)
- Redirect to success page after payment completion

### Payment Initiation API

- **Next.js**: See `apps/next-app/app/api/payment/initiate/route.ts`
- **Nuxt.js**: See `apps/nuxt-app/server/api/payment/initiate.post.ts`
- **TanStack Start**: See `apps/tanstack-app/src/routes/api/payment/initiate.ts`
- Create order record, generate payment URL (Stripe/Creem) or QR code (WeChat)

### Webhook Handling API

- **Next.js**: See `apps/next-app/app/api/payment/webhook/[provider]/route.ts`
- **Nuxt.js**: See `apps/nuxt-app/server/api/payment/webhook/[provider].post.ts`
- **TanStack Start**: See `apps/tanstack-app/src/routes/api/payment/webhook/$provider.ts`
- Handle payment callbacks, update order status, create subscription records

### Payment Success Page

- **Frontend Page**: `/payment-success` - Verify payment results and display success information

## 🔄 Payment Flow

### Core Process

#### Stripe/Creem Flow (Page Redirect)
```
User selects plan → Create order → Redirect to payment page → 
User completes payment → Webhook callback → Order status update → Subscription activation
```

#### WeChat Pay Flow (QR Code Scan)
```
User selects plan → Create order → Generate QR code → User scans and pays → 
Frontend polls status → Webhook callback → Order status update → Subscription activation
```

#### Alipay Flow (Page Redirect)
```
User selects plan → Create order → Redirect to Alipay page → User logs in and pays → 
Sync redirect to returnUrl → Webhook async notification → Order status update → Subscription activation
```

### Order Status

- `PENDING`: Order created, awaiting payment
- `PAID`: Webhook confirmed payment, subscription created
- `FAILED`: Payment failed or verification failed
- `CANCELED`: Order expired (2 hours) or manually canceled

### Key Features

- **Webhook Driven**: Order status only updated after webhook verification
- **Auto Expiration**: Orders automatically expire after 2 hours to prevent stale orders
- **Type Safety**: Complete TypeScript type support
- **Unified Interface**: All providers use the same API structure


## 📚 Reference Documentation

- [Payment Configuration Guide](../../docs/user-guide/payment.md) - Complete environment variable configuration and application process
- [WeChat Pay Developer Documentation](https://pay.weixin.qq.com/wiki/doc/api/index.html)
- [Alipay Open Platform](https://open.alipay.com/)
- [Stripe Developer Documentation](https://stripe.com/docs)
- [Creem API Documentation](https://docs.creem.io/)