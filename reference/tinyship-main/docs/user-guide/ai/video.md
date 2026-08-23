# AI 视频生成配置

TinyShip 支持 AI 视频生成功能，可集成多个视频生成服务。本文档介绍如何配置 AI 视频生成功能。

## 🔗 相关页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 视频生成页 | `/video-generate` | AI 视频生成界面 |

## 📑 目录

- [支持的视频生成服务](#支持的视频生成服务)
- [配置说明](#配置说明)
- [环境变量配置](#环境变量配置)
- [积分消耗配置](#积分消耗配置)

## 支持的视频生成服务

| 服务 | 模型 | 特点 |
|------|------|------|
| **Fal.ai** | kling-video/v2.5-turbo/pro/text-to-video, kling-video/v2.5-turbo/pro/image-to-video | 接入简单，支持文生视频/图生视频 |
| **Volcengine Seedance** | doubao-seedance-1-5-pro-251215, doubao-seedance-1-0-pro-250528 | 画质稳定，支持异步任务轮询 |
| **Aliyun Wanxiang** | wan2.6-t2v, wan2.5-t2v-turbo, wan2.6-i2v-flash | 国内可用性好，支持图生视频（首帧） |

## 配置说明

AI 视频生成配置位于 `config/aiVideo.ts`：

```typescript
// config/aiVideo.ts
export const aiVideoConfig = {
  defaultProvider: 'volcengine' as const, // 默认视频生成提供商

  defaultModels: {
    fal: 'kling-video/v2.5-turbo/pro/text-to-video',
    volcengine: 'doubao-seedance-1-5-pro-251215',
    aliyun: 'wan2.6-t2v',
  },

  availableModels: {
    fal: [
      'kling-video/v2.5-turbo/pro/text-to-video',
      'kling-video/v2.5-turbo/pro/image-to-video',
    ],
    volcengine: ['doubao-seedance-1-5-pro-251215', 'doubao-seedance-1-0-pro-250528'],
    aliyun: ['wan2.6-t2v', 'wan2.5-t2v-turbo', 'wan2.6-i2v-flash'],
  },
}
```

## 环境变量配置

在 `.env` 文件中添加对应 API 密钥：

```env
# Fal.ai
FAL_API_KEY="your-fal-api-key"

# Volcengine Seedance
VOLCENGINE_ACCESS_KEY_ID="your-volcengine-api-key"
# 可选，自定义网关地址；未配置时使用默认值
VOLCENGINE_BASE_URL="https://ark.cn-beijing.volces.com"

# Aliyun Wanxiang（复用 Qwen 配置）
QWEN_API_KEY="your-dashscope-api-key"
# 可选，若配置了路径（如 /compatible-mode/v1）系统会自动提取 origin
QWEN_BASE_URL="https://dashscope.aliyuncs.com"
```

## 积分消耗配置

AI 视频生成通常比图片生成消耗更多积分。可在 `config/credits.ts` 中按模型定价：

```typescript
// config/credits.ts
export const creditsConfig = {
  fixedConsumption: {
    // AI 视频生成 - 按模型定价
    aiVideo: {
      default: 30,
      models: {
        'kling-video/v2.5-turbo/pro/text-to-video': 30,
        'kling-video/v2.5-turbo/pro/image-to-video': 30,
        'doubao-seedance-1-5-pro-251215': 35,
        'doubao-seedance-1-0-pro-250528': 25,
        'wan2.6-t2v': 20,
        'wan2.5-t2v-turbo': 15,
        'wan2.6-i2v-flash': 15,
      },
    },
  },
}
```

---

相关文档：
- [AI 对话配置](./chat.md)
- [AI 图片生成](./image.md)
- [视频参数对照（实现文档）](../../implementation/video-generation-provider-params-comparison.md)
- [积分系统配置](../credits.md) - 配置积分消耗规则
