<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { useFileUploadContext, useFileUploadItemContext } from './types'

interface Props {
  class?: string
  size?: 'default' | 'sm'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'default',
})

const context = useFileUploadContext()
const itemContext = useFileUploadItemContext()

const fileState = computed(() => itemContext.fileState())
const formattedSize = computed(() => 
  fileState.value ? context.formatBytes(fileState.value.file.size) : ''
)
</script>

<template>
  <div
    v-if="fileState"
    data-slot="file-upload-metadata"
    :class="cn('flex min-w-0 flex-1 flex-col', props.class)"
  >
    <slot v-if="$slots.default" />
    <template v-else>
      <span
        :class="cn(
          'truncate font-medium text-sm',
          size === 'sm' && 'font-normal text-[13px] leading-snug'
        )"
      >
        {{ fileState.file.name }}
      </span>
      <span
        :class="cn(
          'truncate text-muted-foreground text-xs',
          size === 'sm' && 'text-[11px] leading-snug'
        )"
      >
        {{ formattedSize }}
      </span>
      <span
        v-if="fileState.error"
        class="text-destructive text-xs"
      >
        {{ fileState.error }}
      </span>
    </template>
  </div>
</template>

