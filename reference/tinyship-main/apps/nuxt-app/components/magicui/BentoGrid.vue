<template>
  <div
    :class="cn(
      'grid w-full auto-rows-[16rem] grid-cols-3 gap-4',
      className
    )"
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { cn } from '@/lib/utils'

interface Props {
  className?: string
}

const props = withDefaults(defineProps<Props>(), {
  className: ''
})
</script> 