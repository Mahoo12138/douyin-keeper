# Dodo Payments 配置

Dodo Payments 是一个全球化的支付平台，采用 Merchant of Record（记录商家）模式，替开发者处理税务、合规和退款等事务，特别适合面向全球市场的 SaaS 和数字产品。

## 📑 目录

- [📋 申请流程](#-申请流程)
- [🔑 环境变量配置](#-环境变量配置)
- [✨ 特性](#-特性)
- [🧪 测试模式](#-测试模式)
- [🔔 Webhook 配置](#-webhook-配置)
- [🛠️ 计划配置示例](#️-计划配置示例)
- [🔄 支付流程](#-支付流程)
- [👤 Customer Portal](#-customer-portal)
- [⚠️ 注意事项](#️-注意事项)

## 📋 申请流程

1. **注册 Dodo Payments 账号**
   - 访问 [Dodo Payments 官网](https://dodopayments.com/)
   - 注册账号并完成 KYB（企业验证）或 KYC（个人验证）

2. **获取 API 密钥**
   - 登录 [Dodo Payments Dashboard](https://app.dodopayments.com/)
   - 前往 "Developer" → "API Keys"
   - 生成 API Key（以 `TSzsgjLa...` 格式）

3. **创建产品**
   - 在 Dashboard 的 "Products" 页面创建产品
   - 选择产品类型：Recurring（订阅）或 One-Time（单次付费）
   - 设置价格和币种
   - 记录产品 ID（以 `pdt_` 开头），用于配置 `dodoProductId`

4. **配置 Webhook**
   - 前往 "Developer" → "Webhooks"
   - 添加 Webhook URL：`https://yourdomain.com/api/payment/webhook/dodo`
   - 选择事件类型：`payment` 和 `subscription`
   - 记录 Webhook Signing Key（以 `whsec_` 开头）

## 🔑 环境变量配置

在 `.env` 文件中添加：

```env
# Dodo Payments 配置
DODO_PAYMENTS_API_KEY=TSxxxxxxxxxx           # API 密钥
DODO_PAYMENTS_WEBHOOK_KEY=whsec_xxxxxxxxxx   # Webhook 签名密钥
DODO_PAYMENTS_TEST_MODE=true                 # 测试模式（生产环境设为 false）
```

## ✨ 特性

- **Merchant of Record（MoR）模式**：Dodo 作为记录商家，代处理全球税务、合规和退款
- 支持多种币种（USD、EUR、GBP 等）
- 支持单次付费、订阅和积分充值三种模式
- 托管结账页面（Hosted Checkout），无需自建支付表单
- 内置 Customer Portal，用户可自行管理订阅
- 支持信用卡、Apple Pay、Google Pay、WeChat 等多种支付方式
- 自动处理销售税（Sales Tax）计算
- 适合独立开发者和中小团队出海

## 🧪 测试模式

Dodo Payments 提供完整的测试环境：

1. **启用测试模式**
   - 设置 `DODO_PAYMENTS_TEST_MODE=true`
   - 测试结账页面域名：`test.checkout.dodopayments.com`

2. **测试卡号**

   | 卡号 | 场景 |
   |------|------|
   | `4242 4242 4242 4242` | 成功支付 |
   | `4000 0000 0000 0002` | 支付失败 |

   - 有效期：任意未来日期（如 `06/32`）
   - CVC：任意三位数（如 `123`）
   - 持卡人姓名：任意英文名（不能包含数字）

3. **测试与生产切换**
   - 测试模式下创建的产品和订阅仅存在于测试环境
   - 切换到生产时需将 `DODO_PAYMENTS_TEST_MODE` 设为 `false`
   - 生产环境需使用生产环境的 API Key 和 Webhook Key

## 🔔 Webhook 配置

### 必需的事件类型

在 Dodo Dashboard 配置 Webhook 时，选择以下事件类型：

- **payment** — 支付相关事件
  - `payment.succeeded` — 支付成功（单次付费和积分充值）
  - `payment.failed` — 支付失败

- **subscription** — 订阅相关事件
  - `subscription.active` — 订阅激活
  - `subscription.renewed` — 订阅续期
  - `subscription.cancelled` — 订阅取消
  - `subscription.expired` — 订阅到期
  - `subscription.on_hold` — 订阅暂停
  - `subscription.updated` — 订阅更新
  - `subscription.plan_changed` — 订阅方案变更

### 本地开发 Webhook 测试

Dodo Payments 的 Webhook 需要公网可访问的 URL，本地开发时需要使用内网穿透工具：

```bash
# 方案一：使用 cloudflared（推荐）
cloudflared tunnel --url http://localhost:7001

# 方案二：使用 ngrok
npx ngrok http 7001
```

将隧道地址配置到 Dodo Dashboard：
- Webhook URL：`https://your-tunnel.trycloudflare.com/api/payment/webhook/dodo`

> ⚠️ 每次重启隧道后，需要更新 Dashboard 中的 Webhook URL。

### Webhook 签名验证

Dodo 使用 Standard Webhooks 规范（HMAC SHA256）进行签名验证。系统会自动验证以下请求头：
- `webhook-id` — 事件唯一标识
- `webhook-signature` — HMAC 签名
- `webhook-timestamp` — 时间戳

## 🛠️ 计划配置示例

### 订阅方案（Recurring）

```typescript
monthlyDodo: {
  provider: 'dodo',
  id: 'monthlyDodo',
  amount: 10,
  currency: 'USD',
  duration: {
    months: 1,
    type: 'recurring'
  },
  dodoProductId: 'pdt_xxxxxxxxxxxxxxxxxxxxx', // Dodo Dashboard 创建的产品 ID
  i18n: {
    'en': {
      name: 'Dodo Monthly Plan',
      description: 'Monthly recurring subscription via Dodo Payments',
      duration: 'month',
      features: ['All premium features', 'Priority support']
    },
    'zh-CN': {
      name: 'Dodo 月度订阅',
      description: '通过 Dodo Payments 的月度循环订阅',
      duration: '月',
      features: ['所有高级功能', '优先支持']
    }
  }
}
```

### 单次付费方案（One-Time）

```typescript
monthlyDodoOneTime: {
  provider: 'dodo',
  id: 'monthlyDodoOneTime',
  amount: 10,
  currency: 'USD',
  duration: {
    months: 1,
    type: 'one_time'
  },
  dodoProductId: 'pdt_xxxxxxxxxxxxxxxxxxxxx',
  i18n: {
    'en': {
      name: 'Dodo Monthly Plan (One Time)',
      description: 'One-time payment for monthly access via Dodo Payments',
      duration: 'month',
      features: ['All premium features', 'Priority support']
    },
    'zh-CN': {
      name: 'Dodo 月度 (一次性)',
      description: '通过 Dodo Payments 的一次性月度付费',
      duration: '月',
      features: ['所有高级功能', '优先支持']
    }
  }
}
```

### 积分充值方案（Credits）

```typescript
creditsDodo: {
  provider: 'dodo',
  id: 'creditsDodo',
  amount: 5,
  currency: 'USD',
  duration: { type: 'credits' },
  credits: 100,
  dodoProductId: 'pdt_xxxxxxxxxxxxxxxxxxxxx',
  i18n: {
    'en': {
      name: '100 Credits Dodo',
      description: 'Purchase 100 AI credits via Dodo Payments',
      duration: 'one-time',
      features: ['100 AI conversations', '100 image generations']
    },
    'zh-CN': {
      name: '100 积分包 Dodo',
      description: '通过 Dodo Payments 购买的 100 个 AI 积分',
      duration: '一次性',
      features: ['100 次 AI 对话', '100 次图片生成']
    }
  }
}
```

## 🔄 支付流程

### Hosted Checkout 流程

Dodo 使用托管结账页面，用户将被重定向到 Dodo 的结账页面完成支付：

```
用户选择计划 → 创建 Checkout Session → 跳转 Dodo Checkout 页面 →
用户填写账单地址 → 选择支付方式并完成支付 →
回调 /payment-success?provider=dodo → 显示成功页面
```

### Webhook 处理流程

```
Dodo 发送 Webhook → /api/payment/webhook/dodo →
验证签名 → 解析事件类型 →
  - payment.succeeded → 更新订单状态 / 充值积分
  - subscription.active → 创建用户订阅记录
  - subscription.renewed → 更新订阅周期
  - subscription.cancelled → 标记订阅已取消
```

> 💡 支付确认依赖 Webhook 回调，而非客户端回调 URL。`/payment-success` 页面会直接展示成功信息，无需客户端验证。

## 👤 Customer Portal

Dodo Payments 内置 Customer Portal，用户可以通过 Portal 自行管理订阅：

- 查看当前订阅状态
- 取消或恢复订阅
- 更新支付方式
- 查看历史账单

用户在 Dashboard 订阅卡片中点击 "Manage Subscription" 按钮即可跳转到 Customer Portal。

## ⚠️ 注意事项

1. **产品类型匹配**：Dodo Dashboard 中创建的产品类型（Recurring / One-Time）必须与 `config/payment.ts` 中的 `duration.type` 一致
2. **币种一致性**：计划配置中的 `currency` 应与 Dodo Dashboard 中产品的定价币种一致
3. **Webhook 可靠性**：Webhook 可能因网络问题产生延迟，系统设计为最终一致性
4. **MoR 模式说明**：作为 Merchant of Record，Dodo 会在结账页面显示自己的品牌信息和法律条款，这是正常行为
5. **测试卡限制**：持卡人姓名字段不接受包含数字的字符串

---

返回 [支付配置概览](./overview.md)
