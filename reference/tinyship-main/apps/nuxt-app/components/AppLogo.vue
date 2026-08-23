<template>
  <!-- Full logo image mode -->
  <div v-if="variant === 'full' && logoConfig.fullLogoUrl" :class="cn('flex items-center', currentSize.fullLogoHeight, logoConfig.iconClassName, className)">
    <img 
      :src="logoConfig.fullLogoUrl" 
      :alt="appName"
      class="object-contain w-auto h-full"
    />
  </div>
  
  <!-- Icon only variant -->
  <div v-else-if="variant === 'icon-only'" :class="cn(currentSize.container, 'flex items-center justify-center', logoConfig.iconClassName, iconClassName)">
    <img 
      :src="logoConfig.iconUrl" 
      :alt="appName"
      class="object-contain w-full h-full"
    />
  </div>
  
  <!-- Text only variant -->
  <span v-else-if="variant === 'text-only'" :class="cn('font-bold text-foreground', currentSize.text, textClassName)">
    {{ appName }}
  </span>
  
  <!-- Full variant (icon + text) -->
  <div v-else :class="cn('flex items-center space-x-3', className)">
    <div :class="cn(currentSize.container, 'flex items-center justify-center', logoConfig.iconClassName, iconClassName)">
      <img 
        :src="logoConfig.iconUrl" 
        :alt="appName"
        class="object-contain w-full h-full"
      />
    </div>
    <span v-if="showText" :class="cn('font-bold text-foreground', currentSize.text, textClassName)">
      {{ appName }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { cn } from '@/lib/utils'
import { config } from '@config'

interface Props {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'full' | 'icon-only' | 'text-only'
  className?: string
  showText?: boolean
  textClassName?: string
  iconClassName?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  variant: 'full',
  className: '',
  showText: true,
  textClassName: '',
  iconClassName: ''
})

const sizeClasses = {
  sm: {
    container: 'size-6',
    fullLogoHeight: 'h-6',
    imageSize: 24,
    text: 'text-sm'
  },
  md: {
    container: 'size-8',
    fullLogoHeight: 'h-8',
    imageSize: 32,
    text: 'text-lg'
  },
  lg: {
    container: 'size-10',
    fullLogoHeight: 'h-10',
    imageSize: 40,
    text: 'text-xl'
  }
}

const currentSize = computed(() => sizeClasses[props.size])
const appName = config.app.name
const logoConfig = config.app.logo
</script>
