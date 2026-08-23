import type { AIConfig, ProviderName, ProviderConfig, AllProviderName, ImageProviderName } from './types';

/** Supported capability types for each provider */
type ProviderCapability = 'chat' | 'image' | 'video';

/**
 * Unified provider configuration
 * Supports chat, image, and video generation capabilities
 */
const PROVIDER_ENV_KEYS: Record<AllProviderName, {
  apiKey: string;
  baseURL?: string;
  capabilities: readonly ProviderCapability[];
}> = {
  // Chat + Image providers
  openai: {
    apiKey: 'OPENAI_API_KEY',
    baseURL: 'OPENAI_BASE_URL',
    capabilities: ['chat', 'image'],
  },
  qwen: {
    apiKey: 'QWEN_API_KEY',
    baseURL: 'QWEN_BASE_URL',
    capabilities: ['chat', 'image'],
  },
  // Chat only providers
  deepseek: {
    apiKey: 'DEEPSEEK_API_KEY',
    capabilities: ['chat'],
  },
  // Image + Video providers
  fal: {
    apiKey: 'FAL_API_KEY',
    capabilities: ['image', 'video'],
  },
  // Video only providers
  volcengine: {
    apiKey: 'VOLCENGINE_ACCESS_KEY_ID',
    baseURL: 'VOLCENGINE_BASE_URL',
    capabilities: ['video'],
  },
  aliyun: {
    // Reuse Qwen DashScope credentials by default.
    apiKey: 'QWEN_API_KEY',
    baseURL: 'QWEN_BASE_URL',
    capabilities: ['video'],
  },
  // Google Gemini - Image generation
  gemini: {
    apiKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    baseURL: 'GOOGLE_GENERATIVE_AI_BASE_URL',
    capabilities: ['image'],
  },
};

/**
 * Get API key for any provider
 */
export function getApiKey(provider: AllProviderName): string {
  const envKey = PROVIDER_ENV_KEYS[provider];
  return process.env[envKey.apiKey] || '';
}

/**
 * Get base URL for providers that support custom endpoints
 */
export function getBaseUrl(provider: AllProviderName): string | undefined {
  const envKey = PROVIDER_ENV_KEYS[provider];
  if (envKey.baseURL) {
    return process.env[envKey.baseURL] || undefined;
  }
  return undefined;
}

/**
 * Get provider config for chat providers (legacy support)
 */
export function getProviderConfig(provider: ProviderName): ProviderConfig[ProviderName] {
  const config: Record<string, string | undefined> = {
    apiKey: getApiKey(provider),
  };

  const baseURL = getBaseUrl(provider);
  if (baseURL) {
    config.baseURL = baseURL;
  }

  return config as ProviderConfig[ProviderName];
}

/**
 * Get default AI config from environment
 */
export function getConfig(): AIConfig {
  const provider = (process.env.AI_PROVIDER as ProviderName) || 'openai';
  return {
    provider,
    config: getProviderConfig(provider),
  };
}

/**
 * Check if a provider supports a specific capability
 */
export function hasCapability(
  provider: AllProviderName,
  capability: ProviderCapability
): boolean {
  const envKey = PROVIDER_ENV_KEYS[provider];
  return envKey.capabilities.includes(capability);
}

