import { createVideoProvider } from './providers';
import { getApiKey, getBaseUrl } from './config';
import { getFixedConsumptionAmount } from '../credits/calculator';
import type {
  VideoProviderName,
  VideoGenerationOptions,
  VideoGenerationResult,
  VolcengineVideoRequest,
  AliyunVideoRequest,
  AliyunCreateTaskResponse,
  AliyunQueryTaskResponse,
  VolcengineCreateTaskResponse,
  VolcengineQueryTaskResponse,
} from './types';

// Re-export from config for backwards compatibility
export { getVideoSizesForProvider, getVideoDurationsForProvider } from '../../config/aiVideo';

// Default models for each provider
const DEFAULT_MODELS: Record<VideoProviderName, string> = {
  fal: 'kling-video/v2.5-turbo/pro/text-to-video',
  volcengine: 'doubao-seedance-1-5-pro-251215',
  aliyun: 'wan2.6-t2v',
};

function resolveVideoModel(provider: VideoProviderName, model?: string): string {
  return model || DEFAULT_MODELS[provider];
}

function readHttpUrl(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const url = (value as Record<string, unknown>).url;
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    return url;
  }
  return undefined;
}

/**
 * Extract hosted video URL from known Fal metadata fields.
 * Keep extraction strict to avoid accidental matches.
 */
function extractFalHostedVideoUrl(providerMetadata: unknown): string | undefined {
  if (!providerMetadata || typeof providerMetadata !== 'object') {
    return undefined;
  }

  const falMeta = (providerMetadata as Record<string, unknown>).fal;
  if (!falMeta || typeof falMeta !== 'object') {
    return undefined;
  }

  const fal = falMeta as Record<string, unknown>;

  // Most common shape: providerMetadata.fal.videos[0].url
  if (Array.isArray(fal.videos)) {
    for (const item of fal.videos) {
      const url = readHttpUrl(item);
      if (url) return url;
    }
  }

  // Alternate shape: providerMetadata.fal.video.url
  const singleVideoUrl = readHttpUrl(fal.video);
  if (singleVideoUrl) return singleVideoUrl;

  return undefined;
}

// Volcengine API endpoints
const VOLCENGINE_BASE_URL = 'https://ark.cn-beijing.volces.com';
const VOLCENGINE_CREATE_TASK_PATH = '/api/v3/contents/generations/tasks';

// Aliyun DashScope API endpoints
const ALIYUN_BASE_URL = 'https://dashscope.aliyuncs.com';
const ALIYUN_VIDEO_CREATE_PATH = '/api/v1/services/aigc/video-generation/video-synthesis';
const ALIYUN_TASK_QUERY_PATH = '/api/v1/tasks';

// Default polling settings
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_MAX_TIMEOUT_MS = 600000; // 10 minutes

/**
 * fal video models expect duration values without a unit suffix (e.g. "5", "10").
 */
function toFalDurationValue(duration?: number): string | undefined {
  if (duration === undefined || duration === null) {
    return undefined;
  }

  return String(Math.trunc(duration));
}

/**
 * Sleep utility for polling delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeOptionalUrl(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function getVolcengineTaskResult(model: string, result: VolcengineQueryTaskResponse): VideoGenerationResult {
  const content = result.content;
  const videoUrl = content?.video_url;
  if (!videoUrl) {
    throw new Error('No video URL in Volcengine response');
  }

  return {
    videoUrl,
    duration: result.duration,
    provider: 'volcengine',
    model,
    coverImageUrl: content?.cover_url,
  };
}

function getAliyunTaskResult(model: string, result: AliyunQueryTaskResponse): VideoGenerationResult {
  const videoUrl =
    result.output?.video_url
    || result.output?.orig_video_url
    || result.output?.video_urls?.[0]
    || result.output?.results?.[0]?.video_url
    || result.output?.results?.[0]?.url;

  if (!videoUrl) {
    throw new Error('No video URL in Aliyun DashScope response');
  }

  return {
    videoUrl,
    duration: result.usage?.video_duration,
    provider: 'aliyun',
    model,
  };
}

function buildVolcengineContent(options: VideoGenerationOptions): VolcengineVideoRequest['content'] {
  const content: VolcengineVideoRequest['content'] = [
    {
      type: 'text',
      text: options.prompt,
    },
  ];

  const firstFrameUrl = normalizeOptionalUrl(options.firstFrameUrl);
  const lastFrameUrl = normalizeOptionalUrl(options.lastFrameUrl);

  if (firstFrameUrl && lastFrameUrl) {
    content.push(
      { type: 'image_url', role: 'first_frame', image_url: { url: firstFrameUrl } },
      { type: 'image_url', role: 'last_frame', image_url: { url: lastFrameUrl } }
    );
    return content;
  }

  if (firstFrameUrl) {
    content.push({ type: 'image_url', role: 'first_frame', image_url: { url: firstFrameUrl } });
  }

  return content;
}

function getVolcengineRatio(options: VideoGenerationOptions): string | undefined {
  if (options.aspectRatio) {
    return options.aspectRatio;
  }

  // Map size to API ratio format.
  switch (options.size) {
    case '1920x1080':
    case '1280x720':
      return '16:9';
    case '1080x1920':
    case '720x1280':
      return '9:16';
    case '960x960':
      return '1:1';
    default:
      return undefined;
  }
}

function getVolcengineResolution(
  options: VideoGenerationOptions,
  model: string
): '480p' | '720p' | '1080p' {
  // Prefer explicit resolution inferred from selected size in UI.
  switch (options.size) {
    case '1920x1080':
    case '1080x1920':
      return '1080p';
    case '1280x720':
    case '720x1280':
      return '720p';
    case '854x480':
    case '480x854':
      return '480p';
    default:
      break;
  }

  // Fallback to model defaults from provider docs.
  if (
    model.includes('seedance-1-5-pro')
    || model.includes('seedance-1-0-lite')
  ) {
    return '720p';
  }

  if (
    model.includes('seedance-1-0-pro')
    || model.includes('seedance-1-0-pro-fast')
  ) {
    return '1080p';
  }

  return '720p';
}

/**
 * Build a detailed error message from Aliyun task query response.
 * Different models may return failure details in slightly different fields.
 */
function formatAliyunTaskFailure(taskId: string, data: AliyunQueryTaskResponse): string {
  const raw = data as unknown as Record<string, unknown>;
  const output = (raw.output || {}) as Record<string, unknown>;
  const usage = (raw.usage || {}) as Record<string, unknown>;

  const candidates = [
    raw.code,
    raw.message,
    raw.error_code,
    raw.error_message,
    output.code,
    output.message,
    output.error_code,
    output.error_message,
    output.status_reason,
    output.fail_reason,
    usage.message,
  ].filter(Boolean);

  const reason = candidates.length > 0
    ? candidates.map(v => String(v)).join(' | ')
    : 'No detailed reason returned by Aliyun.';

  const requestId = raw.request_id ? `request_id=${String(raw.request_id)}` : 'request_id=unknown';
  return `Aliyun video generation failed for task ${taskId}. ${requestId}. reason=${reason}`;
}

/**
 * Resolve Aliyun API base URL to origin only.
 * This avoids malformed URLs when QWEN_BASE_URL contains a path
 * such as "/compatible-mode/v1".
 */
function resolveAliyunApiBaseUrl(): string {
  const configuredBaseUrl = getBaseUrl('aliyun');
  if (!configuredBaseUrl) {
    return ALIYUN_BASE_URL;
  }

  try {
    const parsed = new URL(configuredBaseUrl);
    return parsed.origin;
  } catch {
    return ALIYUN_BASE_URL;
  }
}

function isAliyunI2VModel(model: string): boolean {
  return model.includes('-i2v-');
}

function getAliyunResolution(size?: string): '480P' | '720P' | '1080P' {
  switch (size) {
    case '1920*1080':
    case '1080*1920':
    case '1920x1080':
    case '1080x1920':
      return '1080P';
    case '1280*720':
    case '720*1280':
    case '1280x720':
    case '720x1280':
      return '720P';
    case '854*480':
    case '480*854':
    case '854x480':
    case '480x854':
      return '480P';
    default:
      return '720P';
  }
}

// ============================================================
// Fal.ai Video Generation (via AI SDK)
// ============================================================

/**
 * Generate video using fal.ai via AI SDK's experimental_generateVideo
 * SDK handles polling internally, so this is a synchronous-style call
 */
async function falVideoGenerate(options: VideoGenerationOptions): Promise<VideoGenerationResult> {
  const { experimental_generateVideo: generateVideo } = await import('ai');
  const model = resolveVideoModel('fal', options.model);
  const videoProvider = createVideoProvider('fal');
  const firstFrameUrl = normalizeOptionalUrl(options.firstFrameUrl);
  const duration = toFalDurationValue(options.duration);

  if (!videoProvider) {
    throw new Error('FAL_API_KEY is not configured');
  }

  // Build fal-specific provider options
  const falOpts: Record<string, string | number | boolean> = {};
  if (duration !== undefined) {
    falOpts.duration = duration;
  }
  if (options.loop !== undefined) {
    falOpts.loop = options.loop;
  }
  if (options.motionStrength !== undefined) {
    falOpts.motionStrength = options.motionStrength;
  }
  // Set a generous poll timeout for video generation
  falOpts.pollTimeoutMs = DEFAULT_MAX_TIMEOUT_MS;

  const result = await generateVideo({
    model: videoProvider.video(model),
    prompt: (
      firstFrameUrl
        ? { text: options.prompt, image: firstFrameUrl }
        : options.prompt
    ) as never,
    aspectRatio: options.aspectRatio as `${number}:${number}` | undefined,
    seed: options.seed,
    providerOptions: Object.keys(falOpts).length > 0 ? { fal: falOpts } : undefined,
  });
  const hostedVideoUrl = extractFalHostedVideoUrl(result.providerMetadata);
  if (!hostedVideoUrl) {
    // Fallback for models/adapters that do not expose hosted URL in providerMetadata.
    const videoUrl = `data:${result.video.mediaType};base64,${result.video.base64}`;
    return {
      videoUrl,
      duration: options.duration,
      provider: 'fal',
      model,
    };
  }

  return {
    videoUrl: hostedVideoUrl,
    duration: options.duration,
    provider: 'fal',
    model,
  };
}

// ============================================================
// Volcengine Video Generation (Seedance, native HTTP)
// ============================================================

/**
 * Create a video generation task on Volcengine
 * Returns the task_id for polling
 */
async function volcengineCreateTask(options: VideoGenerationOptions): Promise<string> {
  const apiKey = getApiKey('volcengine');
  const baseUrl = getBaseUrl('volcengine') || VOLCENGINE_BASE_URL;

  if (!apiKey) {
    throw new Error('VOLCENGINE_ACCESS_KEY_ID is not configured.');
  }

  const model = options.model || DEFAULT_MODELS.volcengine;

  // Build the request body strictly according to Volcengine video API.
  const ratio = getVolcengineRatio(options);
  const resolution = getVolcengineResolution(options, model);
  const requestBody: VolcengineVideoRequest = {
    model,
    content: buildVolcengineContent(options),
    ...(ratio ? { ratio } : {}),
    resolution,
    ...(options.duration ? { duration: options.duration } : {}),
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    watermark: options.watermark ?? false,
  };

  const url = `${baseUrl}${VOLCENGINE_CREATE_TASK_PATH}`;

  console.log('Volcengine create video task request:', { url, model, prompt: options.prompt.substring(0, 50) });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Volcengine API error: ${response.status} - ${errorText}`);
  }

  const data: VolcengineCreateTaskResponse = await response.json();

  const taskId = data.id;
  if (!taskId) {
    throw new Error(`No task_id returned from Volcengine API. response=${JSON.stringify(data)}`);
  }

  console.log('Volcengine video task created:', taskId);
  return taskId;
}

/**
 * Poll Volcengine task until completion or timeout
 */
async function volcenginePollTask(
  taskId: string,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxTimeoutMs = DEFAULT_MAX_TIMEOUT_MS
): Promise<VolcengineQueryTaskResponse> {
  const apiKey = getApiKey('volcengine');
  const baseUrl = getBaseUrl('volcengine') || VOLCENGINE_BASE_URL;
  const startTime = Date.now();

  while (Date.now() - startTime < maxTimeoutMs) {
    const url = `${baseUrl}${VOLCENGINE_CREATE_TASK_PATH}/${taskId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Volcengine query error: ${response.status} - ${errorText}`);
    }

    const data: VolcengineQueryTaskResponse = await response.json();

    const status = data.status?.toLowerCase();
    console.log('Volcengine task status:', { taskId, status });

    // Check if task completed
    if (status === 'succeeded') {
      return data;
    }

    // Check if task failed
    if (status === 'failed' || status === 'canceled') {
      const errorMsg =
        data.error?.message
        || 'Video generation failed';
      throw new Error(`Volcengine video generation failed: ${errorMsg}`);
    }

    // Wait before next poll
    await sleep(pollIntervalMs);
  }

  throw new Error(`Volcengine video generation timed out after ${maxTimeoutMs / 1000}s`);
}

async function volcengineQueryTask(taskId: string): Promise<VolcengineQueryTaskResponse> {
  const apiKey = getApiKey('volcengine');
  const baseUrl = getBaseUrl('volcengine') || VOLCENGINE_BASE_URL;
  const url = `${baseUrl}${VOLCENGINE_CREATE_TASK_PATH}/${taskId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Volcengine query error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Generate video using Volcengine Seedance (create task + poll)
 */
async function volcengineVideoGenerate(options: VideoGenerationOptions): Promise<VideoGenerationResult> {
  const model = resolveVideoModel('volcengine', options.model);

  // Step 1: Create the task
  const taskId = await volcengineCreateTask(options);

  // Step 2: Poll until completion
  const result = await volcenginePollTask(taskId);

  return getVolcengineTaskResult(model, result);
}

// ============================================================
// Aliyun Wanxiang Video Generation (native HTTP)
// ============================================================

/**
 * Create a video generation task on Aliyun DashScope
 * Returns the task_id for polling
 */
async function aliyunCreateTask(options: VideoGenerationOptions): Promise<string> {
  const apiKey = getApiKey('aliyun');
  const baseUrl = resolveAliyunApiBaseUrl();

  if (!apiKey) {
    throw new Error(
      'DashScope API key is not configured. Set QWEN_API_KEY.'
    );
  }

  const model = options.model || DEFAULT_MODELS.aliyun;
  // DashScope video API expects size format like 1280*720.
  const normalizedSize = options.size?.replace('x', '*');
  const firstFrameUrl = normalizeOptionalUrl(options.firstFrameUrl);
  const lastFrameUrl = normalizeOptionalUrl(options.lastFrameUrl);
  const hasFrameInput = Boolean(firstFrameUrl || lastFrameUrl);
  const isI2vModel = isAliyunI2VModel(model);

  if (hasFrameInput && !isI2vModel) {
    throw new Error(`Aliyun model ${model} does not support image input. Please use an I2V model such as wan2.6-i2v-flash.`);
  }

  if (!hasFrameInput && isI2vModel) {
    throw new Error(`Aliyun model ${model} requires image input. Please provide first frame image URL.`);
  }

  if (lastFrameUrl) {
    throw new Error(`Aliyun model ${model} currently supports first-frame mode only in this project. Remove last_frame_url and keep img_url.`);
  }

  const requestBody: AliyunVideoRequest = {
    model,
    input: {
      prompt: options.prompt,
      ...(options.audioUrl ? { audio_url: options.audioUrl } : {}),
      ...(firstFrameUrl ? { img_url: firstFrameUrl } : {}),
    },
    parameters: {
      ...(isI2vModel
        ? {
            resolution: getAliyunResolution(normalizedSize),
            audio: false,
          }
        : {
            ...(normalizedSize ? { size: normalizedSize } : {}),
          }),
      ...(options.duration ? { duration: options.duration } : {}),
      prompt_extend: options.promptExtend ?? true,
      ...(options.seed !== undefined ? { seed: options.seed } : {}),
      watermark: options.watermark ?? false,
      ...(options.shotType ? { shot_type: options.shotType } : {}),
    },
  };

  const url = `${baseUrl}${ALIYUN_VIDEO_CREATE_PATH}`;

  console.log('Aliyun create video task request:', { url, model, prompt: options.prompt.substring(0, 50) });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Aliyun DashScope API error: ${response.status} - ${errorText}`);
  }

  const data: AliyunCreateTaskResponse = await response.json();

  // Check for API-level errors
  if (data.code) {
    throw new Error(`Aliyun DashScope API error: ${data.code} - ${data.message}`);
  }

  const taskId = data.output?.task_id;
  if (!taskId) {
    throw new Error('No task_id returned from Aliyun DashScope API');
  }

  console.log('Aliyun video task created:', taskId);
  return taskId;
}

/**
 * Poll Aliyun DashScope task until completion or timeout
 */
async function aliyunPollTask(
  taskId: string,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxTimeoutMs = DEFAULT_MAX_TIMEOUT_MS
): Promise<AliyunQueryTaskResponse> {
  const apiKey = getApiKey('aliyun');
  const baseUrl = resolveAliyunApiBaseUrl();
  const startTime = Date.now();

  while (Date.now() - startTime < maxTimeoutMs) {
    const url = `${baseUrl}${ALIYUN_TASK_QUERY_PATH}/${taskId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Aliyun task query error: ${response.status} - ${errorText}`);
    }

    const data: AliyunQueryTaskResponse = await response.json();

    console.log('Aliyun task status:', { taskId, status: data.output?.task_status });

    // Check for API-level errors
    if (data.code) {
      throw new Error(`Aliyun DashScope error: ${data.code} - ${data.message}`);
    }

    const status = data.output?.task_status;

    // Task succeeded
    if (status === 'SUCCEEDED') {
      return data;
    }

    // Task failed
    if (status === 'FAILED') {
      const detailedError = formatAliyunTaskFailure(taskId, data);
      console.error('Aliyun task failed response:', JSON.stringify(data, null, 2));
      throw new Error(detailedError);
    }

    // Wait before next poll (PENDING or RUNNING)
    await sleep(pollIntervalMs);
  }

  throw new Error(`Aliyun video generation timed out after ${maxTimeoutMs / 1000}s`);
}

async function aliyunQueryTask(taskId: string): Promise<AliyunQueryTaskResponse> {
  const apiKey = getApiKey('aliyun');
  const baseUrl = resolveAliyunApiBaseUrl();
  const url = `${baseUrl}${ALIYUN_TASK_QUERY_PATH}/${taskId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Aliyun task query error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Generate video using Aliyun Wanxiang (create task + poll)
 */
async function aliyunVideoGenerate(options: VideoGenerationOptions): Promise<VideoGenerationResult> {
  const model = resolveVideoModel('aliyun', options.model);

  // Step 1: Create the task
  const taskId = await aliyunCreateTask(options);

  // Step 2: Poll until completion
  const result = await aliyunPollTask(taskId);

  return getAliyunTaskResult(model, result);
}

export async function createVideoTask(options: VideoGenerationOptions): Promise<{
  provider: 'volcengine' | 'aliyun';
  model: string;
  providerTaskId: string;
}> {
  const provider = options.provider ?? 'volcengine';

  if (provider === 'fal') {
    throw new Error('fal does not support external task polling in current implementation');
  }

  if (provider === 'volcengine') {
    const model = resolveVideoModel('volcengine', options.model);
    const providerTaskId = await volcengineCreateTask(options);
    return { provider: 'volcengine', model, providerTaskId };
  }

  const model = resolveVideoModel('aliyun', options.model);
  const providerTaskId = await aliyunCreateTask(options);
  return { provider: 'aliyun', model, providerTaskId };
}

export async function queryVideoTask(
  provider: 'volcengine' | 'aliyun',
  model: string,
  providerTaskId: string
): Promise<{
  status: 'processing' | 'succeeded' | 'failed';
  result?: VideoGenerationResult;
  errorMessage?: string;
}> {
  if (provider === 'volcengine') {
    const task = await volcengineQueryTask(providerTaskId);
    const status = task.status?.toLowerCase();
    if (status === 'succeeded') {
      return {
        status: 'succeeded',
        result: getVolcengineTaskResult(model, task),
      };
    }
    if (status === 'failed' || status === 'canceled') {
      return {
        status: 'failed',
        errorMessage: task.error?.message || 'Volcengine video generation failed',
      };
    }
    return { status: 'processing' };
  }

  const task = await aliyunQueryTask(providerTaskId);
  const status = task.output?.task_status;
  if (status === 'SUCCEEDED') {
    return {
      status: 'succeeded',
      result: getAliyunTaskResult(model, task),
    };
  }
  if (status === 'FAILED') {
    return {
      status: 'failed',
      errorMessage: formatAliyunTaskFailure(providerTaskId, task),
    };
  }
  return { status: 'processing' };
}

// ============================================================
// Main Video Generation Function
// ============================================================

/**
 * Main function to generate videos with multi-provider support
 * Handles both synchronous (fal) and async polling (volcengine, aliyun) providers
 */
export async function generateVideoResponse(options: VideoGenerationOptions): Promise<VideoGenerationResult> {
  switch (options.provider ?? 'volcengine') {
    case 'fal':
      return falVideoGenerate(options);
    case 'volcengine':
      return volcengineVideoGenerate(options);
    case 'aliyun':
      return aliyunVideoGenerate(options);
    default:
      throw new Error(`Unsupported video provider: ${options.provider}`);
  }
}

/**
 * Calculate credit consumption for video generation
 * Uses config.credits.fixedConsumption.aiVideo for pricing
 */
export function calculateVideoCreditCost(options: {
  provider: VideoProviderName;
  model?: string;
}): number {
  const resolvedModel = resolveVideoModel(options.provider, options.model);
  return getFixedConsumptionAmount('aiVideo', resolvedModel);
}
