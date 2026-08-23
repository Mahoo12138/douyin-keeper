<script setup lang="ts">
import { computed } from 'vue'
import { useFileUploadContext } from './types'

interface Props {
  forceMount?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  forceMount: false,
})

const context = useFileUploadContext()

const fileCount = computed(() => context.state.files.size)
const shouldRender = computed(() => props.forceMount || fileCount.value > 0)

const handleClick = () => {
  context.clearAll()
}
</script>

<template>
  <span
    v-if="shouldRender"
    data-slot="file-upload-clear"
    :data-disabled="context.disabled.value ? '' : undefined"
    @click="handleClick"
  >
    <slot />
  </span>
</template>

