/**
 * AI Video Generation Configuration
 * Providers: fal (AI SDK), volcengine (native HTTP), aliyun (native HTTP)
 */

export const aiVideoConfig = {
  /**
   * Default Video Provider
   * @type {'fal' | 'volcengine' | 'aliyun'}
   */
  defaultProvider: 'volcengine' as const,

  /**
   * Default Model for each video provider
   */
  defaultModels: {
    fal: 'kling-video/v2.5-turbo/pro/text-to-video',
    volcengine: 'doubao-seedance-1-5-pro-251215',
    aliyun: 'wan2.6-t2v',
  },

  /**
   * Available Video Models for each provider
   */
  availableModels: {
    fal: [
      'kling-video/v2.5-turbo/pro/text-to-video',
      'kling-video/v2.5-turbo/pro/image-to-video',
    ],
    volcengine: ['doubao-seedance-1-5-pro-251215', 'doubao-seedance-1-0-pro-250528'],
    aliyun: ['wan2.6-t2v', 'wan2.5-t2v-turbo', 'wan2.6-i2v-flash'],
  },

  /**
   * Aspect ratio options for fal (format: width:height)
   */
  falAspectRatios: [
    { value: '16:9', label: '16:9' },
    { value: '9:16', label: '9:16' },
    { value: '1:1', label: '1:1' },
    { value: '4:3', label: '4:3' },
    { value: '3:4', label: '3:4' },
    { value: '21:9', label: '21:9' },
    { value: '9:21', label: '9:21' },
  ],

  /**
   * Size options for Volcengine Seedance (format: widthxheight)
   */
  volcengineSizes: [
    { value: '1920x1080', label: '1080P 16:9' },
    { value: '1080x1920', label: '1080P 9:16' },
    { value: '1280x720', label: '720P 16:9' },
    { value: '720x1280', label: '720P 9:16' },
  ],

  /**
   * Size options for Aliyun Wanxiang (format: width*height)
   */
  aliyunSizes: [
    { value: '1280*720', label: '720P 16:9' },
    { value: '720*1280', label: '720P 9:16' },
    { value: '960*960', label: '960P 1:1' },
  ],

  /**
   * Duration options (in seconds)
   */
  durationOptions: {
    fal: [5, 10],
    volcengine: [5, 10],
    aliyun: [5, 10],
  },

  /**
   * Default generation parameters
   */
  defaults: {
    duration: 5,
    promptExtend: true,
    watermark: false,
  },

  /**
   * Polling configuration for async providers
   */
  polling: {
    /** Interval between status checks in milliseconds */
    intervalMs: 3000,
    /** Maximum polling duration in milliseconds (10 minutes) */
    maxTimeoutMs: 600000,
  },
} as const;

// Type exports for external use
export type VideoProviderName = 'fal' | 'volcengine' | 'aliyun';

/**
 * Get size/aspect ratio options for a video provider
 */
export function getVideoSizesForProvider(provider: VideoProviderName) {
  switch (provider) {
    case 'fal': return aiVideoConfig.falAspectRatios;
    case 'volcengine': return aiVideoConfig.volcengineSizes;
    case 'aliyun': return aiVideoConfig.aliyunSizes;
    default: return [];
  }
}

/**
 * Get duration options for a video provider
 */
export function getVideoDurationsForProvider(provider: VideoProviderName) {
  return aiVideoConfig.durationOptions[provider] || [5];
}
