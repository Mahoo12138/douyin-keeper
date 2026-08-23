import { generateImage } from 'ai';
import { config } from '@config';
import { createImageProvider } from './providers';
import type {
  ImageProviderName,
  ImageGenerationOptions,
  ImageGenerationResult,
  QwenImageRequest,
  QwenImageResponse,
} from './types';
import { getProviderConfig } from './config';

// Re-export from config for backwards compatibility
export { getImageSizesForProvider } from '../../config/aiImage';

// Qwen Image API endpoint
const QWEN_IMAGE_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

// Default models for each provider
const DEFAULT_MODELS: Record<ImageProviderName, string> = {
  qwen: 'qwen-image-max',
  fal: 'fal-ai/qwen-image-2512/lora',
  openai: 'dall-e-3',
  gemini: 'gemini-2.5-flash-image',
};

/**
 * Generate image using Qwen-Image API (native HTTP)
 * Qwen doesn't use AI SDK - requires direct HTTP calls
 */
async function qwenImageGenerate(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
  const config = getProviderConfig('qwen');
  
  if (!config.apiKey) {
    throw new Error('QWEN_API_KEY is not configured');
  }

  const model = options.model || DEFAULT_MODELS.qwen;

  const requestBody: QwenImageRequest = {
    model,
    input: {
      messages: [
        {
          role: 'user',
          content: [{ text: options.prompt }],
        },
      ],
    },
    parameters: {
      negative_prompt: options.negativePrompt,
      prompt_extend: options.promptExtend ?? true,
      watermark: options.watermark ?? false,
      size: options.size || '1328*1328',
      seed: options.seed,
    },
  };

  const response = await fetch(QWEN_IMAGE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Qwen Image API error: ${response.status} - ${errorText}`);
  }

  const data: QwenImageResponse = await response.json();

  console.log('Qwen Image API response:', JSON.stringify(data, null, 2));

  // Check for API-level errors
  if (data.code) {
    throw new Error(`Qwen Image API error: ${data.code} - ${data.message}`);
  }

  // Extract image URL from response
  // Note: API returns "message" (singular), not "messages"
  const imageUrl = data.output?.choices?.[0]?.message?.content?.[0]?.image;
  
  if (!imageUrl) {
    console.error('Failed to extract image URL. Response structure:', {
      hasOutput: !!data.output,
      hasChoices: !!data.output?.choices,
      choicesLength: data.output?.choices?.length,
      firstChoice: data.output?.choices?.[0],
    });
    throw new Error('No image URL in Qwen Image API response');
  }

  return {
    imageUrl,
    width: data.usage?.width,
    height: data.usage?.height,
    provider: 'qwen',
    model,
  };
}

/**
 * Generate image using fal.ai (Flux models)
 */
async function falImageGenerate(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
  const model = options.model || DEFAULT_MODELS.fal;
  const imageProvider = createImageProvider('fal');

  if (!imageProvider) {
    throw new Error('FAL_API_KEY is not configured');
  }

  // Build fal-specific options (use camelCase as required by @ai-sdk/fal v2)
  const falOpts: { numInferenceSteps?: number; guidanceScale?: number } = {};
  if (options.numInferenceSteps !== undefined) {
    falOpts.numInferenceSteps = options.numInferenceSteps;
  }
  if (options.guidanceScale !== undefined) {
    falOpts.guidanceScale = options.guidanceScale;
  }

  const { image } = await generateImage({
    model: imageProvider.image(model),
    prompt: options.prompt,
    aspectRatio: options.aspectRatio as `${number}:${number}` | undefined,
    seed: options.seed,
    providerOptions: Object.keys(falOpts).length > 0 ? { fal: falOpts } : undefined,
  });

  const imageUrl = image.base64.startsWith('data:') 
    ? image.base64 
    : `data:${image.mediaType};base64,${image.base64}`;

  return {
    imageUrl,
    provider: 'fal',
    model,
    seed: options.seed,
  };
}

/**
 * Generate image using OpenAI DALL-E
 */
async function openaiImageGenerate(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
  const model = options.model || DEFAULT_MODELS.openai;
  const imageProvider = createImageProvider('openai');

  if (!imageProvider) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const { image } = await generateImage({
    model: imageProvider.image(model),
    prompt: options.prompt,
    size: options.size as `${number}x${number}` | undefined,
    providerOptions: {
      openai: {
        quality: 'hd' as const,
        style: 'vivid' as const,
      },
    },
  });

  const imageUrl = image.base64.startsWith('data:') 
    ? image.base64 
    : `data:${image.mediaType};base64,${image.base64}`;

  return {
    imageUrl,
    provider: 'openai',
    model,
    seed: options.seed,
  };
}

/**
 * Generate image using Google Gemini
 */
async function geminiImageGenerate(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
  const model = options.model || DEFAULT_MODELS.gemini;
  const imageProvider = createImageProvider('gemini');

  if (!imageProvider) {
    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not configured');
  }

  const { image } = await generateImage({
    model: imageProvider.image(model),
    prompt: options.prompt,
    aspectRatio: options.aspectRatio as `${number}:${number}` | undefined,
    seed: options.seed,
  });

  const imageUrl = image.base64.startsWith('data:')
    ? image.base64
    : `data:${image.mediaType};base64,${image.base64}`;

  return {
    imageUrl,
    provider: 'gemini',
    model,
    seed: options.seed,
  };
}

/**
 * Main function to generate images with multi-provider support
 */
export async function generateImageResponse(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
  switch (options.provider || 'qwen') {
    case 'qwen':
      return qwenImageGenerate(options);
    case 'fal':
      return falImageGenerate(options);
    case 'openai':
      return openaiImageGenerate(options);
    case 'gemini':
      return geminiImageGenerate(options);
    default:
      throw new Error(`Unsupported image provider: ${options.provider}`);
  }
}

/**
 * Calculate credit consumption for image generation
 * Uses config.credits.fixedConsumption.aiImage for pricing
 * Now uses unified flat format: { default, models: { modelName: cost } }
 */
export function calculateImageCreditCost(options: {
  provider: ImageProviderName;
  model?: string;
}): number {
  const { model } = options;
  const aiImageConfig = config.credits.fixedConsumption.aiImage;

  // Simple number case (all images cost the same)
  if (typeof aiImageConfig === 'number') {
    return aiImageConfig;
  }

  // Check for model-specific cost
  if (model && aiImageConfig.models && model in aiImageConfig.models) {
    return aiImageConfig.models[model];
  }

  // Fall back to default
  return aiImageConfig.default;
}
