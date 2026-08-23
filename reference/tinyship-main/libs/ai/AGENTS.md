# AGENTS.md

## Overview

AI integration library built on **Vercel AI SDK v6** supporting multiple providers (Qwen, DeepSeek, OpenAI, fal.ai) with unified interface. Provides streaming chat functionality, **AI image generation**, AI Elements components, and type-safe provider management for Next.js, Nuxt.js, and TanStack Start applications.

## Setup Commands

```bash
# Install dependencies (usually already included in apps)
pnpm add ai@latest @ai-sdk/openai @ai-sdk/openai-compatible @ai-sdk/deepseek @ai-sdk/fal @ai-sdk/react @ai-sdk/vue

# Environment configuration required
# Add to .env file:
AI_PROVIDER=qwen  # Default provider

# Chat Providers
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=optional_base_url

QWEN_API_KEY=your_qwen_api_key
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

DEEPSEEK_API_KEY=your_deepseek_api_key

# Image Generation Providers
FAL_API_KEY=your_fal_api_key
# Note: Qwen and OpenAI keys are reused for image generation
```

## Code Style

- Unified provider interface with `createAIHandler()` factory
- Environment variable configuration with fallback defaults
- TypeScript types for all provider configurations
- Streaming response patterns with Vercel AI SDK
- Provider-agnostic message handling
- Extensible architecture for new AI providers

## Usage Examples

### Backend API Routes

```typescript
import { createAIHandler, streamResponse } from '@libs/ai';

// Next.js API route
export async function POST(req: Request) {
  const { messages } = await req.json();
  
  // Using default provider
  const defaultHandler = createAIHandler();
  
  // Using specific provider
  const qwenHandler = createAIHandler({ provider: 'qwen' });
  
  // Stream response
  return streamResponse({
    messages,
    provider: 'qwen',
    model: 'qwen-max' // optional
  });
}

// Nuxt.js API route
export default defineEventHandler(async (event) => {
  const { messages } = await readBody(event);
  
  return streamResponse({
    messages,
    provider: 'deepseek',
    model: 'deepseek-chat'
  });
});
```

### Frontend Components

```typescript
// Next.js (React)
'use client';
import { useChat } from '@ai-sdk/react';

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat'
  });
  
  return (
    <div>
      {messages.map(message => (
        <div key={message.id}>{message.content}</div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
      </form>
    </div>
  );
}

// Nuxt.js (Vue)
<template>
  <div>
    <div v-for="message in messages" :key="message.id">
      {{ message.content }}
    </div>
    <form @submit="handleSubmit">
      <input v-model="input" />
    </form>
  </div>
</template>

<script setup>
import { useChat } from '@ai-sdk/vue';

const { messages, input, handleSubmit } = useChat({
  api: '/api/chat'
});
</script>
```

### Provider Selection

```typescript
import { createAIHandler } from '@libs/ai';

// Use environment default
const defaultHandler = createAIHandler();

// Specify provider explicitly
const providers = {
  qwen: createAIHandler({ provider: 'qwen' }),
  deepseek: createAIHandler({ provider: 'deepseek' }),
  openai: createAIHandler({ provider: 'openai' })
};
```

## Common Tasks

### Supported Providers

| Provider | Models | Strengths | API Key Source |
|----------|--------|-----------|----------------|
| **Qwen** (Recommended) | `qwen-max`, `qwen-plus`, `qwen-turbo` | Chinese support, cost-effective | [Aliyun DashScope](https://dashscope.aliyun.com/) |
| **DeepSeek** | `deepseek-chat`, `deepseek-coder` | Coding abilities, low cost | [DeepSeek Platform](https://platform.deepseek.com/) |
| **OpenAI** | `gpt-5`, `gpt-5-codex`, `gpt-5-pro` | Performance, ecosystem | [OpenAI Platform](https://platform.openai.com/) |

### Add New Provider

1. **Install SDK package**:
```bash
pnpm add @ai-sdk/new-provider
```

2. **Update types** (`types.ts`):
```typescript
export type ProviderName = 'qwen' | 'openai' | 'deepseek' | 'new-provider';

export type ProviderConfig = {
  // ... existing configs
  'new-provider': NewProviderSettings;
};
```

3. **Add environment keys** (`config.ts`):
```typescript
const ENV_KEYS = {
  'new-provider': {
    apiKey: 'NEW_PROVIDER_API_KEY',
    baseURL: 'NEW_PROVIDER_BASE_URL'
  }
};
```

4. **Implement provider** (`providers.ts`):
```typescript
import { createNewProvider } from '@ai-sdk/new-provider';

case 'new-provider':
  return createNewProvider(config);
```

### Model Configuration

```typescript
// Provider-specific models
const modelOptions = {
  qwen: 'qwen-max',      // Chinese optimized
  deepseek: 'deepseek-chat', // General chat
  openai: 'gpt-5'        // High performance
};
```

## Testing Instructions

```bash
# Test AI integration
# 1. Verify environment variables are set for chosen provider
# 2. Test basic chat functionality in all three apps
# 3. Verify streaming responses work correctly
# 4. Test provider switching functionality

# Provider testing
# 1. Test each provider with simple prompts
# 2. Verify Chinese/English responses for Qwen
# 3. Test coding prompts with DeepSeek
# 4. Verify error handling for invalid API keys
```

## Troubleshooting

### Configuration Issues
- Check `AI_PROVIDER` environment variable is set
- Verify provider-specific API keys are configured
- Ensure base URLs are correct for custom endpoints

### API Key Problems
- **Qwen**: Verify key from Aliyun DashScope console
- **DeepSeek**: Check key from DeepSeek platform
- **OpenAI**: Confirm key has sufficient credits and permissions

### Streaming Issues
- Verify Vercel AI SDK version compatibility
- Check network connectivity to provider endpoints
- Ensure frontend properly handles streaming responses

### Provider Selection
- Default provider comes from `AI_PROVIDER` environment variable
- Explicit provider selection overrides default
- Missing provider configuration falls back gracefully

## Architecture Notes

- **Vercel AI SDK v5 Foundation**: Built on latest streaming AI framework with improved message handling
- **AI Elements Integration**: Modern chat UI components for React and Vue
- **Multi-Provider Support**: Unified interface across different AI services
- **Environment Configuration**: Centralized config with environment variable fallbacks
- **Type Safety**: Full TypeScript support for all providers and models
- **Framework Agnostic**: Works with Next.js, Nuxt.js, and TanStack Start applications
- **Streaming First**: Optimized for real-time streaming responses with UIMessage format
- **Extensible Design**: Easy addition of new AI providers following established patterns
- **Production Ready**: Used in chat interfaces across all three applications
