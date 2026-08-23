<script setup lang="ts">
import { StickToBottom } from 'vue-stick-to-bottom'
import ConversationScrollButton from './ConversationScrollButton.vue'

interface Props {
  ariaLabel?: string
  class?: string
  initial?: boolean | 'instant' | { damping?: number, stiffness?: number, mass?: number }
  resize?: 'instant' | { damping?: number, stiffness?: number, mass?: number }
  damping?: number
  stiffness?: number
  mass?: number
  anchor?: 'auto' | 'none'
  bottomOffset?: number
}

const props = withDefaults(defineProps<Props>(), {
  ariaLabel: 'Conversation',
  initial: true,
  damping: 0.7,
  stiffness: 0.05,
  mass: 1.25,
  anchor: 'none',
  bottomOffset: 0,
})

// Create targetScrollTop function to handle bottom offset
const targetScrollTop = (target: number, ctx: { scrollElement: HTMLElement; contentElement: HTMLElement }) => {
  // If target is -1, it means no scrolling is needed
  if (target === -1) {
    return -1
  }
  
  // The target represents the scroll position to reach the bottom
  // Since we're using paddingBottom on ConversationContent, we don't need to adjust target
  // The paddingBottom ensures content is not obscured by fixed input
  return target
}
</script>

<template>
  <StickToBottom
    :aria-label="props.ariaLabel"
    class="relative flex-1"
    :class="[props.class]"
    role="log"
    :initial="props.initial"
    :resize="props.resize"
    :damping="props.damping"
    :stiffness="props.stiffness"
    :mass="props.mass"
    :anchor="props.anchor"
    :target-scroll-top="targetScrollTop"
  >
    <slot />
    <ConversationScrollButton />
  </StickToBottom>
</template>
