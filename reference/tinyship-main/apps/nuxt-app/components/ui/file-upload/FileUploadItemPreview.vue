<script setup lang="ts">
import { computed } from 'vue'
import { FileIcon } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { useFileUploadContext, useFileUploadItemContext } from './types'

interface Props {
  class?: string
}

const props = defineProps<Props>()

const context = useFileUploadContext()
const itemContext = useFileUploadItemContext()

const fileState = computed(() => itemContext.fileState())
const isImage = computed(() => fileState.value?.file.type.startsWith('image/'))
const previewUrl = computed(() => {
  if (isImage.value && fileState.value) {
    return context.getFileUrl(fileState.value.file)
  }
  return null
})
</script>

<template>
  <div
    v-if="fileState"
    data-slot="file-upload-preview"
    :class="cn(
      'relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border bg-accent/50',
      props.class
    )"
  >
    <img
      v-if="previewUrl"
      :src="previewUrl"
      :alt="fileState.file.name"
      class="size-full object-cover"
    />
    <FileIcon v-else class="size-5 text-muted-foreground" />
    <slot />
  </div>
</template>

