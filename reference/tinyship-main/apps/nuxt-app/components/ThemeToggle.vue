<template>
  <Button 
    variant="ghost" 
    size="sm" 
    class="h-8 w-8 px-0" 
    @click="toggleTheme"
    :title="isHydrated ? currentThemeLabel : 'Toggle theme'"
  >
    <!-- Show correct icon only after hydration to prevent mismatch -->
    <!-- During SSR, show light icon as default -->
    <SunIcon 
      v-if="!isHydrated || theme === 'light'"
      class="h-4 w-4 transition-all"
    />
    <MoonIcon 
      v-else
      class="h-4 w-4 transition-all"
    />
    <span class="sr-only">
      {{ isHydrated ? currentThemeLabel : 'Toggle theme' }}
    </span>
  </Button>
</template>

<script setup lang="ts">
import { SunIcon, MoonIcon } from 'lucide-vue-next'
import { computed } from 'vue'

const { theme, setTheme, isHydrated } = useTheme()
const { t } = useI18n()

// Simple toggle between light and dark
const toggleTheme = () => {
  setTheme(theme.value === 'light' ? 'dark' : 'light')
}

// Current theme label for accessibility
const currentThemeLabel = computed(() => {
  return theme.value === 'light' ? t('common.theme.dark') : t('common.theme.light')
})
</script> 