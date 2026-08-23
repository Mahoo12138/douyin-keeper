# 🧪 支付测试指南

本文档介绍如何在本地开发环境中测试支付功能，包括各支付平台的测试模式配置和 Webhook 调试方法。

> 💡 **前置条件**：在进行支付测试之前，请先完成 [支付配置](./payment.md) 中的基础设置。

## 📑 目录

- [🔧 测试环境设置](#-测试环境设置)
  - [Stripe 测试模式](#stripe-测试模式)
  - [微信支付测试](#微信支付测试)
  - [Creem 测试模式](#creem-测试模式)
  - [Dodo Payments 测试模式](#dodo-payments-测试模式)
- [🌐 本地开发测试](#-本地开发测试)
  - [内网穿透工具](#内网穿透工具)
  - [Stripe Webhook 测试](#stripe-webhook-测试)
- [🎯 测试流程](#-测试流程)
- [💳 测试卡号](#-测试卡号)

## 🔧 测试环境设置

在开发环境中，使用测试密钥进行支付测试：

### Stripe 测试模式

```env
# 使用 test 密钥
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

测试卡号：
- **成功支付**: `4242424242424242`
- **失败支付**: `4000000000000002`  
- **需要验证**: `4000002500003155`

### 微信支付测试

微信支付没有测试沙盒环境，可以使用小金额直接进行测试 - 比如一个订单 0.01 元。

### Creem 测试模式

```env
# 使用测试环境
CREEM_SERVER_URL=https://test-api.creem.io
CREEM_API_KEY=creem_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Dodo Payments 测试模式

```env
# 使用测试模式
DODO_PAYMENTS_API_KEY=TSxxxxxxxxxx
DODO_PAYMENTS_WEBHOOK_KEY=whsec_xxxxxxxxxx
DODO_PAYMENTS_TEST_MODE=true
```

测试卡号：
- **成功支付**: `4242424242424242`
- **失败支付**: `4000000000000002`
- 有效期：任意未来日期（如 `06/32`）
- CVC：任意三位数（如 `123`）
- 持卡人姓名：任意英文名（不能包含数字）

## 🌐 本地开发测试

> 💡 **重要提示**：本地开发时推荐使用以下方式测试 webhook，无需先在生产环境配置 webhook 端点。

我们需要使用真实的域名来接收 webhook 的数据，所以这里我们需要将本地服务映射到真实域名上。

| 支付方式 | 推荐方案 |
|---------|---------|
| Stripe | Stripe CLI（无需内网穿透） |
| 微信支付 | ngrok / Cloudflare Tunnel |
| Creem | ngrok / Cloudflare Tunnel |
| Dodo Payments | ngrok / Cloudflare Tunnel |

### 内网穿透工具

针对微信支付、Creem 和 Dodo Payments，需要使用内网穿透工具：

- [ngrok 文档地址](https://ngrok.com/docs/getting-started/)
- [cloudflare 文档地址](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)

```bash
# 使用 ngrok 创建公网隧道
npx ngrok http 7001
```

将隧道地址配置到各支付平台：
- 微信支付: `https://abc123.ngrok.io/api/payment/webhook/wechat`
- Creem: `https://abc123.ngrok.io/api/payment/webhook/creem`
- Dodo Payments: `https://abc123.ngrok.io/api/payment/webhook/dodo`

### Stripe Webhook 测试

Stripe 支持两种本地 webhook 测试方式：

#### 方案一：Stripe CLI（推荐）

文档地址：[https://docs.stripe.com/stripe-cli](https://docs.stripe.com/stripe-cli)

```bash
# 1. 安装 Stripe CLI
# macOS
brew install stripe/stripe-cli/stripe

# Windows
scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
scoop install stripe

# 2. 登录到 Stripe 账户
stripe login

# 3. 启动 webhook 转发
stripe listen --forward-to localhost:7001/api/payment/webhook/stripe

# 4. CLI 会显示 webhook 签名密钥，复制到环境变量
# 输出示例：whsec_1234567890abcdef...
```

**优势**：
- ✅ 无需外网访问，完全本地化
- ✅ 实时接收真实 webhook 事件
- ✅ 自动处理签名验证
- ✅ 可查看详细的事件日志

#### 方案二：ngrok + Stripe Dashboard（备选）

当 Stripe CLI 不可用时的备选方案：

```bash
# 1. 启动 ngrok 隧道
ngrok http 7001

# 2. 复制 ngrok 提供的 https 地址
# 示例：https://abc123.ngrok.io

# 3. 在 Stripe Dashboard 中配置 webhook 端点
# 地址：https://abc123.ngrok.io/api/payment/webhook/stripe
# 选择需要的事件类型：
# - checkout.session.completed
# - customer.subscription.updated
# - customer.subscription.deleted
```

**配置环境变量**：
```bash
# .env.local
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### 测试验证

#### 1. 基础事件触发

```bash
# 监控 webhook 事件（使用 Stripe CLI 时）
stripe listen --forward-to localhost:7001/api/payment/webhook/stripe --events checkout.session.completed,customer.subscription.updated

# 发送预定义的测试事件
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
```

#### 2. trigger 命令说明

`stripe trigger` 会生成**预定义的模拟数据**，不能自定义具体内容，但会触发真实的 webhook 事件流程：

```bash
# 查看可用的触发器事件
stripe trigger --help

# 触发订阅相关事件
stripe trigger checkout.session.completed  # 模拟支付完成
stripe trigger invoice.payment_succeeded    # 模拟发票支付成功
stripe trigger customer.subscription.created # 模拟订阅创建
```

**生成的数据特点**：
- ✅ 数据结构与真实事件完全一致
- ✅ 包含所有必需的字段和关系
- ❌ 数据内容是固定的测试值
- ❌ 无法指定特定的用户ID或订单信息

#### 3. 自定义数据测试

如需测试特定数据场景，可使用以下方法：

**方法一：Stripe Dashboard测试**
```bash
# 1. 在 Stripe Dashboard 中创建真实的支付会话
# 2. 使用测试卡号完成支付：4242 4242 4242 4242
# 3. 观察本地应用接收到的真实 webhook 数据
```

**方法二：手动发送自定义 webhook**
```bash
# 发送自定义的 webhook 数据到本地端点
curl -X POST http://localhost:7001/api/payment/webhook/stripe \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: YOUR_TEST_SIGNATURE" \
  -d '{
    "id": "evt_test_webhook",
    "object": "event",
    "type": "checkout.session.completed",
    "data": {
      "object": {
        "id": "cs_test_custom_session_id",
        "mode": "subscription",
        "customer": "cus_test_customer",
        "metadata": {
          "planId": "your_plan_id",
          "userId": "your_user_id",
          "orderId": "your_order_id"
        }
      }
    }
  }'
```

## 🎯 测试流程

推荐的完整测试流程：

```bash
# 步骤1：启动 Stripe webhook 监听
stripe listen --forward-to localhost:7001/api/payment/webhook/stripe

# 步骤2：启动本地应用
pnpm run dev

# 步骤3：访问支付页面，使用测试卡完成真实支付流程
open http://localhost:7001/pricing

# 步骤4：观察控制台输出，验证 webhook 处理逻辑
```

## 💳 测试卡号

### Stripe 测试卡号

| 卡号 | 场景 |
|------|------|
| `4242 4242 4242 4242` | 成功支付 |
| `4000 0000 0000 0002` | 支付失败 |
| `4000 0000 0000 9995` | 资金不足 |
| `4000 0025 0000 3155` | 需要 3D Secure 验证 |

### 微信支付测试

- 使用真实微信扫码支付
- 建议使用 0.01 元进行测试
- 测试完成后可申请退款

### Creem 测试

- 使用 Creem 提供的测试卡号
- 参考 [Creem 测试文档](https://docs.creem.io/)

### Dodo Payments 测试卡号

| 卡号 | 场景 |
|------|------|
| `4242 4242 4242 4242` | 成功支付 |
| `4000 0000 0000 0002` | 支付失败 |

- 有效期：任意未来日期（如 `06/32`）
- CVC：任意三位数（如 `123`）
- 持卡人姓名：任意英文名（**不能包含数字**）
- 参考 [Dodo Payments 文档](https://docs.dodopayments.com/)

---

📚 **相关文档**：
- [支付配置概览](./payment/overview.md) - 配置支付方式和计划
- [Dodo Payments 配置](./payment/dodo.md) - Dodo Payments 详细配置
- [积分系统指南](./credits.md) - 配置积分充值和消耗

