// Theme management module for consistent theme handling across the application
// Built on shadcn/ui theme system with 5 color schemes, light/dark modes, and tweakcn.com integration
export type Theme = 'light' | 'dark'
export type ColorScheme = 'default' | 'claude' | 'cosmic-night' | 'modern-minimal' | 'ocean-breeze' | 'perplexity'

export interface ThemeState {
  theme: Theme
  colorScheme: ColorScheme
}

// Available themes configuration (shadcn/ui compatible)
// Add new themes here and update theme files in libs/ui/styles/themes/
export const THEMES: readonly Theme[] = ['light', 'dark'] as const
export const COLOR_SCHEMES: readonly ColorScheme[] = [
  'default',
  'claude', 
  'cosmic-night',
  'modern-minimal',
  'ocean-breeze',
  'perplexity'
] as const

// Theme class mappings
export const THEME_CLASSES = {
  light: '',  // light is default, no class needed
  dark: 'dark',
} as const

export const COLOR_SCHEME_CLASSES = {
  default: '',  // default doesn't need a class
  claude: 'theme-claude',
  'cosmic-night': 'theme-cosmic-night',
  'modern-minimal': 'theme-modern-minimal',
  'ocean-breeze': 'theme-ocean-breeze',
  perplexity: 'theme-perplexity',
} as const

// All possible theme-related classes for cleanup
export const ALL_THEME_CLASSES = [
  'light', 
  'dark',
  'theme-default',
  'theme-claude',
  'theme-cosmic-night', 
  'theme-modern-minimal',
  'theme-ocean-breeze',
  'theme-perplexity'
] as const

// shadcn/ui theme configuration with UI display information
// Colors match the primary color of each theme for theme selector UI
export const THEME_CONFIG = {
  default: {
    name: 'Default',
    color: '#343434' // oklch(0.205 0 0) - Classic gray
  },
  claude: {
    name: 'Claude',
    color: '#b45309' // oklch(0.6171 0.1375 39.0427) - Warm orange
  },
  perplexity: {
    name: 'Perplexity',
    color: '#0d9488' // oklch(0.5322 0.0910 205.7465) - Teal cyan
  },
  'cosmic-night': {
    name: 'Cosmic Night',
    color: '#7c3aed' // oklch(0.5417 0.1790 288.0332) - Deep purple
  },
  'modern-minimal': {
    name: 'Modern Minimal',
    color: '#6366f1' // oklch(0.6231 0.1880 259.8145) - Modern purple-blue
  },
  'ocean-breeze': {
    name: 'Ocean Breeze',
    color: '#10b981' // oklch(0.7227 0.1920 149.5793) - Ocean teal-green
  }
} as const

/**
 * Apply theme classes to document root
 * @param theme - Theme mode (light/dark)
 * @param colorScheme - Color scheme
 */
export function applyThemeToDocument(theme: Theme, colorScheme: ColorScheme): void {
  if (typeof document === 'undefined') return
  
  const root = document.documentElement
  
  // Remove all existing theme classes
  root.classList.remove(...ALL_THEME_CLASSES)
  
  // Apply theme class (only dark needs explicit class)
  if (theme === 'dark') {
    root.classList.add(THEME_CLASSES.dark)
  }
  
  // Apply color scheme class (default doesn't need a class)
  if (colorScheme !== 'default') {
    root.classList.add(COLOR_SCHEME_CLASSES[colorScheme])
  }
}

/**
 * Get theme state from localStorage
 * @param storageKey - Storage key for theme preferences
 * @returns ThemeState or null if not found/invalid
 */
export function getStoredThemeState(storageKey: string): ThemeState | null {
  if (typeof localStorage === 'undefined') return null
  
  try {
    const stored = localStorage.getItem(storageKey)
    if (!stored) return null
    
    const parsed = JSON.parse(stored) as ThemeState
    
    // Validate stored values
    if (THEMES.includes(parsed.theme) && COLOR_SCHEMES.includes(parsed.colorScheme)) {
      return parsed
    }
    
    return null
  } catch (error) {
    console.warn('Failed to parse stored theme preferences:', error)
    return null
  }
}

/**
 * Save theme state to localStorage
 * @param storageKey - Storage key for theme preferences
 * @param themeState - Theme state to save
 */
export function saveThemeState(storageKey: string, themeState: ThemeState): void {
  if (typeof localStorage === 'undefined') return
  
  try {
    localStorage.setItem(storageKey, JSON.stringify(themeState))
  } catch (error) {
    console.warn('Failed to save theme preference to localStorage:', error)
  }
}

/**
 * Initialize theme immediately (for preventing flash)
 * This should be called as early as possible, preferably in <head>
 * @param storageKey - Storage key for theme preferences
 * @param defaultTheme - Default theme from config
 * @param defaultColorScheme - Default color scheme from config
 */
export function initializeThemeImmediate(
  storageKey: string,
  defaultTheme: Theme,
  defaultColorScheme: ColorScheme
): ThemeState {
  // Try to get stored preferences first
  const stored = getStoredThemeState(storageKey)
  
  const themeState: ThemeState = stored || {
    theme: defaultTheme,
    colorScheme: defaultColorScheme
  }
  
  // Apply theme immediately
  applyThemeToDocument(themeState.theme, themeState.colorScheme)
  
  // Save defaults if no stored preferences found
  if (!stored) {
    saveThemeState(storageKey, themeState)
  }
  
  return themeState
} 