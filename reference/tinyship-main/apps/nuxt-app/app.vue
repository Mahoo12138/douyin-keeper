<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'
import 'vue-sonner/style.css'
import { config } from '@config'
import { ALL_THEME_CLASSES } from '@libs/ui/themes'

// Inject theme initialization script in head to prevent FOUC
useHead({
  script: [
    {
      innerHTML: `
        (function() {
          // Theme configuration from dynamic config
          const THEME_CONFIG = {
            defaultTheme: '${config.app.theme.defaultTheme}',
            defaultColorScheme: '${config.app.theme.defaultColorScheme}',
            storageKey: '${config.app.theme.storageKey}'
          };
          
          // All possible theme classes for cleanup - imported from @libs/ui/themes
          const ALL_THEME_CLASSES = ${JSON.stringify(ALL_THEME_CLASSES)};
          
          // Try to get stored theme preferences
          let currentTheme = THEME_CONFIG.defaultTheme;
          let currentColorScheme = THEME_CONFIG.defaultColorScheme;
          
          try {
            if (typeof localStorage !== 'undefined') {
              const stored = localStorage.getItem(THEME_CONFIG.storageKey);
              if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.theme) currentTheme = parsed.theme;
                if (parsed.colorScheme) currentColorScheme = parsed.colorScheme;
              }
            }
          } catch (e) {
            // Fallback to defaults if localStorage fails
            console.warn('Failed to load theme from localStorage, using defaults:', e);
          }
          
          // Apply theme classes immediately to document root
          const html = document.documentElement;
          
          // Remove all existing theme classes first
          html.classList.remove(...ALL_THEME_CLASSES);
          
          // Apply theme class (only dark needs explicit class, light is default)
          if (currentTheme === 'dark') {
            html.classList.add('dark');
          }
          
          // Apply color scheme class (default doesn't need a class)
          if (currentColorScheme !== 'default') {
            html.classList.add('theme-' + currentColorScheme);
          }
          
          // Store the applied theme state for client-side consistency
          window.__INITIAL_THEME_STATE__ = {
            theme: currentTheme,
            colorScheme: currentColorScheme
          };
        })();
      `,
      type: 'text/javascript'
    }
  ]
})
</script>

<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <Toaster />
  </div>
</template>
