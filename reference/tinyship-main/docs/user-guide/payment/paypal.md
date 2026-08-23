# PayPal 配置

PayPal 是覆盖全球市场的支付平台，支持单次付款与订阅模式。

## 📑 目录

- [📋 申请流程](#-申请流程)
- [🔑 环境变量配置](#-环境变量配置)
- [💡 一次性付费与订阅差异](#-一次性付费与订阅差异)
- [🧪 Sandbox 沙盒说明](#-sandbox-沙盒说明)
- [🔔 Webhook 事件](#-webhook-事件)
- [🛠️ 计划配置示例](#️-计划配置示例)
- [🔄 支付流程](#-支付流程)
- [⚠️ 注意事项](#️-注意事项)

## 📋 申请流程

1. **注册 PayPal Developer 账号**
   - 访问 [PayPal Developer](https://developer.paypal.com/)
   - 创建应用并获取 Client ID / Client Secret

2. **切换到沙盒环境**
   - 在 Developer Dashboard 切换到 Sandbox
   - 使用 Sandbox 的 Client ID / Client Secret
   - 本地环境变量设置 `PAYPAL_SANDBOX=true`

3. **配置 Webhook**
   - Developer Dashboard → Webhooks
   - Webhook URL：`https://yourdomain.com/api/payment/webhook/paypal`
   - 记录 Webhook ID（`PAYPAL_WEBHOOK_ID`）

## 🔑 环境变量配置

在 `.env` 文件中添加：

```env
# PayPal 配置
PAYPAL_CLIENT_ID=AYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAYPAL_CLIENT_SECRET=ELxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAYPAL_WEBHOOK_ID=WH-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAYPAL_SANDBOX=true  # 生产环境设置为 false
```

## 💡 一次性付费与订阅差异

- **一次性付费（Orders + Capture）**
  - 不需要创建 Product / Plan
  - 适用于买断、终身、单次购买

- **订阅付费（Subscriptions）**
  - 需要在 PayPal Dashboard 创建 Product 和 Plan
    - Developer Dashboard → Products & Services → Subscriptions
    - 创建 Product → 创建 Plan
  - 记录 Plan ID 并配置到 `config/payment.ts` 的 `paypalPlanId`
  - 订阅状态以 Webhook 或主动查询为准

## 🧪 Sandbox 沙盒说明

PayPal 支持 Sandbox 环境用于开发测试：

1. **启用沙盒**
   - 设置 `PAYPAL_SANDBOX=true`
   - Sandbox API: `https://api-m.sandbox.paypal.com`

2. **沙盒账号**
   - 在 Developer Dashboard 创建 Sandbox 买家/卖家账号
   - 用 Sandbox 买家账号完成支付测试

3. **Webhook 注意**
   - Sandbox 与 Production 的 Webhook 完全隔离
   - 必须在 Sandbox App 下配置 Webhook
   - Sandbox Webhook 事件可能会有延迟（几秒到十几秒）

4. **切换到生产**
   - 设置 `PAYPAL_SANDBOX=false`
   - 使用生产环境 Client ID / Client Secret
   - 在生产 App 下重新配置 Webhook

## 🔔 Webhook 事件

建议监听以下事件（覆盖单次支付与订阅生命周期）：

- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.DENIED`
- `PAYMENT.CAPTURE.REFUNDED`
- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.UPDATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.EXPIRED`
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `PAYMENT.SALE.COMPLETED`

## 🛠️ 计划配置示例

### 订阅方案

```typescript
monthlyPaypal: {
  provider: 'paypal',
  id: 'monthlyPaypal',
  amount: 10,
  currency: 'USD',
  duration: {
    months: 1,
    type: 'recurring'
  },
  paypalPlanId: 'P-XXXXXXXXXX', // PayPal Dashboard 创建的 Plan ID
  i18n: {
    'en': {
      name: 'PayPal Monthly Plan',
      description: 'Monthly recurring subscription via PayPal',
      duration: 'month',
      features: ['All premium features', 'Priority support']
    },
    'zh-CN': {
      name: 'PayPal 月度订阅',
      description: '通过 PayPal 的月度循环订阅',
      duration: '月',
      features: ['所有高级功能', '优先支持']
    }
  }
}
```

### 单次付费（终身/买断）

```typescript
lifetimePaypal: {
  provider: 'paypal',
  id: 'lifetimePaypal',
  amount: 199,
  currency: 'USD',
  duration: {
    months: 9999,
    type: 'one_time'
  },
  i18n: {
    'en': {
      name: 'Lifetime (PayPal)',
      description: 'One-time payment, lifetime access',
      duration: 'lifetime',
      features: ['All premium features', 'Priority support', 'Free lifetime updates']
    },
    'zh-CN': {
      name: '终身会员 (PayPal)',
      description: '一次付费，永久使用',
      duration: '终身',
      features: ['所有高级功能', '优先支持', '终身免费更新']
    }
  }
}
```

## 🔄 支付流程

### 单次支付（Orders + Capture）

```
用户选择计划 → 创建订单 → 跳转 PayPal 授权 → 
回调 /api/payment/return/paypal → 服务器 capture → 
更新订单/订阅 → 跳转成功页
```

### 订阅支付（Subscriptions）

```
用户选择订阅 → 创建订阅 → 跳转 PayPal 授权 → 
回调 /api/payment/return/paypal?subscription=true → 
主动查询订阅状态 (ACTIVE) → 更新订阅 → 成功页
```

Webhook 作为最终一致性（处理延迟/取消/退款/续费）。

---

返回 [支付配置概览](./overview.md)
