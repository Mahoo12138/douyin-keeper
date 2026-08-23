export * from './types';
export { 
  createChatProvider, 
  createImageProvider, 
  createVideoProvider,
  createProvider, // Legacy alias
  fal 
} from './providers';
export { 
  getConfig, 
  getProviderConfig, 
  getApiKey, 
  getBaseUrl, 
  hasCapability,
} from './config';
export { streamResponse, streamResponseWithUsage } from './utils';
export { 
  generateImageResponse, 
  calculateImageCreditCost,
  getImageSizesForProvider,
} from './image';
export {
  generateVideoResponse,
  createVideoTask,
  queryVideoTask,
  calculateVideoCreditCost,
  getVideoSizesForProvider,
  getVideoDurationsForProvider,
} from './video';

// Re-export image config from config folder
export { aiImageConfig } from '../../config/aiImage';

// Re-export video config from config folder
export { aiVideoConfig } from '../../config/aiVideo';

import { createChatProvider } from './providers';
import { getConfig, getProviderConfig } from './config';
import type { ChatProviderName } from './types';

/**
 * Create a chat AI handler with default or specified provider
 * For image generation, use generateImageResponse() instead
 */
export function createAIHandler(options: { provider?: ChatProviderName } = {}) {
  if (options.provider) {
    return createChatProvider(options.provider, getProviderConfig(options.provider));
  }
  const config = getConfig();
  return createChatProvider(config.provider, config.config);
}
