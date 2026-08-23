/**
 * AI Chat Configuration
 */

export const aiConfig = {
  /**
   * Default AI Provider
   * @type {'qwen' | 'deepseek' | 'openai'}
   */
  defaultProvider: 'qwen' as const,

  /**
   * Default Model for each provider
   */
  defaultModels: {
    qwen: 'qwen-turbo',
    deepseek: 'deepseek-chat',
    openai: 'gpt-5'
  },

  /**
   * Available Models for each provider
   * These will be displayed in the model selector dropdown
   */
  availableModels: {
    qwen: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
    deepseek: ['deepseek-chat', 'deepseek-coder'],
    openai: ['gpt-5', 'gpt-5-codex', 'gpt-5-pro']
  },

  /**
   * Provider API Keys Configuration
   * Note: These are configured via environment variables in libs/ai/config.ts
   * - QWEN_API_KEY and QWEN_BASE_URL
   * - DEEPSEEK_API_KEY
   * - OPENAI_API_KEY and OPENAI_BASE_URL
   * - FAL_API_KEY
   */
} as const;
