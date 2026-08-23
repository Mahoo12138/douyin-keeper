<template>
  <div class="flex flex-col lg:flex-row min-h-screen">
    <!-- Left Panel - Input Form -->
    <div class="w-full lg:w-1/2 border-r border-border bg-background p-6 overflow-y-auto">
      <div class="max-w-2xl mx-auto space-y-6">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold">{{ $t('ai.video.title') }}</h1>
            <p class="text-sm text-muted-foreground mt-1">{{ $t('ai.video.description') }}</p>
          </div>
          <div v-if="creditBalance !== null" class="text-sm text-muted-foreground">
            {{ $t('ai.video.credits') }}: <span class="font-semibold text-foreground">{{ creditBalance }}</span>
          </div>
        </div>

        <!-- Provider & Model Selection -->
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label>{{ $t('ai.video.providers.title') }}</Label>
            <Select v-model="provider">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="p in providerDisplayOrder" :key="p" :value="p">
                  {{ $t(`ai.video.providers.${p}`) || p }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label>{{ $t('ai.video.model') }}</Label>
            <Select v-model="model">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="m in availableModels" :key="m" :value="m">
                  {{ getModelDisplayName(m) }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <!-- Prompt -->
        <div class="space-y-2">
          <Label>{{ $t('ai.video.prompt') }}</Label>
          <Textarea
            v-model="prompt"
            :placeholder="$t('ai.video.promptPlaceholder')"
            class="min-h-[120px] resize-y"
          />
        </div>

        <div class="space-y-4 border rounded-lg p-4 bg-muted/30">
          <div class="space-y-2">
            <Label>{{ $t('ai.video.inputMode.label') }}</Label>
            <Select v-model="inputMode">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">{{ $t('ai.video.inputMode.text') }}</SelectItem>
                <SelectItem value="firstFrame">{{ $t('ai.video.inputMode.firstFrame') }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div v-if="inputMode !== 'text'" class="space-y-3">
            <div>
              <Label>{{ $t('ai.video.frameInput.title') }}</Label>
              <p class="text-xs text-muted-foreground">{{ $t('ai.video.frameInput.hint') }}</p>
            </div>

            <div class="space-y-2">
              <Label>{{ $t('ai.video.frameInput.firstFrameUrl') }}</Label>
              <div class="flex gap-2">
                <Input
                  v-model="firstFrameUrl"
                  placeholder="https://..."
                  class="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  :disabled="isUploadingFirstFrame"
                  @click="openFirstFrameFilePicker"
                >
                  <RefreshCw v-if="isUploadingFirstFrame" class="h-4 w-4 animate-spin" />
                  <ImagePlus v-else class="h-4 w-4" />
                  <span class="ml-2">{{ $t('ai.video.frameInput.upload') }}</span>
                </Button>
                <input
                  id="first-frame-upload"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.bmp"
                  class="hidden"
                  @change="onFirstFrameFileChange"
                />
              </div>
            </div>

            <div v-if="firstFrameUrl.trim()" class="space-y-2">
              <Label>{{ $t('ai.video.frameInput.preview') }}</Label>
              <div class="rounded-md border bg-muted/20 p-2">
                <img
                  :src="firstFrameUrl"
                  :alt="$t('ai.video.frameInput.previewAlt')"
                  class="h-48 w-full rounded object-contain"
                />
              </div>
            </div>

          </div>
        </div>

        <!-- Additional Settings Toggle -->
        <div>
          <Button
            variant="ghost"
            class="w-full justify-between"
            @click="showSettings = !showSettings"
          >
            <span>{{ $t('ai.video.settings.title') }}</span>
            <ChevronUp v-if="showSettings" class="h-4 w-4" />
            <ChevronDown v-else class="h-4 w-4" />
          </Button>
        </div>

        <!-- Additional Settings -->
        <div v-if="showSettings" class="space-y-6 border rounded-lg p-4 bg-muted/30">
          <!-- Video Size / Aspect Ratio -->
          <div class="space-y-2">
            <Label>{{ $t('ai.video.settings.videoSize') }}</Label>
            <Select v-model="size">
              <SelectTrigger>
                <SelectValue :placeholder="$t('ai.video.settings.videoSizePlaceholder')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="s in availableSizes" :key="s.value" :value="s.value">
                  {{ s.label }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p class="text-xs text-muted-foreground">{{ $t('ai.video.settings.videoSizeHint') }}</p>
          </div>

          <!-- Duration -->
          <div class="space-y-2">
            <Label>{{ $t('ai.video.settings.duration') }}</Label>
            <Select v-model="durationStr">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="d in availableDurations" :key="d" :value="d.toString()">
                  {{ d }}s
                </SelectItem>
              </SelectContent>
            </Select>
            <p class="text-xs text-muted-foreground">{{ $t('ai.video.settings.durationHint') }}</p>
          </div>

          <!-- Fal-specific settings -->
          <template v-if="provider === 'fal'">
            <!-- Motion Strength -->
            <div class="space-y-2">
              <div class="flex justify-between">
                <Label>{{ $t('ai.video.settings.motionStrength') }}</Label>
                <span class="text-sm text-muted-foreground">{{ motionStrength }}</span>
              </div>
              <Slider
                :model-value="[motionStrength]"
                @update:model-value="(v) => { if (v && v[0] !== undefined) motionStrength = v[0] }"
                :min="0"
                :max="1"
                :step="0.1"
              />
              <p class="text-xs text-muted-foreground">{{ $t('ai.video.settings.motionStrengthHint') }}</p>
            </div>

            <!-- Loop -->
            <div class="flex items-center justify-between">
              <div>
                <Label>{{ $t('ai.video.settings.loop') }}</Label>
                <p class="text-xs text-muted-foreground">{{ $t('ai.video.settings.loopHint') }}</p>
              </div>
              <Switch v-model:checked="loop" />
            </div>
          </template>

          <!-- Seed -->
          <div class="space-y-2">
            <Label>{{ $t('ai.video.settings.seed') }}</Label>
            <div class="flex gap-2">
              <Input
                v-model="seed"
                :placeholder="$t('ai.video.settings.random')"
                class="flex-1"
              />
              <Button variant="outline" size="icon" @click="randomizeSeed">
                <RefreshCw class="h-4 w-4" />
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">{{ $t('ai.video.settings.seedHint') }}</p>
          </div>

          <!-- Aliyun + Volcengine settings -->
          <template v-if="provider === 'aliyun' || provider === 'volcengine'">
            <div v-if="provider === 'aliyun'" class="flex items-center justify-between">
              <div>
                <Label>{{ $t('ai.video.settings.promptExtend') }}</Label>
                <p class="text-xs text-muted-foreground">{{ $t('ai.video.settings.promptExtendHint') }}</p>
              </div>
              <Switch v-model:checked="promptExtend" />
            </div>

            <div class="flex items-center justify-between">
              <div>
                <Label>{{ $t('ai.video.settings.watermark') }}</Label>
                <p class="text-xs text-muted-foreground">{{ $t('ai.video.settings.watermarkHint') }}</p>
              </div>
              <Switch v-model:checked="watermark" />
            </div>
          </template>
        </div>

        <!-- Generate Button -->
        <Button
          class="w-full"
          size="lg"
          :disabled="isGenerating || !prompt.trim()"
          @click="handleGenerate"
        >
          <template v-if="isGenerating">
            <RefreshCw class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('ai.video.generating') }}
          </template>
          <template v-else>
            <VideoIcon class="mr-2 h-4 w-4" />
            {{ $t('ai.video.generate') }}
          </template>
        </Button>
      </div>
    </div>

    <!-- Right Panel - Result -->
    <div class="w-full lg:w-1/2 bg-muted/30 p-6 flex flex-col">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-semibold">{{ $t('ai.video.result') }}</h2>
          <span class="text-xs bg-muted px-2 py-1 rounded">
            {{ isGenerating ? $t('ai.video.generating') : (result ? $t('ai.video.generatedSuccessfully') : $t('ai.video.idle')) }}
          </span>
        </div>
      </div>

      <!-- Result Display -->
      <div class="flex-1 flex items-center justify-center bg-background rounded-lg border border-border min-h-[400px] relative overflow-hidden">
        <template v-if="isGenerating">
          <div class="flex flex-col items-center gap-4">
            <RefreshCw class="h-8 w-8 animate-spin text-primary" />
            <p class="text-muted-foreground">{{ $t('ai.video.generating') }}</p>
            <p class="text-xs text-muted-foreground">
              {{ $t('ai.video.resultPanel.generatingHint') }}
            </p>
          </div>
        </template>
        <template v-else-if="result">
          <video
            :src="result.videoUrl"
            controls
            autoplay
            loop
            class="max-w-full max-h-full object-contain"
            :poster="result.coverImageUrl"
          >
            {{ $t('ai.video.resultPanel.videoTagUnsupported') }}
          </video>
        </template>
        <template v-else-if="error">
          <div class="text-center text-destructive">
            <p class="font-medium">{{ $t('ai.video.errors.generationFailed') }}</p>
            <p class="text-sm mt-1">{{ error }}</p>
          </div>
        </template>
        <template v-else>
          <div class="text-center text-muted-foreground">
            <VideoIcon class="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{{ $t('ai.video.idle') }}</p>
          </div>
        </template>
      </div>

      <!-- Actions -->
      <div v-if="result" class="mt-4 space-y-4">
        <p class="text-sm text-muted-foreground">{{ $t('ai.video.whatNext') }}</p>
        <Button class="w-full" @click="handleDownload">
          <Download class="mr-2 h-4 w-4" />
          {{ $t('ai.video.download') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { VideoIcon, Download, RefreshCw, ChevronDown, ChevronUp, ImagePlus } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { config } from '@config'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getVideoSizesForProvider, getVideoDurationsForProvider } from '@libs/ai'

type VideoProviderName = 'fal' | 'volcengine' | 'aliyun'
type VideoInputMode = 'text' | 'firstFrame'

interface GenerationResult {
  videoUrl: string
  duration?: number
  provider: string
  model: string
  coverImageUrl?: string
}

interface UploadResponse {
  success: boolean
  data?: {
    url: string
  }
  error?: string
  message?: string
}

interface AsyncVideoTaskData {
  taskId: string
  status: 'processing'
  async: true
  provider: string
  model: string
}

interface VideoGenerateResponse {
  success: boolean
  data: GenerationResult | AsyncVideoTaskData
  credits?: { remaining: number }
  message?: string
  error?: string
}

interface VideoTaskStatusResponse {
  success: boolean
  data: {
    taskId: string
    status: 'processing' | 'succeeded' | 'failed'
    result?: GenerationResult
    error?: string
  }
  credits?: { remaining: number }
}

const TASK_POLL_INTERVAL_MS = 3000
const TASK_POLL_TIMEOUT_MS = 10 * 60 * 1000

// SEO and metadata
const { t: $t, tm } = useI18n()
const localePath = useLocalePath()

useSeoMeta({
  title: $t('ai.video.metadata.title'),
  description: $t('ai.video.metadata.description'),
  keywords: $t('ai.video.metadata.keywords')
})

// Video configuration
const videoConfig = config.aiVideo
const providerDisplayOrder: VideoProviderName[] = ['volcengine', 'aliyun', 'fal']

// Provider and model state
const provider = ref<VideoProviderName>(videoConfig.defaultProvider as VideoProviderName)
const model = ref<string>(videoConfig.defaultModels[videoConfig.defaultProvider as keyof typeof videoConfig.defaultModels])

// Form state
const prompt = ref($t('ai.video.defaultPrompt'))
const size = ref('')
const durationStr = ref(videoConfig.defaults.duration.toString())
const seed = ref('random')
const loop = ref(false)
const motionStrength = ref<number>(0.8)
const promptExtend = ref(videoConfig.defaults.promptExtend)
const watermark = ref(videoConfig.defaults.watermark)
const inputMode = ref<VideoInputMode>('text')
const firstFrameUrl = ref('')
const isUploadingFirstFrame = ref(false)

// UI state
const showSettings = ref(false)
const isGenerating = ref(false)
const result = ref<GenerationResult | null>({
  videoUrl: 'https://static.tinyship.cn/video/ai-video.mp4',
  provider: videoConfig.defaultProvider,
  model: videoConfig.defaultModels[videoConfig.defaultProvider as keyof typeof videoConfig.defaultModels],
})
const error = ref<string | null>(null)
const creditBalance = ref<number | null>(null)

// Computed properties
const availableModels = computed(() => {
  return videoConfig.availableModels[provider.value as keyof typeof videoConfig.availableModels] || []
})

const availableSizes = computed(() => {
  return getVideoSizesForProvider(provider.value)
})

const availableDurations = computed(() => {
  return getVideoDurationsForProvider(provider.value)
})

// Get model translations as an object
const modelTranslations = computed(() => {
  return tm('ai.video.models') as Record<string, string>
})

// Helper function to get model display name
const getModelDisplayName = (modelKey: string) => {
  return modelTranslations.value?.[modelKey] || modelKey
}

// Watch provider changes
watch(provider, (newProvider) => {
  const defaultModel = videoConfig.defaultModels[newProvider as keyof typeof videoConfig.defaultModels]
  model.value = defaultModel

  // Set default size for the provider
  const sizes = getVideoSizesForProvider(newProvider)
  if (sizes.length > 0) {
    const defaultSize = sizes.find((s: { value: string }) => s.value.includes('16:9') || s.value.includes('1280'))
    size.value = defaultSize?.value || sizes[0].value
  }

  // Set default duration
  const durations = getVideoDurationsForProvider(newProvider)
  if (durations.length > 0) {
    durationStr.value = durations[0].toString()
  }

})

// Check credit balance on mount
onMounted(async () => {
  await checkCreditBalance()
  // Set initial size
  if (availableSizes.value.length > 0) {
    const defaultSize = availableSizes.value.find((s: { value: string }) => s.value.includes('16:9') || s.value.includes('1280'))
    size.value = defaultSize?.value || availableSizes.value[0].value
  }
  // Set initial duration
  if (availableDurations.value.length > 0) {
    durationStr.value = availableDurations.value[0].toString()
  }
})

const checkCreditBalance = async () => {
  try {
    const response = await $fetch<{ credits?: { balance?: number } }>('/api/credits/status')
    creditBalance.value = response?.credits?.balance || 0
  } catch (err) {
    console.error('Failed to check credit balance:', err)
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const pollVideoTask = async (taskId: string): Promise<GenerationResult> => {
  const start = Date.now()

  while (Date.now() - start < TASK_POLL_TIMEOUT_MS) {
    const response = await $fetch<VideoTaskStatusResponse>(`/api/video-generate/status?taskId=${encodeURIComponent(taskId)}`)

    if (response.credits?.remaining !== undefined) {
      creditBalance.value = response.credits.remaining
    }

    if (response.data.status === 'succeeded' && response.data.result) {
      return response.data.result
    }

    if (response.data.status === 'failed') {
      throw new Error(response.data.error || $t('ai.video.errors.generationFailed'))
    }

    await sleep(TASK_POLL_INTERVAL_MS)
  }

  throw new Error($t('ai.video.errors.timeout'))
}

const handleGenerate = async () => {
  if (!prompt.value.trim()) {
    toast.error($t('ai.video.errors.invalidPrompt'))
    return
  }

  if (inputMode.value !== 'text' && !firstFrameUrl.value.trim()) {
    toast.error($t('ai.video.errors.firstFrameRequired'))
    return
  }
  isGenerating.value = true
  error.value = null
  result.value = null

  try {
    const response = await $fetch<VideoGenerateResponse>('/api/video-generate', {
      method: 'POST',
      body: {
        prompt: prompt.value.trim(),
        provider: provider.value,
        model: model.value,
        size: provider.value === 'fal' ? undefined : size.value,
        aspectRatio: provider.value === 'fal' ? size.value : undefined,
        duration: parseInt(durationStr.value, 10),
        seed: seed.value === 'random' ? undefined : parseInt(seed.value, 10),
        loop: provider.value === 'fal' ? loop.value : undefined,
        motionStrength: provider.value === 'fal' ? motionStrength.value : undefined,
        promptExtend: provider.value === 'aliyun' ? promptExtend.value : undefined,
        watermark: provider.value === 'aliyun' || provider.value === 'volcengine' ? watermark.value : undefined,
        firstFrameUrl: inputMode.value !== 'text' ? (firstFrameUrl.value.trim() || undefined) : undefined,
      },
    })

    if (response.credits?.remaining !== undefined) {
      creditBalance.value = response.credits.remaining
    }

    const maybeTask = response.data as Partial<AsyncVideoTaskData>
    if (maybeTask.taskId) {
      result.value = await pollVideoTask(maybeTask.taskId)
    } else {
      result.value = response.data as GenerationResult
    }
    toast.success($t('ai.video.generatedSuccessfully'))
  } catch (err: any) {
    const statusCode = err?.statusCode || err?.response?.status
    if (statusCode === 402) {
      toast.error($t('ai.video.errors.insufficientCredits'), {
        description: $t('ai.video.errors.insufficientCreditsDescription'),
        action: {
          label: $t('common.viewPlans') || 'View Plans',
          onClick: () => navigateTo(localePath('/pricing'))
        }
      })
      return
    }

    const message = err?.data?.message || err?.message || $t('ai.video.errors.unknownError')
    error.value = message
    toast.error($t('ai.video.errors.generationFailed'), { description: message })
  } finally {
    isGenerating.value = false
  }
}

const handleDownload = async () => {
  if (!result.value?.videoUrl) return

  try {
    const response = await fetch(result.value.videoUrl)
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `video-${Date.now()}.mp4`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  } catch (err) {
    // If fetch fails (e.g., CORS), open in new tab
    window.open(result.value.videoUrl, '_blank')
  }
}

const randomizeSeed = () => {
  seed.value = Math.floor(Math.random() * 2147483647).toString()
}

const uploadFrameFile = async (file: File) => {
  const isValidImageType = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/bmp'].includes(file.type)
  if (!isValidImageType) {
    toast.error($t('ai.video.errors.unsupportedImageType'))
    return
  }

  const maxSize = 10 * 1024 * 1024
  if (file.size > maxSize) {
    toast.error($t('ai.video.errors.imageTooLarge'))
    return
  }

  isUploadingFirstFrame.value = true

  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('provider', 'r2')

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    })
    const data = await response.json() as UploadResponse

    if (!response.ok || !data.success || !data.data?.url) {
      throw new Error(data.error || data.message || 'Upload failed')
    }

    firstFrameUrl.value = data.data.url
    toast.success($t('ai.video.frameInput.uploadedToR2'))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    toast.error(message)
  } finally {
    isUploadingFirstFrame.value = false
  }
}

const onFirstFrameFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (file) {
    void uploadFrameFile(file)
  }
  if (input) {
    input.value = ''
  }
}

const openFirstFrameFilePicker = () => {
  if (import.meta.client) {
    window.document.getElementById('first-frame-upload')?.click()
  }
}
</script>
