<script setup lang="ts">
import { useFileUploadContext, useFileUploadItemContext } from './types'

const context = useFileUploadContext()
const itemContext = useFileUploadItemContext()

const handleClick = () => {
  context.removeFile(itemContext.file)
}
</script>

<template>
  <span
    data-slot="file-upload-item-delete"
    @click="handleClick"
  >
    <slot />
  </span>
</template>

