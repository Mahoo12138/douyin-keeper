<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { useFileUploadContext } from './types'

interface Props {
  class?: string
  orientation?: 'horizontal' | 'vertical'
  forceMount?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  orientation: 'vertical',
  forceMount: false,
})

const context = useFileUploadContext()

const fileCount = computed(() => context.state.files.size)
const shouldRender = computed(() => props.forceMount || fileCount.value > 0)
const files = computed(() => Array.from(context.state.files.values()))
</script>

<template>
  <div
    v-if="shouldRender"
    role="list"
    data-slot="file-upload-list"
    :data-orientation="orientation"
    :data-state="shouldRender ? 'active' : 'inactive'"
    :class="cn(
      'flex flex-col gap-2',
      'data-[state=inactive]:fade-out-0 data-[state=active]:fade-in-0',
      'data-[state=inactive]:slide-out-to-top-2 data-[state=active]:slide-in-from-top-2',
      'data-[state=active]:animate-in data-[state=inactive]:animate-out',
      orientation === 'horizontal' && 'flex-row overflow-x-auto p-1.5',
      props.class
    )"
  >
    <slot :files="files" />
  </div>
</template>

