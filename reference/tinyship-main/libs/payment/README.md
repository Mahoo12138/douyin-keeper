# TinyShip 支付集成库

**中文** | [English](./README_EN.md)

这是一个统一的支付集成解决方案，支持微信支付、Stripe、Creem 和支付宝四种支付方式，提供简单的工厂函数来创建支付提供商实例。

## 🔧 配置说明

### 支付计划配置

在 `config.ts` 中的 `payment.plans` 配置所有支付计划，这些计划会自动显示在定价页面：

```typescript
// config.ts
export const config = {
  payment: {
    plans: {
      // 微信支付计划（单次付费）
      monthlyWechat: {
        provider: 'wechat',
        id: 'monthlyWechat',
        amount: 0.01,
        currency: 'CNY',
        duration: { months: 1, type: 'one_time' },
        i18n: { /* 多语言配置 */ }
      },
      
      // Stripe 订阅计划
      monthly: {
        provider: 'stripe',
        id: 'monthly',
        amount: 10,
        currency: 'USD',
        duration: { months: 1, type: 'recurring' },
        stripePriceId: 'price_1RL2GgDjHLfDWeHDBHjoZaap',
        i18n: { /* 多语言配置 */ }
      },
      
      // Creem 计划
      monthlyCreem: {
        provider: 'creem',
        id: 'monthlyCreem', 
        amount: 10,
        currency: 'USD',
        duration: { months: 1, type: 'recurring' },
        creemProductId: 'prod_1M1c4ktVmvLgrNtpVB9oQf',
        i18n: { /* 多语言配置 */ }
      },
      
      // 支付宝计划（单次付费）
      monthlyAlipay: {
        provider: 'alipay',
        id: 'monthlyAlipay',
        amount: 0.01,
        currency: 'CNY',
        duration: { months: 1, type: 'one_time' },
        i18n: { /* 多语言配置 */ }
      }
    }
  }
};
```

#### 计划字段说明

- `provider`: 支付提供商（`wechat`/`stripe`/`creem`）
- `id`: 计划唯一标识符
- `amount`: 显示金额
- `currency`: 币种（微信支付仅支持 CNY）
- `duration.type`: `one_time`（单次）或 `recurring`（订阅）
- `stripePriceId`: Stripe 价格 ID（必需，用于实际扣费）
- `creemProductId`: Creem 产品 ID（必需，用于实际扣费）
- `i18n`: 多语言显示内容（名称、描述、功能列表）

### 环境变量配置

系统通过 `config.ts` 自动加载环境变量，支持开发环境默认值和运行时验证。

#### 微信支付

```env
# 基础配置
WECHAT_PAY_APP_ID=wx1234567890abcdef
WECHAT_PAY_MCH_ID=1234567890
WECHAT_PAY_API_KEY=your-32-char-api-key
WECHAT_PAY_NOTIFY_URL=https://yourdomain.com/api/payment/webhook/wechat

# 商户证书（必需）
WECHAT_PAY_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
WECHAT_PAY_PUBLIC_KEY="-----BEGIN CERTIFICATE-----\n..."

# 微信支付公钥（推荐，提升性能）
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

#### 支付宝

```env
ALIPAY_APP_ID=2021000000000000
# 纯 Base64 字符串格式，不需要 PEM 头尾
ALIPAY_APP_PRIVATE_KEY="MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC..."
ALIPAY_PUBLIC_KEY="MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAgatiwfGM3RTw..."
ALIPAY_NOTIFY_URL=https://yourdomain.com/api/payment/webhook/alipay
ALIPAY_SANDBOX=false  # 设置为 "true" 使用沙盒环境
```

## 🎯 支持的支付方式

| 支付方式 | 单次付费 | 订阅付费 | 支付方式 | 主要市场 | 币种支持 |
|---------|---------|---------|---------|---------|---------|
| WeChat Pay | ✅ | ❌ | 二维码扫描 | 中国大陆 | CNY |
| Alipay | ✅ | ❌ | 页面跳转 | 中国大陆 | CNY |
| Stripe | ✅ | ✅ | 页面跳转 | 全球 | 多币种 |
| Creem | ✅ | ✅ | 页面跳转 | 全球 | USD, EUR等 |

## 📁 目录结构

```
libs/payment/
├── providers/           # 支付提供商实现
│   ├── wechat.ts       # 微信支付（二维码）
│   ├── alipay.ts       # 支付宝（页面跳转）
│   ├── stripe.ts       # Stripe（结账会话）
│   └── creem.ts        # Creem（结账会话）
├── types.ts            # TypeScript 类型定义
└── index.ts            # 工厂函数导出
```

## 💻 使用方法

### 统一的提供商创建

```typescript
import { createPaymentProvider } from '@libs/payment';

// 创建不同的支付提供商实例
const stripeProvider = createPaymentProvider('stripe');
const wechatProvider = createPaymentProvider('wechat');
const creemProvider = createPaymentProvider('creem');
const alipayProvider = createPaymentProvider('alipay');
```

### 发起支付

```typescript
// Stripe/Creem 支付（页面跳转）
const stripeResult = await stripeProvider.createPayment({
  orderId: 'order_123',
  userId: 'user_123',
  planId: 'monthly',
  amount: 10,
  currency: 'USD',
  provider: 'stripe'
});

// 跳转到支付页面
window.location.href = stripeResult.paymentUrl;

// 微信支付（二维码扫描）
const wechatResult = await wechatProvider.createPayment({
  orderId: 'order_456',
  userId: 'user_123',
  planId: 'monthlyWechat',
  amount: 0.01,
  currency: 'CNY',
  provider: 'wechat'
});

// 显示二维码供用户扫描
console.log('WeChat QR Code URL:', wechatResult.paymentUrl);

// 支付宝支付（页面跳转）
const alipayResult = await alipayProvider.createPayment({
  orderId: 'order_789',
  userId: 'user_123',
  planId: 'monthlyAlipay',
  amount: 0.01,
  currency: 'CNY',
  provider: 'alipay'
});

// 跳转到支付宝页面（通过 data URL 包含的 HTML 表单自动提交）
window.location.href = alipayResult.paymentUrl;
```

### Webhook 处理

```typescript
// 处理支付回调通知
const result = await provider.handleWebhook(
  req.body,
  req.headers['stripe-signature'] // 签名验证
);
```

## ⚙️ 应用集成

### 前端支付界面

#### 定价页面
- **Next.js**: 参考 `apps/next-app/app/[lang]/(root)/pricing/page.tsx`
- **Nuxt.js**: 参考 `apps/nuxt-app/pages/pricing.vue`
- 显示 `config.payment.plans` 中配置的所有计划
- 用户选择计划后调用支付发起 API

#### 微信支付二维码组件
- **Next.js**: 参考 `apps/next-app/components/` 中的支付组件  
- **Nuxt.js**: 参考 `apps/nuxt-app/components/` 中的支付组件
- 显示二维码，轮询支付状态（每3秒检查一次）
- 支付成功后跳转到成功页面

### 支付发起 API

- **Next.js**: 参考 `apps/next-app/app/api/payment/initiate/route.ts`
- **Nuxt.js**: 参考 `apps/nuxt-app/server/api/payment/initiate.post.ts`
- **TanStack Start**: 参考 `apps/tanstack-app/src/routes/api/payment/initiate.ts`
- 创建订单记录，生成支付 URL（Stripe/Creem）或二维码（微信）

### Webhook 处理 API

- **Next.js**: 参考 `apps/next-app/app/api/payment/webhook/[provider]/route.ts`
- **Nuxt.js**: 参考 `apps/nuxt-app/server/api/payment/webhook/[provider].post.ts`
- **TanStack Start**: 参考 `apps/tanstack-app/src/routes/api/payment/webhook/$provider.ts`
- 处理支付回调，更新订单状态，创建订阅记录

### 支付成功页面

- **前端页面**: `/payment-success` - 验证支付结果并显示成功信息

## 🔄 支付流程

### 核心流程

#### Stripe/Creem 流程（页面跳转）
```
用户选择计划 → 创建订单 → 跳转支付页面 → 
用户完成支付 → Webhook 回调 → 订单状态更新 → 订阅激活
```

#### 微信支付流程（二维码扫描）
```
用户选择计划 → 创建订单 → 生成二维码 → 用户扫码支付 → 
前端轮询状态 → Webhook 回调 → 订单状态更新 → 订阅激活
```

#### 支付宝流程（页面跳转）
```
用户选择计划 → 创建订单 → 跳转支付宝页面 → 用户登录支付 → 
同步返回 returnUrl → Webhook 异步通知 → 订单状态更新 → 订阅激活
```

### 订单状态

- `PENDING`: 订单已创建，等待支付
- `PAID`: Webhook 确认支付，订阅已创建  
- `FAILED`: 支付失败或验证失败
- `CANCELED`: 订单过期（2小时）或手动取消

### 关键特性

- **Webhook 驱动**: 订单状态仅在 Webhook 验证后更新
- **自动过期**: 订单2小时后自动过期，防止过期订单
- **类型安全**: 完整的 TypeScript 类型支持
- **统一接口**: 所有提供商使用相同的 API 结构


## 📚 参考文档

- [支付配置详细指南](../../docs/user-guide/payment.md) - 完整的环境变量配置和申请流程
- [微信支付开发文档](https://pay.weixin.qq.com/wiki/doc/api/index.html)
- [支付宝开放平台](https://open.alipay.com/)
- [Stripe 开发文档](https://stripe.com/docs)
- [Creem API 文档](https://docs.creem.io/)
