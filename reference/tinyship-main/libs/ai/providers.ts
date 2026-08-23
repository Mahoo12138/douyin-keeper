import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { fal, createFal } from '@ai-sdk/fal';
import { google, createGoogleGenerativeAI } from '@ai-sdk/google';
import type { ChatProviderName, ImageProviderName, VideoProviderName, ProviderConfig } from './types';

/**
 * Create a chat-capable AI provider instance
 * 
 * These providers support the callable pattern: provider(modelName)
 * - qwen: Chat + Image (via OpenAI-compatible API)
 * - openai: Chat + Image (DALL-E)
 * - deepseek: Chat only
 */
export function createChatProvider(
  providerName: ChatProviderName,
  config?: ProviderConfig[ChatProviderName]
) {
  switch (providerName) {
    case 'qwen': {
      const qwenConfig = config as ProviderConfig['qwen'] | undefined;
      return createOpenAICompatible({
        name: 'qwen',
        apiKey: qwenConfig?.apiKey || process.env.QWEN_API_KEY || '',
        baseURL: qwenConfig?.baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        includeUsage: true
      });
    }
    case 'openai': {
      return createOpenAI(config as ProviderConfig['openai']);
    }
    case 'deepseek': {
      return createDeepSeek(config as ProviderConfig['deepseek']);
    }
    default:
      throw new Error(`Unsupported chat provider: ${providerName}`);
  }
}

/**
 * Create an image-capable AI provider instance
 * 
 * Returns the provider object for image generation
 * - fal: Image only (Flux models)
 * - openai: Chat + Image (DALL-E)
 */
export function createImageProvider(
  providerName: ImageProviderName,
  config?: ProviderConfig[ImageProviderName]
) {
  switch (providerName) {
    case 'fal': {
      const falConfig = config as ProviderConfig['fal'] | undefined;
      if (falConfig?.apiKey) {
        return createFal({ apiKey: falConfig.apiKey });
      }
      // Use default fal instance (reads FAL_API_KEY from env)
      return fal;
    }
    case 'openai': {
      return createOpenAI(config as ProviderConfig['openai']);
    }
    case 'qwen': {
      // Qwen image generation uses native HTTP, not AI SDK
      // Return null to indicate direct API usage is required
      return null;
    }
    case 'gemini': {
      const geminiConfig = config as ProviderConfig['gemini'] | undefined;
      const apiKey = geminiConfig?.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      const baseURL = geminiConfig?.baseURL || process.env.GOOGLE_GENERATIVE_AI_BASE_URL;

      if (apiKey && baseURL) {
        // For third-party Gemini gateways (e.g. jiekou), Bearer auth is common.
        // Keep apiKey for default x-goog-api-key behavior while adding Authorization header.
        return createGoogleGenerativeAI({
          apiKey,
          baseURL,
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });
      }

      if (apiKey) {
        return createGoogleGenerativeAI({
          apiKey,
        });
      }

      // Use default google instance (reads GOOGLE_GENERATIVE_AI_API_KEY from env)
      return google;
    }
    default:
      throw new Error(`Unsupported image provider: ${providerName}`);
  }
}

/**
 * Create a video-capable AI provider instance
 * 
 * Returns the provider object for video generation via AI SDK
 * - fal: Video generation (Luma, HunyuanVideo models)
 * - volcengine: Uses native HTTP (returns null)
 * - aliyun: Uses native HTTP (returns null)
 */
export function createVideoProvider(
  providerName: VideoProviderName,
  config?: ProviderConfig[VideoProviderName]
) {
  switch (providerName) {
    case 'fal': {
      const falConfig = config as ProviderConfig['fal'] | undefined;
      if (falConfig?.apiKey) {
        return createFal({ apiKey: falConfig.apiKey });
      }
      // Use default fal instance (reads FAL_API_KEY from env)
      return fal;
    }
    case 'volcengine':
    case 'aliyun': {
      // These providers use native HTTP calls, not AI SDK
      // Return null to indicate direct API usage is required
      return null;
    }
    default:
      throw new Error(`Unsupported video provider: ${providerName}`);
  }
}

// Legacy alias for backwards compatibility
export const createProvider = createChatProvider;

// Re-export the default fal instance for convenience
export { fal } from '@ai-sdk/fal';
