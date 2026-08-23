# 💳 支付配置指南

支付是我们重要的核心功能，目前我们支持六种支付方式：**WeChat Pay**、**Stripe**、**Creem**、**Alipay**、**PayPal** 和 **Dodo Payments**，并且支持**三种付费模式**：单次付费、订阅和积分充值（微信支付和支付宝只支持单次付费和积分充值）。

> 💡 **AI 快速配置：** 已安装 [Agent Skills](https://github.com/TinyshipCN/tinyship-skills) 的用户可以直接对 AI 说「帮我配置支付」，使用 `tinyship-payment` skill 交互式完成配置。

> 🪙 **积分系统**：如需配置 AI 积分消耗功能，请参阅 [积分系统配置指南](../credits.md)。

## 🔗 相关页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 定价页 | `/pricing` | 展示所有付款计划 |
| 支付成功 | `/payment-success` | 支付成功回调页 |
| 支付取消 | `/payment-cancel` | 支付取消回调页 |
| 用户仪表盘 | `/dashboard` | 查看订阅状态和订单历史 |

## 📑 目录

- [🎯 支持的支付方式](#-支持的支付方式)
- [⚙️ 配置概览](#️-配置概览)
- [📚 详细配置文档](#-详细配置文档)
- [📦 配置付款计划](#-配置付款计划)
- [🔄 支付流程](#-支付流程)

## 🎯 支持的支付方式

| 支付方式 | 单次付费 | 订阅付费 | 积分充值 | 主要市场 | 币种支持 |
|---------|---------|---------|---------|---------|---------|
| WeChat Pay | ✅ | ❌ | ✅ | 中国大陆 | CNY |
| Alipay | ✅ | ❌ | ✅ | 中国大陆 | CNY |
| Stripe | ✅ | ✅ | ✅ | 全球 | 多币种 |
| PayPal | ✅ | ✅ | ✅ | 全球 | 多币种 |
| Creem | ✅ | ✅ | ✅ | 全球 | USD, EUR等 |
| Dodo Payments | ✅ | ✅ | ✅ | 全球 | 多币种 |

## ⚙️ 配置概览

通过 `config/payment.ts` 中的 **providers** 进行设置。建议您根据项目需求和目标市场选择一种支付方式进行配置：

- **中国大陆用户**：推荐 WeChat Pay 或 Alipay
- **国际用户**：推荐 Stripe 或 PayPal
- **审核通过更容易**：推荐 Creem
- **免处理税务合规**：推荐 Dodo Payments（Merchant of Record 模式）

**特别注意：在本地开发阶段我们要使用这些平台的测试/沙盒模式（Stripe 和 Creem 支持，微信支付不支持），所以微信支付如果想测试都是使用真实 0.01 元真实支付进行测试。**

## 📚 详细配置文档

根据你的需求，选择需要配置的支付方式：

1. **[微信支付配置](./wechat.md)** - 中国大陆用户推荐
2. **[支付宝配置](./alipay.md)** - 中国大陆用户推荐
3. **[Stripe 配置](./stripe.md)** - 国际用户推荐
4. **[PayPal 配置](./paypal.md)** - 国际用户推荐
5. **[Creem 配置](./creem.md)** - 独立开发者出海推荐
6. **[Dodo Payments 配置](./dodo.md)** - 全球市场 MoR 模式推荐
7. **[动态定价配置](./dynamic-pricing.md)** - 数据库驱动的实时定价管理
8. **[支付测试指南](../payment-testing.md)** - 本地开发测试和 Webhook 调试

## 📦 配置付款计划

通过 `config/payment.ts` 中的 **plans** 配置产品定价方案。这里配置的计划会自动显示在 `/pricing` 页面中。

> 💡 **动态定价**：如果你需要在不重新部署的情况下实时调整定价方案，可以使用[动态定价功能](./dynamic-pricing.md)。开启后，定价方案将从数据库读取，可通过管理后台 `/admin/pricing` 随时修改。

### 💰 计划类型

系统支持三种付费模式：

| 类型 | 说明 | 适用场景 |
|------|------|---------|
| **单次付费 (One-time)** | 用户支付一次获得长期或永久权限 | 终身会员、软件买断、课程购买 |
| **订阅付费 (Recurring)** | 按周期自动续费 | SaaS 服务、会员订阅 |
| **积分充值 (Credits)** | 一次购买积分，按使用量消耗 | AI 对话、图片生成 |

### 🌍 国际化配置

每个计划都需要配置多语言支持：

```typescript
i18n: {
  'en': {                    // 英文
    name: 'Monthly Plan',
    description: 'Perfect for short-term projects', 
    duration: 'month',
    features: ['All premium features', 'Priority support']
  },
  'zh-CN': {                 // 简体中文
    name: '月度订阅',
    description: '每月订阅，灵活管理',
    duration: '月', 
    features: ['所有高级功能', '优先支持']
  }
}
```

## 🔄 支付流程

### 支付处理流程

1. **用户选择计划** → 2. **创建订单** → 3. **跳转支付** → 4. **处理回调** → 5. **更新状态**

### API 端点

项目提供以下支付相关的 API 端点：

```typescript
// 发起支付
POST /api/payment/initiate
{
  "planId": "monthly",
  "provider": "stripe"
}

// 支付状态查询  
GET /api/payment/query/:orderId

// 支付回调处理
POST /api/payment/webhook/:provider

// 取消支付
POST /api/payment/cancel/:orderId
```

## 📚 参考文档

### 相关指南
- [🧪 支付测试指南](../payment-testing.md) - 本地开发测试和 Webhook 调试
- [🪙 积分系统指南](../credits.md) - 积分充值和消耗配置

### 官方文档
- [微信支付开发文档](https://pay.weixin.qq.com/wiki/doc/api/index.html)
- [支付宝开放平台](https://open.alipay.com/)
- [Stripe 开发文档](https://stripe.com/docs)
- [PayPal 开发文档](https://developer.paypal.com/docs/)
- [Creem API 文档](https://docs.creem.io/)
- [Dodo Payments 文档](https://docs.dodopayments.com/)
