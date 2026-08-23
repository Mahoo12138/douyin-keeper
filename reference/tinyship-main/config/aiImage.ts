/**
 * AI Image Generation Configuration
 * Providers: qwen (native HTTP), fal (AI SDK), openai (AI SDK), gemini (AI SDK)
 */

export const aiImageConfig = {
  /**
   * Default Image Provider
   * @type {'qwen' | 'fal' | 'openai' | 'gemini'}
   */
  defaultProvider: 'qwen' as const,

  /**
   * Default Model for each image provider
   */
  defaultModels: {
    qwen: 'qwen-image-plus',
    fal: 'fal-ai/qwen-image-2512/lora',
    openai: 'dall-e-3',
    gemini: 'gemini-2.5-flash-image'
  },

  /**
   * Available Image Models for each provider
   */
  availableModels: {
    qwen: ['qwen-image-plus', 'qwen-image-max'],
    fal: ['fal-ai/qwen-image-2512/lora', 'fal-ai/nano-banana-pro', 'fal-ai/recraft/v3/text-to-image', 'fal-ai/flux/dev'],
    openai: ['dall-e-3', 'dall-e-2'],
    gemini: [
      'gemini-3.1-flash-image-preview',
      'gemini-3-pro-image-preview',
      'gemini-2.5-flash-image'
    ]
  },

  /**
   * Size options for Qwen (format: width*height)
   */
  qwenSizes: [
    { value: '1664*928', label: '16:9' },
    { value: '1472*1104', label: '4:3' },
    { value: '1328*1328', label: '1:1' },
    { value: '1104*1472', label: '3:4' },
    { value: '928*1664', label: '9:16' },
  ],

  /**
   * Aspect ratio options for fal (format: width:height)
  */
  falAspectRatios: [
    { value: '21:9', label: '21:9' },
    { value: '16:9', label: '16:9' },
    { value: '4:3', label: '4:3' },
    { value: '1:1', label: '1:1' },
    { value: '3:4', label: '3:4' },
    { value: '9:16', label: '9:16' },
    { value: '9:21', label: '9:21' },
  ],

  /**
   * Size options for OpenAI DALL-E (format: widthxheight)
   */
  openaiSizes: [
    { value: '1024x1024', label: '1:1' },
    { value: '1792x1024', label: '16:9' },
    { value: '1024x1792', label: '9:16' },
  ],

  /**
   * Aspect ratio options for Gemini (format: width:height)
   */
  geminiAspectRatios: [
    { value: '21:9', label: '21:9' },
    { value: '16:9', label: '16:9' },
    { value: '5:4', label: '5:4' },
    { value: '4:3', label: '4:3' },
    { value: '3:2', label: '3:2' },
    { value: '1:1', label: '1:1' },
    { value: '2:3', label: '2:3' },
    { value: '3:4', label: '3:4' },
    { value: '4:5', label: '4:5' },
    { value: '9:16', label: '9:16' },
  ],

  /**
   * Default generation parameters
   */
  defaults: {
    numInferenceSteps: 28,
    guidanceScale: 4,
    promptExtend: true,
    watermark: false,
  },
} as const;

// Type exports for external use
export type ImageProviderName = 'qwen' | 'fal' | 'openai' | 'gemini';

/**
 * Get size/aspect ratio options for a provider
 */
export function getImageSizesForProvider(provider: ImageProviderName) {
  switch (provider) {
    case 'qwen': return aiImageConfig.qwenSizes;
    case 'fal': return aiImageConfig.falAspectRatios;
    case 'openai': return aiImageConfig.openaiSizes;
    case 'gemini': return aiImageConfig.geminiAspectRatios;
    default: return [];
  }
}
