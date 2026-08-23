<script setup lang="ts">
import { computed, provide } from 'vue'
import { cn } from '@/lib/utils'
import { useFileUploadContext, FILE_UPLOAD_ITEM_KEY } from './types'

interface Props {
  class?: string
  file: File
}

const props = defineProps<Props>()

const context = useFileUploadContext()

const fileState = computed(() => context.state.files.get(props.file))

// Provide item context
provide(FILE_UPLOAD_ITEM_KEY, {
  file: props.file,
  fileState: () => fileState.value,
})
</script>

<template>
  <div
    v-if="fileState"
    role="listitem"
    data-slot="file-upload-item"
    :data-status="fileState.status"
    :class="cn(
      'relative flex items-center gap-2.5 rounded-md border p-3',
      props.class
    )"
  >
    <slot 
      :file="file"
      :file-state="fileState"
      :progress="fileState.progress"
      :status="fileState.status"
      :error="fileState.error"
    />
  </div>
</template>
