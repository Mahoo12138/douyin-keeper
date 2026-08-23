<script setup lang="ts">
import { Textarea } from '@/components/ui/textarea'
import { computed, useAttrs, ref } from 'vue'

interface Props {
  class?: string
  placeholder?: string
}

const props = defineProps<Props>()
const attrs = useAttrs()

const placeholder = props.placeholder ?? 'What would you like to know?'
const isComposing = ref(false)

const classes = computed(() => [
  'w-full resize-none rounded-none border-none p-3 shadow-none outline-none ring-0',
  'field-sizing-content max-h-[6lh] bg-transparent dark:bg-transparent',
  'focus-visible:ring-0',
  props.class,
])

function handleCompositionStart() {
  isComposing.value = true
}

function handleCompositionEnd() {
  isComposing.value = false
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    // Don't submit if we're in the middle of composing (e.g., Chinese input)
    if (isComposing.value)
      return
    if (e.shiftKey)
      return
    e.preventDefault()
    const form = (e.target as HTMLTextAreaElement).form
    form?.requestSubmit()
  }
}
</script>

<template>
  <Textarea
    :class="classes"
    name="message"
    :placeholder="placeholder"
    v-bind="attrs"
    @keydown="handleKeyDown"
    @compositionstart="handleCompositionStart"
    @compositionend="handleCompositionEnd"
  />
</template>
