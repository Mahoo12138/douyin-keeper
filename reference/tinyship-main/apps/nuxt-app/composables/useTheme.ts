// Enhanced theme composable for Nuxt with localStorage persistence and color scheme support
import { config } from '@config'
import { 
  type Theme, 
  type ColorScheme, 
  type ThemeState,
  applyThemeToDocument,
  getStoredThemeState,
  saveThemeState
} from '@libs/ui/themes'

// Global state - 确保所有组件使用相同的状态实例
const STORAGE_KEY = config.app.theme.storageKey

// Check if we have initial theme state from app.vue script
const getInitialThemeState = (): ThemeState => {
  if (import.meta.client && typeof window !== 'undefined' && (window as any).__INITIAL_THEME_STATE__) {
    return (window as any).__INITIAL_THEME_STATE__ as ThemeState
  }
  
  // Fallback to config defaults
  return {
    theme: config.app.theme.defaultTheme,
    colorScheme: config.app.theme.defaultColorScheme
  }
}

const initialState = getInitialThemeState()
const theme = ref<Theme>(initialState.theme)
const colorScheme = ref<ColorScheme>(initialState.colorScheme)
const isInitialized = ref(false)
// Track hydration state to prevent mismatches
const isHydrated = ref(false)

export const useTheme = () => {
  
  // Initialize state from localStorage or use config defaults
  const initializeTheme = () => {
    if (!import.meta.client) return false
    
    // If we already have initial state from app.vue script, use it
    if ((window as any).__INITIAL_THEME_STATE__) {
      const initialState = (window as any).__INITIAL_THEME_STATE__ as ThemeState
      theme.value = initialState.theme
      colorScheme.value = initialState.colorScheme
      
      // Clean up the global variable
      delete (window as any).__INITIAL_THEME_STATE__
      
      return true // Theme already applied by app.vue script
    }
    
    // Fallback: check localStorage directly
    const stored = getStoredThemeState(STORAGE_KEY)
    
    if (stored) {
      theme.value = stored.theme
      colorScheme.value = stored.colorScheme
      return false // Need to apply theme
    } else {
      // No stored preferences, keep config defaults and will save them
      return false // Need to apply theme
    }
  }
  
  // Apply theme classes to document
  const applyTheme = (saveToStorage = true) => {
    if (!import.meta.client) return
    
    // Apply theme to document
    applyThemeToDocument(theme.value, colorScheme.value)
    
    // Save to localStorage if requested
    if (saveToStorage && isInitialized.value) {
      saveThemeState(STORAGE_KEY, {
        theme: theme.value,
        colorScheme: colorScheme.value
      })
    }
  }
  
  // Theme setters
  const setTheme = (newTheme: Theme) => {
    theme.value = newTheme
  }
  
  const setColorScheme = (newColorScheme: ColorScheme) => {
    colorScheme.value = newColorScheme
  }
  
  // Initialize only once
  if (import.meta.client && !isInitialized.value) {
    onMounted(() => {
      const themeAlreadyApplied = initializeTheme()
      
      // Only apply theme if it wasn't already applied by app.vue script
      if (!themeAlreadyApplied) {
        const hasStoredPreferences = getStoredThemeState(STORAGE_KEY) !== null
        applyTheme(!hasStoredPreferences) // Save to localStorage if no stored preferences found
      }
      
      isInitialized.value = true
      
      // Mark as hydrated after initial mount
      nextTick(() => {
        isHydrated.value = true
        
        // Watch for changes and apply them
        watch([theme, colorScheme], () => applyTheme(true), { immediate: false })
      })
    })
  }
  
  return {
    theme: readonly(theme),
    colorScheme: readonly(colorScheme),
    isHydrated: readonly(isHydrated),
    setTheme,
    setColorScheme
  }
}

// Export types for external use
export type { Theme, ColorScheme, ThemeState } 