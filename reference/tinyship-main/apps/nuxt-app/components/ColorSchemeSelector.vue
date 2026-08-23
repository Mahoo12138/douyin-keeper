<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="sm" class="h-8 px-3">
        <PaletteIcon class="mr-2 h-4 w-4" />
        <span class="hidden sm:inline">
          <!-- Show current theme name only after hydration to prevent mismatch -->
          {{ isHydrated ? currentColorSchemeName : 'Theme' }}
        </span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem 
        v-for="[key, config] in Object.entries(THEME_CONFIG)" 
        :key="key"
        @click="setColorScheme(key as ColorScheme)"
      >
        <div 
          class="mr-2 h-4 w-4 rounded-full" 
          :style="{ backgroundColor: config.color }"
        />
        <span>{{ config.name }}</span>
        <CheckIcon 
          v-if="colorScheme === key" 
          class="ml-auto h-4 w-4" 
        />
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { PaletteIcon, CheckIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import type { ColorScheme } from '../composables/useTheme'
import { THEME_CONFIG } from '@libs/ui/themes'

const { colorScheme, setColorScheme, isHydrated } = useTheme()

// Computed property for current color scheme display name - no translation needed
const currentColorSchemeName = computed(() => {
  return THEME_CONFIG[colorScheme.value]?.name || 'Unknown'
})
</script> 