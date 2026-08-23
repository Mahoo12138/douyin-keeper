# 🪙 积分系统配置指南

积分系统是为 AI 功能设计的按需付费模式，与传统订阅模式并行运行。用户可以选择订阅获得会员权益，或者购买积分按使用量付费。

> 💡 **前置条件**：在配置积分系统之前，请先完成 [支付配置](./payment/overview.md) 中的支付方式设置。

## 🔗 相关页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 定价页 | `/pricing` | 购买积分入口 |
| 用户仪表盘 | `/dashboard` | 查看积分余额和消耗记录 |
| AI 对话页 | `/ai` | 消耗积分的 AI 对话 |
| 图片生成页 | `/image-generate` | 消耗积分的图片生成 |
| 管理后台-积分 | `/admin/credits` | 管理员查看积分交易记录 |

## 📑 目录

- [💡 积分系统概述](#-积分系统概述)
- [📦 积分计划配置](#-积分计划配置)
  - [计划类型说明](#计划类型说明)
  - [配置示例](#配置示例)
- [⚡ 积分消耗配置](#-积分消耗配置)
  - [消耗模式](#消耗模式)
  - [模型乘数](#模型乘数)
  - [环境变量](#环境变量)
- [🔌 API 端点](#-api-端点)
- [🎯 适用场景](#-适用场景)
- [🛠️ 技术实现](#️-技术实现)

## 💡 积分系统概述

| 特性 | 说明 |
|------|------|
| **付费模式** | 一次性购买，按需消耗 |
| **支持的支付方式** | WeChat Pay、Stripe、Creem |
| **消耗模式** | 固定消耗 / 动态消耗（按 token） |
| **与订阅关系** | 并行运行，用户可同时拥有 |

## 📦 积分计划配置

### 计划类型说明

积分计划使用 `duration.type: 'credits'` 来区分于订阅和单次付费计划：

```typescript
type CreditPlan = {
  duration: { 
    type: 'credits';    // 标记为积分计划
    credits: number     // 充值获得的积分数量
  };
  stripePriceId?: string;    // Stripe 价格 ID
  creemProductId?: string;   // Creem 产品 ID
}
```

### 配置示例

在 `config/payment.ts` 中的 `plans` 添加积分充值计划：

```typescript
// 基础积分包
credits100: {
  provider: 'stripe',
  id: 'credits100',
  amount: 10,
  currency: 'USD',
  duration: {
    type: 'credits',
    credits: 100
  },
  stripePriceId: 'price_xxx',
  i18n: {
    'en': {
      name: '100 Credits',
      description: 'Perfect for trying out AI features',
      duration: '100 credits',
      features: ['No expiration', 'Use anytime']
    },
    'zh-CN': {
      name: '100 积分',
      description: '适合体验 AI 功能',
      duration: '100 积分',
      features: ['永不过期', '随时使用']
    }
  }
},

// 包含赠送的积分包（推荐）
credits500: {
  provider: 'stripe',
  id: 'credits500',
  amount: 45,
  currency: 'USD',
  recommended: true,
  duration: {
    type: 'credits',
    credits: 550              // 500 + 50 赠送
  },
  stripePriceId: 'price_xxx',
  i18n: {
    'en': {
      name: '500 Credits + 50 Bonus',
      description: 'Best value for regular users',
      duration: '550 credits',
      features: ['10% bonus credits', 'No expiration']
    },
    'zh-CN': {
      name: '500 积分 + 50 赠送',
      description: '常规用户的最佳选择',
      duration: '550 积分',
      features: ['赠送10%积分', '永不过期']
    }
  }
},

// 大额积分包
credits1000: {
  provider: 'stripe',
  id: 'credits1000',
  amount: 80,
  currency: 'USD',
  duration: {
    type: 'credits',
    credits: 1200             // 1000 + 200 赠送
  },
  stripePriceId: 'price_xxx',
  i18n: {
    'en': {
      name: '1000 Credits + 200 Bonus',
      description: 'Best for power users',
      duration: '1200 credits',
      features: ['20% bonus credits', 'No expiration']
    },
    'zh-CN': {
      name: '1000 积分 + 200 赠送',
      description: '重度用户的超值选择',
      duration: '1200 积分',
      features: ['赠送20%积分', '永不过期']
    }
  }
}
```

## ⚡ 积分消耗配置

### 消耗模式

系统支持两种积分消耗模式：

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| **fixed** | 每次操作消耗固定积分 | 简单计费、图片生成 |
| **dynamic** | 按实际 token 消耗计费 | AI 聊天、文本处理 |

在 `config/credits.ts` 中配置：

```typescript
// config/credits.ts
export const creditsConfig = {
  // 消耗模式：'fixed' 或 'dynamic'
  consumptionMode: 'dynamic',
  
  /**
   * 固定消耗配置
   * 每个条目可以是:
   * - 数字: 所有操作统一消耗
   * - 对象: { default: number, models?: { modelName: number } }
   */
  fixedConsumption: {
    // AI 聊天 - 简单数字格式（所有模型统一消耗）
    aiChat: 1,
    
    // AI 图片生成 - 对象格式（按模型定价）
    // 模型名称全局唯一，无需按 provider 嵌套
    aiImage: {
      default: 10,
      models: {
        'qwen-image-max': 8,
        'qwen-image-plus': 5,
        'fal-ai/flux/schnell': 6,
        'dall-e-3': 15,
        'dall-e-2': 8,
      }
    },
  },
  
  // 动态消耗配置
  dynamicConsumption: {
    tokensPerCredit: 1000,  // 每 1000 token 消耗 1 积分
    
    // 不同 AI 模型的积分消耗乘数
    modelMultipliers: {
      'qwen-turbo': 0.5,      // 经济模型
      'qwen-plus': 1.0,       // 标准模型
      'qwen-max': 1.2,        // 高级模型
      'deepseek-chat': 0.8,
      'gpt-4': 2.0,           // GPT-4 双倍消耗
      'default': 1.0
    }
  }
}
```

### 模型乘数

不同 AI 模型的成本不同，可以通过乘数来调整积分消耗：

| 模型 | 乘数 | 说明 |
|------|------|------|
| qwen-turbo | 1.0 | 基础模型，标准消耗 |
| qwen-plus | 1.2 | 高级模型，+20% 消耗 |
| qwen-max | 1.5 | 最强模型，+50% 消耗 |
| gpt-4 | 2.0 | GPT-4，双倍消耗 |
| default | 1.0 | 未配置模型的默认值 |

### 环境变量

```env
# 积分消耗模式
CREDITS_CONSUMPTION_MODE=dynamic

# 固定消耗模式配置
CREDITS_FIXED_CHAT_COST=10

# 动态消耗模式配置
CREDITS_DYNAMIC_CHAT_COST_PER_KILO_TOKEN=1

# 模型乘数配置（可选）
CREDITS_QWEN_TURBO_MULTIPLIER=1.0
CREDITS_QWEN_PLUS_MULTIPLIER=1.2
CREDITS_QWEN_MAX_MULTIPLIER=1.5
CREDITS_GPT4_MULTIPLIER=2.0
```

## 🔌 API 端点

### 获取积分余额

```typescript
GET /api/credits/balance

// 响应
{
  "balance": 450
}
```

### 获取交易记录

```typescript
GET /api/credits/transactions?page=1&limit=10

// 响应
{
  "transactions": [
    {
      "id": "txn_xxx",
      "type": "consumption",
      "amount": "-5",
      "balanceAfter": "445",
      "description": "ai_chat",
      "metadata": {
        "model": "qwen-turbo",
        "tokens": 1500
      },
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25
  }
}
```

### 获取完整状态

```typescript
GET /api/credits/status

// 响应
{
  "credits": {
    "balance": 450,
    "totalPurchased": 550,
    "totalConsumed": 100
  },
  "subscription": {
    "hasSubscription": false,
    "plan": null,
    "expiresAt": null
  }
}
```

## 🎯 适用场景

### 🤖 AI 聊天/对话
- 用户购买积分后使用 AI 聊天功能
- 按 token 消耗或固定消耗积分
- 适合：ChatGPT 类应用、AI 助手等

### 🎨 AI 图片生成
- 每次生成图片消耗固定积分
- 不同模型/分辨率消耗不同积分
- 适合：AI 绘画、图片编辑等

### 📄 文档处理
- 文档翻译、摘要、分析等
- 按文档大小或处理复杂度消耗
- 适合：AI 翻译、文档助手等

### 🎵 音视频处理
- 语音转文字、视频分析等
- 按时长或文件大小消耗积分
- 适合：转录服务、内容分析等

## 🛠️ 技术实现

### 核心模块

积分系统的核心实现位于 `@libs/credits`：

```typescript
import { 
  creditService, 
  calculateCreditConsumption, 
  safeNumber, 
  TransactionTypeCode 
} from '@libs/credits';

// 获取余额
const balance = await creditService.getBalance(userId);

// 添加积分（支付成功后自动调用）
await creditService.addCredits({
  userId,
  amount: 100,
  description: TransactionTypeCode.PURCHASE,
  relatedOrderId: orderId
});

// 消耗积分
await creditService.consumeCredits({
  userId,
  amount: creditsToConsume,
  description: TransactionTypeCode.AI_CHAT,
  metadata: { model, tokens }
});
```

### 安全处理

使用 `safeNumber` 函数防止 NaN/Infinity 导致的数据问题：

```typescript
import { safeNumber } from '@libs/credits';

const totalTokens = safeNumber(usageData.totalTokens); // 安全转换
const credits = calculateCreditConsumption({ totalTokens, model });
```

### 交易类型

```typescript
const TransactionTypeCode = {
  AI_CHAT: 'ai_chat',
  IMAGE_GENERATION: 'image_generation',
  DOCUMENT_PROCESSING: 'document_processing',
  PURCHASE: 'purchase',
  BONUS: 'bonus',
  REFUND: 'refund',
  ADJUSTMENT: 'adjustment',
};
```

---

📚 **相关文档**：
- [支付配置指南](./payment.md) - 配置支付方式和订阅计划
- [支付测试指南](./payment-testing.md) - 本地开发测试和 Webhook 调试

