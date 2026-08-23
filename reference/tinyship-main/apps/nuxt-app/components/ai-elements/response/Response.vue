<script setup lang="ts">
import { cn } from '@/lib/utils'
import { StreamMarkdown } from 'streamdown-vue'
import { computed, useAttrs, useSlots } from 'vue'
import 'katex/dist/katex.min.css'

interface Props {
  content?: string
}

const props = defineProps<Props>()
const attrs = useAttrs()
const slots = useSlots()

// Get theme for dynamic Shiki highlighting
const { theme } = useTheme()

const classes = computed(() =>
  cn(
    'size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
    attrs.class || '',
  ),
)

const slotContent = computed<string | undefined>(() => {
  const nodes = slots.default?.() || []
  let text = ''
  for (const node of nodes) {
    if (typeof node.children === 'string')
      text += node.children
  }
  return text || undefined
})

const md = computed(() => (slotContent.value ?? props.content ?? '') as string)

// Dynamic Shiki theme based on current theme
const shikiTheme = computed(() => {
  // You can customize these themes based on your preference
  return theme.value === 'dark' 
    ? 'github-dark'        // Options: 'tokyo-night', 'dracula', 'one-dark-pro', 'catppuccin-mocha'
    : 'github-light'       // Options: 'one-light', 'catppuccin-latte', 'material-theme-lighter'
})
</script>

<template>
  <StreamMarkdown :class="classes" :content="md" :shiki-theme="shikiTheme" />
</template>
