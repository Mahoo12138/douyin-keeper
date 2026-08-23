<template>
  <div
    :class="cn(
      'group relative col-span-3 flex flex-col justify-between overflow-hidden rounded-xl h-full',
      // light styles
      'bg-background [box-shadow:0_0_0_1px_rgba(0,0,0,.03),0_2px_4px_rgba(0,0,0,.05),0_12px_24px_rgba(0,0,0,.05)]',
      // dark styles
      'transform-gpu dark:bg-background dark:[border:1px_solid_rgba(255,255,255,.1)] dark:[box-shadow:0_-20px_80px_-20px_#ffffff1f_inset]',
      className
    )"
    v-bind="$attrs"
  >
    <div>
      <slot name="background" />
    </div>
    <div class="pointer-events-none z-10 flex transform-gpu flex-col gap-3 p-6 transition-all duration-300 group-hover:-translate-y-8 flex-1">
      <component 
        :is="icon" 
        class="h-10 w-10 origin-left transform-gpu text-slate-700 dark:text-slate-300 transition-all duration-300 ease-in-out group-hover:scale-75 flex-shrink-0" 
      />
      <div class="flex flex-col gap-2 flex-1">
        <h3 class="text-lg font-semibold text-slate-900 dark:text-white leading-tight">
          {{ name }}
        </h3>
        <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
          {{ description }}
        </p>
      </div>
    </div>

    <div
      :class="cn(
        'pointer-events-none absolute bottom-0 flex w-full translate-y-10 transform-gpu flex-row items-center p-4 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100'
      )"
    >
      <Button 
        variant="ghost" 
        size="sm" 
        as-child
        class="pointer-events-auto text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
      >
        <NuxtLink :to="href">
          {{ cta }}
          <ArrowRight class="ms-2 h-4 w-4 rtl:rotate-180" />
        </NuxtLink>
      </Button>
    </div>
    <div class="pointer-events-none absolute inset-0 transform-gpu transition-all duration-300 group-hover:bg-black/[.03] group-hover:dark:bg-neutral-800/10" />
  </div>
</template>

<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import type { Component } from 'vue'

interface Props {
  name: string
  className: string
  icon: Component
  description: string
  href: string
  cta: string
}

const props = defineProps<Props>()
</script> 