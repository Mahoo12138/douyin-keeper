<script setup lang="ts">
import { useFileUploadContext } from './types'

const context = useFileUploadContext()

const handleClick = (e: MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()
  
  if (context.disabled.value) return
  
  context.openFileDialog()
}
</script>

<template>
  <span
    data-slot="file-upload-trigger"
    :data-disabled="context.disabled.value ? '' : undefined"
    @click="handleClick"
  >
    <slot />
  </span>
</template>

