# TinyShip AI Integration Library

[中文文档](./README.md) | **English**

This is a universal AI integration solution based on [Vercel AI SDK](https://sdk.vercel.ai/). Currently implements basic chat functionality and three AI providers (Qwen, DeepSeek, OpenAI), users can extend according to their needs.

## 📁 Directory Structure

```
libs/ai/
├── config.ts         # AI configuration and environment variable settings
├── providers.ts      # AI model provider setup (OpenAI, DeepSeek, Qwen, etc.)
├── types.ts          # TypeScript type definitions
├── utils.ts          # Utility functions
├── index.ts          # Main entry point
├── README.md         # Chinese documentation
└── README_EN.md      # English documentation
```

## 🚀 Setup Steps

### 1. Environment Variables Configuration

Add AI-related environment variables to the `.env` file in the root directory:

```env
# AI Configuration
AI_PROVIDER=qwen  # Default AI provider to use

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=optional_base_url  # Optional: custom API base URL

# Qwen (Tongyi Qianwen) Configuration
QWEN_API_KEY=your_qwen_api_key
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# DeepSeek Configuration
DEEPSEEK_API_KEY=your_deepseek_api_key
```

### 2. Supported AI Providers

#### Qwen (Tongyi Qianwen) - Recommended
- **Models**: `qwen-max`, `qwen-plus`, `qwen-turbo`
- **Advantages**: Excellent Chinese support, cost-effective
- **Get API Key**: [Alibaba Cloud DashScope](https://dashscope.aliyun.com/)

#### DeepSeek
- **Models**: `deepseek-chat`, `deepseek-coder`
- **Advantages**: Strong programming capabilities, low cost
- **Get API Key**: [DeepSeek Platform](https://platform.deepseek.com/)

#### OpenAI
- **Models**: `gpt-5`, `gpt-5-codex`, `gpt-5-pro`
- **Advantages**: Excellent performance, mature ecosystem
- **Get API Key**: [OpenAI Platform](https://platform.openai.com/)

## 💻 Usage

### Unified Provider Creation

```typescript
import { createAIHandler } from '@libs/ai';

// Use default provider (from AI_PROVIDER environment variable)
const defaultHandler = createAIHandler();

// Use specific provider
const qwenHandler = createAIHandler({ provider: 'qwen' });
const deepseekHandler = createAIHandler({ provider: 'deepseek' });
const openaiHandler = createAIHandler({ provider: 'openai' });
```

### Universal Streaming Response Function

```typescript
import { streamResponse } from '@libs/ai';

// Streaming response with support for custom provider and model
const response = streamResponse({
  messages: [
    { role: 'user', content: 'Hello' }
  ],
  provider: 'qwen',  // Optional, defaults to environment variable configuration
  model: 'qwen-max'  // Optional, uses provider's default model
});
```

### Server-side Usage

- **Next.js**: See `apps/next-app/app/api/chat/route.ts`
- **Nuxt.js**: See `apps/nuxt-app/server/api/chat.post.ts`
- **TanStack Start**: See `apps/tanstack-app/src/routes/api/chat.ts`

### Frontend Usage

- **Next.js (React)**: See `apps/next-app/app/[lang]/(root)/ai/page.tsx`
- **Nuxt.js (Vue)**: See `apps/nuxt-app/pages/ai.vue`
- **TanStack Start (React)**: See `apps/tanstack-app/src/routes/$lang/(root)/ai.tsx`

## 🔧 Adding New AI Providers

### 1. Install Provider Package

```bash
pnpm add @ai-sdk/<provider-name>
```

### 2. Update Type Definitions (`types.ts`)

```typescript
import type { NewProviderSettings } from '@ai-sdk/new-provider';

export type ProviderName = 'qwen' | 'openai' | 'deepseek' | 'new-provider';

export type ProviderConfig = {
  qwen: QwenConfig;
  openai: OpenAIConfig;
  deepseek: DeepSeekConfig;
  'new-provider': NewProviderSettings;
};
```

### 3. Update Environment Configuration (`config.ts`)

```typescript
const ENV_KEYS = {
  'new-provider': {
    apiKey: 'NEW_PROVIDER_API_KEY',
    baseURL: 'NEW_PROVIDER_BASE_URL' // if needed
  }
} as const;
```

### 4. Add Provider Creation Logic (`providers.ts`)

```typescript
import { createNewProvider } from '@ai-sdk/new-provider';

export function createProvider(providerName: ProviderName, config: ProviderConfig[ProviderName]) {
  switch (providerName) {
    // ... existing cases
    case 'new-provider':
      return createNewProvider(config);
    default:
      throw new Error(`Unsupported provider: ${providerName}`);
  }
}
```

## 🎯 Features

1. **Multi-provider Support**: Unified interface supporting Qwen, DeepSeek, OpenAI
2. **Streaming Response**: Real-time streaming output based on Vercel AI SDK v5
3. **AI Elements**: Integrated modern AI chat component library
4. **Type Safety**: Complete TypeScript type support
5. **Extensible**: Support for adding new AI providers

## 📦 Dependencies

```json
{
  "ai": "5.0.71",
  "@ai-sdk/openai": "2.0.52",
  "@ai-sdk/openai-compatible": "1.0.7",
  "@ai-sdk/deepseek": "1.0.23",
  "@ai-sdk/react": "latest",    // Next.js
  "@ai-sdk/vue": "latest"       // Nuxt.js
}
```

## 📚 Reference Documentation

- [Vercel AI SDK Documentation](https://sdk.vercel.ai/) - Core AI SDK usage guide
- [Qwen API Documentation](https://help.aliyun.com/zh/dashscope/) - Alibaba Cloud large model service
- [DeepSeek API Documentation](https://platform.deepseek.com/api-docs/) - DeepSeek open platform
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference) - OpenAI API reference
