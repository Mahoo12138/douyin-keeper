# Video Generation Provider Params Comparison

This document summarizes the parameter similarities and differences among:

- Volcengine (Ark) video generation APIs
- Aliyun (DashScope Wanxiang) video generation API
- fal.ai via Vercel AI SDK `experimental_generateVideo`

It also checks whether the current codebase implementation is compatible with Volcengine's latest API shape.

## Official Docs

- Volcengine - Create video task: https://www.volcengine.com/docs/82379/1520757?lang=zh
- Volcengine - Query video task: https://www.volcengine.com/docs/82379/1521309?lang=zh
- Aliyun DashScope Wanxiang API: https://bailian.console.aliyun.com/cn-beijing/?spm=5176.12818093_47.overview_recent.1.158f2cc96g3zGL&tab=api#/api/?type=model&url=2865250
- Aliyun DashScope (model API): https://bailian.console.aliyun.com/cn-beijing/?tab=api#/api/?type=model&url=2867393
- Aliyun DashScope (first/last frame model API): https://bailian.console.aliyun.com/cn-beijing/?tab=api#/api/?type=model&url=2880649
- Vercel AI SDK `experimental_generateVideo`: https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-video

## High-Level Flow Comparison

| Provider | Create API | Query API | Async Task | Auth |
| --- | --- | --- | --- | --- |
| Volcengine | `POST /api/v3/contents/generations/tasks` | `GET /api/v3/contents/generations/tasks/{id}` | Yes | `Authorization: Bearer <ARK_API_KEY>` |
| Aliyun DashScope | `POST /api/v1/services/aigc/video-generation/video-synthesis` + `X-DashScope-Async: enable` | `GET /api/v1/tasks/{task_id}` | Yes | `Authorization: Bearer <DASHSCOPE_API_KEY>` |
| fal.ai (AI SDK) | `experimental_generateVideo(...)` | Handled by SDK/provider | Hidden by SDK | `FAL_API_KEY` |

## Provider Supported Parameters (Current Integration Target)

The table below describes parameters currently treated as supported for each provider in this project.

| Parameter | Volcengine | Aliyun | fal.ai (AI SDK) |
| --- | --- | --- | --- |
| `model` | Yes | Yes | Yes |
| Prompt text | `content[].text` | `input.prompt` | `prompt` |
| Aspect ratio / size | `ratio` + `resolution` | `parameters.size` | `aspectRatio` |
| `duration` | Yes | Yes | Yes |
| `seed` | Yes | Yes | Yes |
| `watermark` | Yes | Yes | No (not used in current fal path) |
| `prompt_extend` | No | Yes | No |
| `audio_url` | No | Yes (optional) | No |
| `shot_type` | No | Yes (optional) | No |
| `loop` | No | No | Yes |
| `motionStrength` | No | No | Yes |

## Multimodal Capability Research (Text / Image / First-Last Frame)

This section summarizes capability direction from the provider docs linked above.

| Capability | Volcengine | Aliyun | fal.ai (via AI SDK) |
| --- | --- | --- | --- |
| Text-to-video | Yes | Yes | Yes |
| Image-to-video (single image as condition) | Yes (model/path dependent) | Yes (model dependent) | Yes (AI SDK prompt supports image) |
| First/last frame control | Yes (model/path dependent) | Yes (separate first/last frame API model) | Model dependent (not a generic fal-only flag in our code) |

### Notes

- Volcengine and Aliyun both provide richer non-text generation capabilities in their model/API families (including image-conditioned generation and first/last frame workflows), but these are often model-specific and not always exposed under a single request schema.
- In AI SDK `experimental_generateVideo`, image-conditioned generation is represented by prompt object input (e.g. `prompt: { image, text }`), so provider-side support depends on selected model.

## Parameter Names by Scenario (Doc-Oriented Mapping)

The table below focuses on parameter naming for three scenarios: text-to-video, image-to-video, and first/last-frame video.

| Provider | Text-to-video (T2V) | Image-to-video (I2V) | First/Last frame |
| --- | --- | --- | --- |
| Volcengine | `model`, `content[].type="text"`, `content[].text`, `ratio`, `resolution`, `duration`, `seed`, `watermark` | `model`, multimodal `content` (image + text), plus `ratio`, `resolution`, `duration`, `seed`, `watermark` | Model-dependent multimodal request under video generation API family (first/last frame fields depend on selected model endpoint) |
| Aliyun DashScope | `model`, `input.prompt`, `parameters.size`, `parameters.duration`, `parameters.prompt_extend`, `parameters.seed`, `parameters.watermark`, `parameters.shot_type` | `model`, `input.image_url` (optionally with text prompt depending model), plus `parameters.*` | First/last frame API model uses frame URL fields (typically start/end frame URL + optional text + `parameters.*`) |
| fal.ai (AI SDK) | `model`, `prompt` (string), `aspectRatio`, `duration`, `seed`, `providerOptions` | `model`, `prompt: { image, text }` | No single cross-model core field in AI SDK; use model/provider-specific options |

### Important naming note

- Volcengine and Aliyun image/first-last frame fields are model-endpoint specific; always follow the selected model API page.
- For Aliyun, your linked model pages (`2867393`, `2880649`) are the authoritative source for exact frame/image field names.

## Volcengine I2V (Project Scope: First Frame / First-Last Frame)

Per your latest requirement, this project should only support:

1. First-frame I2V
2. First-last-frame I2V

and does not need the generic multi-reference-image mode.

### Supported mode details

- **I2V - first frame**
  - supported by all I2V models
  - send 1 `image_url` object with nested `url`
  - `role` can be omitted, or set to `first_frame`

- **I2V - first + last frame**
  - supported models: `Seedance 1.5 pro`, `Seedance 1.0 pro`, `Seedance 1.0 lite i2v`
  - send 2 `image_url` objects with nested `url`
  - first frame object role: `first_frame`
  - last frame object role: `last_frame`
  - first and last image may be the same
  - if frame aspect ratios differ, first frame dominates; last frame is auto-cropped

### Suggested request shape (Volcengine I2V - first frame)

```json
{
  "model": "doubao-seedance-1-0-lite-i2v",
  "content": [
    { "type": "image_url", "role": "first_frame", "image_url": { "url": "https://example.com/first.png" } },
    { "type": "text", "text": "镜头从近景缓慢拉远，风格写实" }
  ],
  "ratio": "16:9",
  "resolution": "720p",
  "duration": 5,
  "seed": 12345,
  "watermark": false
}
```

### Suggested request shape (Volcengine I2V - first + last frame)

```json
{
  "model": "doubao-seedance-1-5-pro-251215",
  "content": [
    { "type": "image_url", "role": "first_frame", "image_url": { "url": "https://example.com/first.png" } },
    { "type": "image_url", "role": "last_frame", "image_url": { "url": "https://example.com/last.png" } },
    { "type": "text", "text": "角色从站立转身走向窗边，电影感运镜" }
  ],
  "ratio": "16:9",
  "resolution": "720p",
  "duration": 5,
  "seed": 12345,
  "watermark": false
}
```

## Suggested Request Shape (Aliyun / fal.ai)

### Aliyun DashScope (I2V first-frame / first-last-frame)

For first/last frame mode (per model API `2880649`):

- `first_frame_url` (required)
  - URL or Base64 image data
  - output video aspect ratio is based on this image
- `last_frame_url` (optional)
  - URL or Base64 image data
- Supported image formats:
  - `JPEG`, `JPG`, `PNG` (no alpha channel), `BMP`, `WEBP`
- Image resolution:
  - width and height in `[360, 2000]`
- File size:
  - max `10MB`
- Supported input forms:
  - public URL (`http://` / `https://`)
  - temporary OSS URL (`oss://dashscope-instant/...`)
  - Data URI base64 (`data:{MIME_type};base64,{base64_data}`)

For first-frame-only mode:

- `img_url` (required)
  - first-frame image URL or Base64 data
  - supported formats: `JPEG`, `JPG`, `PNG` (no alpha), `BMP`, `WEBP`
  - resolution range: width/height in `[360, 2000]`
  - max file size: `10MB`
  - supported forms:
    - public URL (`http://` / `https://`)
    - temporary OSS URL (`oss://dashscope-instant/...`)
    - Data URI base64 (`data:{MIME_type};base64,{base64_data}`)

#### Suggested request shape (Aliyun I2V first frame only)

```json
{
  "model": "wan2.6-i2v-flash",
  "input": {
    "prompt": "角色从静止慢慢转头看向镜头",
    "img_url": "https://cdn.translate.alibaba.com/r/wanx-demo-1.png"
  },
  "parameters": {
    "size": "1280*720",
    "duration": 5,
    "seed": 12345,
    "watermark": false,
    "prompt_extend": true
  }
}
```

#### Suggested request shape (Aliyun I2V first + last frame)

```json
{
  "model": "wan2.6-i2v-flash",
  "input": {
    "prompt": "角色从站立走到窗边并回头看向镜头",
    "first_frame_url": "https://example.com/first-frame.png",
    "last_frame_url": "https://example.com/last-frame.png"
  },
  "parameters": {
    "size": "1280*720",
    "duration": 5,
    "seed": 12345,
    "watermark": false,
    "prompt_extend": true
  }
}
```

### fal.ai via AI SDK (image-conditioned video)

```ts
import { experimental_generateVideo } from 'ai';
import { fal } from '@ai-sdk/fal';

const result = await experimental_generateVideo({
  model: fal.video('luma-ray-2'),
  prompt: {
    image: 'https://example.com/first-frame.png',
    text: 'camera slowly zooms in, cinematic lighting',
  },
  aspectRatio: '16:9',
  duration: 5,
  seed: 12345,
});
```

### Engineering implications for current project

- Backend now supports:
  - first-frame mode (all three providers),
  - first-last-frame mode (Volcengine / Aliyun).
- fal.ai is currently wired as **first-frame only** in this project.
- Frontend now exposes image URL/upload inputs and a mode switch:
  - text-to-video,
  - first-frame,
  - first-last-frame (disabled when provider is fal).

## Image Input / Upload Method Comparison

| Provider | Image URL input | Base64/Data URI input | Native file upload API | Current project status |
| --- | --- | --- | --- | --- |
| Volcengine | Supported in multimodal content flow (model-dependent) | Commonly supported through multimodal content payload (model-dependent) | Not integrated in this project | Not exposed in current UI |
| Aliyun DashScope | Supported (`input.image_url` / frame URL fields by model) | Commonly supported as URL-compatible encoded content depending model endpoint | Not integrated in this project | Not exposed in current UI |
| fal.ai (AI SDK) | Supported (`prompt.image` can be URL) | Supported (`prompt.image` can be base64/data) | fal SDK ecosystem supports upload workflows; AI SDK call itself expects resolved image input | First-frame mode is exposed; first-last-frame is not used for fal |

### Recommended engineering rule

For all providers, prefer:

1. Upload image to object storage/CDN first (public or signed URL),
2. Pass URL into provider request,
3. Keep base64 as fallback for small payloads and debugging.

## Current Page Payload vs Provider API Payload

Source files:

- `apps/next-app/app/[lang]/(root)/video-generate/page.tsx`
- `apps/nuxt-app/pages/video-generate.vue`
- `apps/tanstack-app/src/routes/$lang/(root)/video-generate.tsx`
- `libs/ai/video.ts`
- `libs/ai/types.ts`

### 1) What the page currently sends

All providers receive common fields from page payload:

- `prompt`
- `provider`
- `model`
- `duration`
- `seed` (if not random)

Provider-conditioned fields from page payload:

- `fal`: `aspectRatio`, `loop`, `motionStrength`
- `volcengine`: `size`, `watermark`
- `aliyun`: `size`, `promptExtend`, `watermark`

### 2) What backend actually sends to each provider

| Provider | Backend request fields currently sent |
| --- | --- |
| Volcengine | `model`, `content`, `ratio` (derived), `resolution` (derived or model default), `duration`, `seed`, `watermark` |
| Aliyun | `model`, `input.prompt`, `parameters.size`, `parameters.duration`, `parameters.prompt_extend`, `parameters.seed`, `parameters.watermark` |
| fal.ai | `model`, `prompt`, `aspectRatio`, `duration`, `seed`, provider options (`loop`, `motionStrength`, `pollTimeoutMs`) |

### 3) Page vs Backend consistency status

- **Volcengine**: consistent (page sends `size`/`watermark`/`seed`, backend maps to `ratio` + `resolution` + `watermark` + `seed`).
- **Aliyun**: consistent for currently exposed controls (`size`, `duration`, `promptExtend`, `seed`, `watermark`).
- **fal**: consistent for exposed controls (`aspectRatio`, `duration`, `seed`, `loop`, `motionStrength`).

Note: `audio_url` and `shot_type` are supported by backend type/request model for Aliyun but are not exposed in current page UI.

## Current Gap vs Multimodal Features

Current UI/API route now supports text + image-conditioned generation modes with upload-to-URL flow.
Current functional gap is mainly provider-specific scope:

- fal path uses first-frame mode only in this project (no first-last-frame path).

## Compatibility Check: Volcengine

### Conclusion

The current implementation is compatible with the Volcengine API shape you provided for create/query:

- create returns top-level `id`
- query returns top-level `status` and `content.video_url`

### Notes

- This project intentionally does **not** keep old legacy response compatibility for Volcengine.
- Model IDs are aligned to current values:
  - `doubao-seedance-1-5-pro-251215`
  - `doubao-seedance-1-0-pro-250528`
- Volcengine resolution is not uniquely determined by `ratio`; backend now sends both `ratio` and `resolution`.
- Resolution fallback by model default:
  - `Seedance 1.5 pro`, `Seedance 1.0 lite` => `720p`
  - `Seedance 1.0 pro`, `Seedance 1.0 pro-fast` => `1080p`

## Suggested Next Improvements

1. Expose Volcengine `ratio` directly in UI (instead of size abstraction) for full semantic alignment.
2. Add optional advanced Volcengine fields only when explicitly needed (avoid over-parameterization).
3. Add provider-level request/response debug toggles for faster API troubleshooting in non-production environments.
