<template>
  <div class="flex flex-col lg:flex-row min-h-screen">
    <!-- Left Panel - Input Form -->
    <div class="w-full lg:w-1/2 border-r border-border bg-background p-6 overflow-y-auto">
      <div class="max-w-2xl mx-auto space-y-6">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold">{{ $t('ai.image.title') }}</h1>
            <p class="text-sm text-muted-foreground mt-1">{{ $t('ai.image.description') }}</p>
          </div>
          <div v-if="creditBalance !== null" class="text-sm text-muted-foreground">
            {{ $t('ai.image.credits') }}: <span class="font-semibold text-foreground">{{ creditBalance }}</span>
          </div>
        </div>

        <!-- Provider & Model Selection -->
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label>{{ $t('ai.image.providers.title') }}</Label>
            <Select v-model="provider">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="p in Object.keys(imageConfig.availableModels)" :key="p" :value="p">
                  {{ $t(`ai.image.providers.${p}`) || p }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label>Model</Label>
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
          <Label>{{ $t('ai.image.prompt') }}</Label>
          <Textarea
            v-model="prompt"
            :placeholder="$t('ai.image.promptPlaceholder')"
            class="min-h-[120px] resize-y"
          />
        </div>

        <!-- Additional Settings Toggle -->
        <div>
          <Button
            variant="ghost"
            class="w-full justify-between"
            @click="showSettings = !showSettings"
          >
            <span>{{ $t('ai.image.settings.title') }}</span>
            <ChevronUp v-if="showSettings" class="h-4 w-4" />
            <ChevronDown v-else class="h-4 w-4" />
          </Button>
        </div>

        <!-- Additional Settings -->
        <div v-if="showSettings" class="space-y-6 border rounded-lg p-4 bg-muted/30">
          <!-- Negative Prompt -->
          <div class="space-y-2">
            <Label>{{ $t('ai.image.negativePrompt') }}</Label>
            <Textarea
              v-model="negativePrompt"
              :placeholder="$t('ai.image.negativePromptPlaceholder')"
              class="min-h-[80px] resize-y"
            />
            <p class="text-xs text-muted-foreground">{{ $t('ai.image.negativePromptHint') }}</p>
          </div>

          <!-- Image Size -->
          <div class="space-y-2">
            <Label>{{ $t('ai.image.settings.imageSize') }}</Label>
            <Select v-model="size">
              <SelectTrigger>
                <SelectValue placeholder="Select size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="s in availableSizes" :key="s.value" :value="s.value">
                  {{ s.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Fal-specific settings -->
          <template v-if="provider === 'fal'">
            <!-- Inference Steps -->
            <div class="space-y-2">
              <div class="flex justify-between">
                <Label>{{ $t('ai.image.settings.numInferenceSteps') }}</Label>
                <span class="text-sm text-muted-foreground">{{ numInferenceSteps }}</span>
              </div>
              <Slider
                :model-value="[numInferenceSteps]"
                @update:model-value="(v) => { if (v && v[0] !== undefined) numInferenceSteps = v[0] }"
                :min="1"
                :max="50"
                :step="1"
              />
              <p class="text-xs text-muted-foreground">{{ $t('ai.image.settings.numInferenceStepsHint') }}</p>
            </div>

            <!-- Guidance Scale -->
            <div class="space-y-2">
              <div class="flex justify-between">
                <Label>{{ $t('ai.image.settings.guidanceScale') }}</Label>
                <span class="text-sm text-muted-foreground">{{ guidanceScale }}</span>
              </div>
              <Slider
                :model-value="[guidanceScale]"
                @update:model-value="(v) => { if (v && v[0] !== undefined) guidanceScale = v[0] }"
                :min="1"
                :max="20"
                :step="0.5"
              />
              <p class="text-xs text-muted-foreground">{{ $t('ai.image.settings.guidanceScaleHint') }}</p>
            </div>
          </template>

          <!-- Seed -->
          <div class="space-y-2">
            <Label>{{ $t('ai.image.settings.seed') }}</Label>
            <div class="flex gap-2">
              <Input
                v-model="seed"
                :placeholder="$t('ai.image.settings.random')"
                class="flex-1"
              />
              <Button variant="outline" size="icon" @click="randomizeSeed">
                <RefreshCw class="h-4 w-4" />
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">{{ $t('ai.image.settings.seedHint') }}</p>
          </div>

          <!-- Qwen-specific settings -->
          <template v-if="provider === 'qwen'">
            <div class="flex items-center justify-between">
              <div>
                <Label>{{ $t('ai.image.settings.promptExtend') }}</Label>
                <p class="text-xs text-muted-foreground">{{ $t('ai.image.settings.promptExtendHint') }}</p>
              </div>
              <Switch v-model:checked="promptExtend" />
            </div>

            <div class="flex items-center justify-between">
              <div>
                <Label>{{ $t('ai.image.settings.watermark') }}</Label>
                <p class="text-xs text-muted-foreground">{{ $t('ai.image.settings.watermarkHint') }}</p>
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
            {{ $t('ai.image.generating') }}
          </template>
          <template v-else>
            <ImageIcon class="mr-2 h-4 w-4" />
            {{ $t('ai.image.generate') }}
          </template>
        </Button>
      </div>
    </div>

    <!-- Right Panel - Result -->
    <div class="w-full lg:w-1/2 bg-muted/30 p-6 flex flex-col">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-semibold">{{ $t('ai.image.result') }}</h2>
          <span class="text-xs bg-muted px-2 py-1 rounded">
            {{ isGenerating ? $t('ai.image.generating') : $t('ai.image.idle') }}
          </span>
        </div>
      </div>

      <!-- Result Display -->
      <div class="flex-1 flex items-center justify-center bg-background rounded-lg border border-border min-h-[400px] relative overflow-hidden">
        <template v-if="isGenerating">
          <div class="flex flex-col items-center gap-4">
            <RefreshCw class="h-8 w-8 animate-spin text-primary" />
            <p class="text-muted-foreground">{{ $t('ai.image.generating') }}</p>
          </div>
        </template>
        <template v-else-if="result">
          <img
            :src="result.imageUrl"
            alt="Generated image"
            class="max-w-full max-h-full object-contain"
          />
        </template>
        <template v-else-if="error">
          <div class="text-center text-destructive">
            <p class="font-medium">{{ $t('ai.image.errors.generationFailed') }}</p>
            <p class="text-sm mt-1">{{ error }}</p>
          </div>
        </template>
        <template v-else>
          <div class="text-center text-muted-foreground">
            <ImageIcon class="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{{ $t('ai.image.idle') }}</p>
          </div>
        </template>
      </div>

      <!-- Actions -->
      <div v-if="result" class="mt-4 space-y-4">
        <p class="text-sm text-muted-foreground">{{ $t('ai.image.whatNext') }}</p>
        <Button class="w-full" @click="handleDownload">
          <Download class="mr-2 h-4 w-4" />
          {{ $t('ai.image.download') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ImageIcon, Download, RefreshCw, ChevronDown, ChevronUp } from 'lucide-vue-next'
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
import { getImageSizesForProvider } from '@libs/ai'

type ImageProviderName = 'qwen' | 'fal' | 'openai' | 'gemini'

interface GenerationResult {
  imageUrl: string
  width?: number
  height?: number
  provider: string
  model: string
  seed?: number
}

// SEO and metadata
const { t: $t, tm } = useI18n()
const localePath = useLocalePath()

useSeoMeta({
  title: $t('ai.image.metadata.title'),
  description: $t('ai.image.metadata.description'),
  keywords: $t('ai.image.metadata.keywords')
})

// Image configuration
const imageConfig = config.aiImage

// Provider and model state
const provider = ref<ImageProviderName>(imageConfig.defaultProvider as ImageProviderName)
const model = ref<string>(imageConfig.defaultModels[imageConfig.defaultProvider as keyof typeof imageConfig.defaultModels])

// Form state
const prompt = ref($t('ai.image.defaultPrompt'))
const negativePrompt = ref('')
const size = ref('')
const numInferenceSteps = ref<number>(imageConfig.defaults.numInferenceSteps)
const guidanceScale = ref<number>(imageConfig.defaults.guidanceScale)
const seed = ref('random')
const promptExtend = ref(imageConfig.defaults.promptExtend)
const watermark = ref(imageConfig.defaults.watermark)

// UI state
const showSettings = ref(false)
const isGenerating = ref(false)
const result = ref<GenerationResult | null>({
  imageUrl: 'https://static.tinyship.cn/images/image-demo2.png',
  provider: imageConfig.defaultProvider,
  model: imageConfig.defaultModels[imageConfig.defaultProvider as keyof typeof imageConfig.defaultModels],
})
const error = ref<string | null>(null)
const creditBalance = ref<number | null>(null)

// Computed properties
const availableModels = computed(() => {
  return imageConfig.availableModels[provider.value as keyof typeof imageConfig.availableModels] || []
})

const availableSizes = computed(() => {
  return getImageSizesForProvider(provider.value)
})

// Get model translations as an object
const modelTranslations = computed(() => {
  return tm('ai.image.models') as Record<string, string>
})

// Helper function to get model display name
const getModelDisplayName = (modelKey: string) => {
  return modelTranslations.value?.[modelKey] || modelKey
}

// Watch provider changes
watch(provider, (newProvider) => {
  const defaultModel = imageConfig.defaultModels[newProvider as keyof typeof imageConfig.defaultModels]
  model.value = defaultModel
  
  // Set default size for the provider
  const sizes = getImageSizesForProvider(newProvider)
  if (sizes.length > 0) {
    const defaultSize = sizes.find((s: { value: string }) => s.value.includes('1:1') || s.value.includes('1328'))
    size.value = defaultSize?.value || sizes[0].value
  }
})

// Check credit balance on mount
onMounted(async () => {
  await checkCreditBalance()
  // Set initial size
  if (availableSizes.value.length > 0) {
    const defaultSize = availableSizes.value.find((s: { value: string }) => s.value.includes('1:1') || s.value.includes('1328'))
    size.value = defaultSize?.value || availableSizes.value[0].value
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

const handleGenerate = async () => {
  if (!prompt.value.trim()) {
    toast.error($t('ai.image.errors.invalidPrompt'))
    return
  }

  isGenerating.value = true
  error.value = null

  try {
    const selectedAspectRatio = (provider.value === 'fal' || provider.value === 'gemini')
      ? (size.value || '1:1')
      : undefined

    const response = await $fetch<{
      success: boolean
      data: GenerationResult
      credits?: { remaining: number }
      message?: string
    }>('/api/image-generate', {
      method: 'POST',
      body: {
        prompt: prompt.value.trim(),
        provider: provider.value,
        model: model.value,
        negativePrompt: negativePrompt.value.trim() || undefined,
        size: (provider.value === 'fal' || provider.value === 'gemini') ? undefined : (size.value || undefined),
        aspectRatio: selectedAspectRatio,
        seed: seed.value === 'random' ? undefined : parseInt(seed.value, 10),
        promptExtend: provider.value === 'qwen' ? promptExtend.value : undefined,
        watermark: provider.value === 'qwen' ? watermark.value : undefined,
        numInferenceSteps: provider.value === 'fal' ? numInferenceSteps.value : undefined,
        guidanceScale: provider.value === 'fal' ? guidanceScale.value : undefined,
      },
    })

    result.value = response.data
    if (response.credits?.remaining !== undefined) {
      creditBalance.value = response.credits.remaining
    }
    toast.success($t('ai.image.generatedSuccessfully'))
  } catch (err: any) {
    const statusCode = err?.statusCode || err?.response?.status
    if (statusCode === 402) {
      toast.error($t('ai.image.errors.insufficientCredits'), {
        description: $t('ai.image.errors.insufficientCreditsDescription'),
        action: {
          label: $t('common.viewPlans') || 'View Plans',
          onClick: () => navigateTo(localePath('/pricing'))
        }
      })
      return
    }
    
    const message = err?.data?.message || err?.message || $t('ai.image.errors.unknownError')
    error.value = message
    toast.error($t('ai.image.errors.generationFailed'), { description: message })
  } finally {
    isGenerating.value = false
  }
}

const handleDownload = async () => {
  if (!result.value?.imageUrl) return

  try {
    const response = await fetch(result.value.imageUrl)
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `image-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  } catch (err) {
    // If fetch fails (e.g., CORS), open in new tab
    window.open(result.value.imageUrl, '_blank')
  }
}

const randomizeSeed = () => {
  seed.value = Math.floor(Math.random() * 2147483647).toString()
}
</script>
