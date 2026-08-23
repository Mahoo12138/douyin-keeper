import type { DeepSeekProviderSettings } from '@ai-sdk/deepseek';
import type { OpenAIProviderSettings } from '@ai-sdk/openai';
import type { UIMessage } from 'ai';

// All supported providers (including video-only providers)
export type AllProviderName = 'qwen' | 'openai' | 'deepseek' | 'fal' | 'volcengine' | 'aliyun' | 'gemini';

// Chat-capable providers (excludes fal which is image-only)
export type ChatProviderName = 'qwen' | 'openai' | 'deepseek';

// Legacy alias for backwards compatibility
export type ProviderName = ChatProviderName;

// Provider configurations
export type QwenConfig = {
  apiKey: string;
  baseURL?: string;
};
export type OpenAIConfig = OpenAIProviderSettings;
export type DeepSeekConfig = DeepSeekProviderSettings;
export type FalConfig = {
  apiKey?: string;  // Optional: uses FAL_API_KEY env var by default
};
export type VolcengineConfig = {
  apiKey: string;
  baseURL?: string;
};
export type AliyunConfig = {
  apiKey: string;
  baseURL?: string;
};
export type GeminiConfig = {
  apiKey?: string;  // Optional: uses GOOGLE_GENERATIVE_AI_API_KEY env var by default
  baseURL?: string;
};

export type ProviderConfig = {
  qwen: QwenConfig;
  openai: OpenAIConfig;
  deepseek: DeepSeekConfig;
  fal: FalConfig;
  volcengine: VolcengineConfig;
  aliyun: AliyunConfig;
  gemini: GeminiConfig;
};

export interface AIConfig {
  provider: ProviderName;
  config: ProviderConfig[ProviderName];
}

export interface ChatRequestOptions {
  messages: UIMessage[];
  extra?: {
    provider?: ProviderName;
    model?: string;
  };
}

// Image Generation Provider Types
export type ImageProviderName = 'qwen' | 'fal' | 'openai' | 'gemini';

export type QwenImageSize = '1664*928' | '1472*1104' | '1328*1328' | '1104*1472' | '928*1664';
export type OpenAIImageSize = '1024x1024' | '1792x1024' | '1024x1792' | '512x512' | '256x256';
export type FalAspectRatio = '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '9:21';

export interface ImageGenerationOptions {
  prompt: string;
  provider: ImageProviderName;
  model?: string;
  negativePrompt?: string;
  size?: string;
  aspectRatio?: string;
  seed?: number;
  // Qwen-specific options
  promptExtend?: boolean;
  watermark?: boolean;
  // Fal-specific options
  numInferenceSteps?: number;
  guidanceScale?: number;
}

export interface ImageGenerationResult {
  imageUrl: string;
  width?: number;
  height?: number;
  provider: ImageProviderName;
  model: string;
  seed?: number;
}

// Qwen Image API Types
export interface QwenImageRequest {
  model: string;
  input: {
    messages: Array<{
      role: 'user';
      content: Array<{ text: string }>;
    }>;
  };
  parameters?: {
    negative_prompt?: string;
    prompt_extend?: boolean;
    watermark?: boolean;
    size?: string;
    seed?: number;
    n?: number;
  };
}

export interface QwenImageResponse {
  output: {
    choices: Array<{
      finish_reason: string;
      message: {  // Note: singular "message", not "messages"
        role: string;
        content: Array<{ image: string }>;
      };
    }>;
    task_metric?: {
      TOTAL: number;
      SUCCEEDED: number;
      FAILED: number;
    };
  };
  usage: {
    image_count: number;
    width: number;
    height: number;
  };
  request_id: string;
  code?: string;
  message?: string;
}

// ============================================================
// Video Generation Types
// ============================================================

/** Supported video generation providers */
export type VideoProviderName = 'fal' | 'volcengine' | 'aliyun';

/** Task status for async video generation providers */
export type VideoTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed';

/** Options for video generation request */
export interface VideoGenerationOptions {
  prompt: string;
  provider: VideoProviderName;
  model?: string;
  /** Video size/resolution (e.g., '1280*720', '1920x1080') */
  size?: string;
  /** Aspect ratio (for fal, e.g., '16:9') */
  aspectRatio?: string;
  /** Video duration in seconds */
  duration?: number;
  seed?: number;
  // Fal-specific options
  /** Whether the video should loop (fal only) */
  loop?: boolean;
  /** Motion strength 0-1 (fal only) */
  motionStrength?: number;
  // Aliyun-specific options
  /** Enable prompt auto-extension (aliyun only) */
  promptExtend?: boolean;
  /** Add watermark (aliyun only) */
  watermark?: boolean;
  /** Input audio URL for multi-shot generation (aliyun only) */
  audioUrl?: string;
  /** Shot type for aliyun models, e.g. single/multi */
  shotType?: 'single' | 'multi';
  /** First frame image URL for image-to-video */
  firstFrameUrl?: string;
  /** Last frame image URL for first-last-frame generation */
  lastFrameUrl?: string;
}

/** Result of a completed video generation */
export interface VideoGenerationResult {
  videoUrl: string;
  /** Duration of the generated video in seconds */
  duration?: number;
  provider: VideoProviderName;
  model: string;
  /** Cover/thumbnail image URL (if available) */
  coverImageUrl?: string;
}

// ============================================================
// Volcengine Video API Types (Seedance)
// ============================================================

/** Volcengine create video task request body */
export interface VolcengineVideoRequest {
  model: string;
  content: Array<
    | {
      type: 'text';
      text: string;
    }
    | {
      type: 'image_url';
      image_url: {
        url: string;
      };
      role?: 'first_frame' | 'last_frame';
    }
  >;
  ratio?: string;
  resolution?: '480p' | '720p' | '1080p';
  duration?: number;
  seed?: number;
  watermark?: boolean;
}

/** Volcengine create task response */
export interface VolcengineCreateTaskResponse {
  id: string;
}

/** Volcengine query task response */
export interface VolcengineQueryTaskResponse {
  id: string;
  model?: string;
  status: string; // 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled'
  content?: {
    video_url?: string;
    cover_url?: string;
  };
  duration?: number;
  usage?: {
    completion_tokens?: number;
    total_tokens?: number;
  };
  created_at?: number;
  updated_at?: number;
  ratio?: string;
  error?: {
    code?: string;
    message?: string;
  };
}

// ============================================================
// Aliyun Wanxiang Video API Types
// ============================================================

/** Aliyun create video task request body */
export interface AliyunVideoRequest {
  model: string;
  input: {
    prompt: string;
    audio_url?: string;
    image_url?: string;
    img_url?: string;
    first_frame_url?: string;
    last_frame_url?: string;
  };
  parameters?: {
    size?: string;
    resolution?: '480P' | '720P' | '1080P';
    audio?: boolean;
    duration?: number;
    prompt_extend?: boolean;
    seed?: number;
    watermark?: boolean;
    shot_type?: 'single' | 'multi';
  };
}

/** Aliyun create task response */
export interface AliyunCreateTaskResponse {
  output: {
    task_status: string; // 'PENDING'
    task_id: string;
  };
  request_id: string;
  code?: string;
  message?: string;
}

/** Aliyun query task response */
export interface AliyunQueryTaskResponse {
  output: {
    task_status: string; // 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
    task_id: string;
    video_url?: string;
    orig_video_url?: string;
    video_urls?: string[];
    results?: Array<{
      video_url?: string;
      url?: string;
    }>;
    task_metrics?: {
      TOTAL: number;
      SUCCEEDED: number;
      FAILED: number;
    };
  };
  usage?: {
    video_count?: number;
    video_duration?: number;
  };
  request_id: string;
  code?: string;
  message?: string;
}
