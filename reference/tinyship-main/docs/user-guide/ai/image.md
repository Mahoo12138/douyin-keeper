# AI 图片生成配置

TinyShip 支持 AI 图片生成功能，可以集成多个图片生成服务。本文档介绍如何配置 AI 图片生成功能。

## 🔗 相关页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 图片生成页 | `/image-generate` | AI 图片生成界面 |

## 📑 目录

- [支持的图片生成服务](#支持的图片生成服务)
- [配置说明](#配置说明)
- [环境变量配置](#环境变量配置)
- [积分消耗配置](#积分消耗配置)

## 支持的图片生成服务

| 服务 | 模型 | 特点 |
|------|------|------|
| **Qwen Image** | qwen-image-max, qwen-image-plus | 通义万相，中文理解好 |
| **Fal.ai** | fal-ai/flux/schnell | 快速生成，效果优秀 |
| **OpenAI** | dall-e-3, dall-e-2 | DALL-E 系列，效果稳定 |

## 配置说明

AI 图片生成的配置位于 `config/aiImage.ts`：

```typescript
// config/aiImage.ts
export const aiImageConfig = {
  defaultProvider: 'qwen' as const,        // 默认图片生成提供商
  
  defaultModels: {
    qwen: 'qwen-image-plus',
    fal: 'fal-ai/flux/schnell',
    openai: 'dall-e-3'
  },
  
  availableModels: {
    qwen: ['qwen-image-max', 'qwen-image-plus'],
    fal: ['fal-ai/flux/schnell'],
    openai: ['dall-e-3', 'dall-e-2']
  }
}
```

## 环境变量配置

在 `.env` 文件中添加对应的 API 密钥：

```env
# Qwen Image (通义万相)
QWEN_API_KEY="your-qwen-api-key"

# Fal.ai
FAL_API_KEY="your-fal-api-key"

# OpenAI DALL-E
OPENAI_API_KEY="your-openai-api-key"
```

## 积分消耗配置

AI 图片生成通常消耗更多积分，可以在 `config/credits.ts` 中配置不同模型的积分消耗：

```typescript
// config/credits.ts
export const creditsConfig = {
  fixedConsumption: {
    // AI 图片生成 - 按模型定价
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
}
```

---

相关文档：
- [AI 对话配置](./chat.md)
- [积分系统配置](../credits.md) - 配置积分消耗规则
