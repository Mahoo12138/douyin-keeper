<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { useFileUploadItemContext } from './types'

interface Props {
  class?: string
  variant?: 'linear' | 'circular' | 'fill'
  size?: number
  forceMount?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'linear',
  size: 40,
  forceMount: false,
})

const itemContext = useFileUploadItemContext()

const fileState = computed(() => itemContext.fileState())
const progress = computed(() => fileState.value?.progress ?? 0)
const shouldRender = computed(() => 
  props.forceMount || (fileState.value && fileState.value.progress !== 100)
)

// Circular progress calculations
const circumference = computed(() => 2 * Math.PI * ((props.size - 4) / 2))
const strokeDashoffset = computed(() => 
  circumference.value - (progress.value / 100) * circumference.value
)
</script>

<template>
  <template v-if="fileState && shouldRender">
    <!-- Circular variant -->
    <div
      v-if="variant === 'circular'"
      role="progressbar"
      :aria-valuemin="0"
      :aria-valuemax="100"
      :aria-valuenow="progress"
      :aria-valuetext="`${progress}%`"
      data-slot="file-upload-progress"
      :class="cn(
        'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
        props.class
      )"
    >
      <svg
        class="-rotate-90 transform"
        :width="size"
        :height="size"
        :viewBox="`0 0 ${size} ${size}`"
        fill="none"
        stroke="currentColor"
      >
        <circle
          class="text-primary/20"
          stroke-width="2"
          :cx="size / 2"
          :cy="size / 2"
          :r="(size - 4) / 2"
        />
        <circle
          class="text-primary transition-[stroke-dashoffset] duration-300 ease-linear"
          stroke-width="2"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="strokeDashoffset"
          :cx="size / 2"
          :cy="size / 2"
          :r="(size - 4) / 2"
        />
      </svg>
    </div>

    <!-- Fill variant -->
    <div
      v-else-if="variant === 'fill'"
      role="progressbar"
      :aria-valuemin="0"
      :aria-valuemax="100"
      :aria-valuenow="progress"
      :aria-valuetext="`${progress}%`"
      data-slot="file-upload-progress"
      :class="cn(
        'absolute inset-0 bg-primary/50 transition-[clip-path] duration-300 ease-linear',
        props.class
      )"
      :style="{ clipPath: `inset(${100 - progress}% 0% 0% 0%)` }"
    />

    <!-- Linear variant (default) -->
    <div
      v-else
      role="progressbar"
      :aria-valuemin="0"
      :aria-valuemax="100"
      :aria-valuenow="progress"
      :aria-valuetext="`${progress}%`"
      data-slot="file-upload-progress"
      :class="cn(
        'relative h-1.5 w-full overflow-hidden rounded-full bg-primary/20',
        props.class
      )"
    >
      <div
        class="h-full w-full flex-1 bg-primary transition-transform duration-300 ease-linear"
        :style="{ transform: `translateX(-${100 - progress}%)` }"
      />
    </div>
  </template>
</template>

