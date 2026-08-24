export type ThemeMode = 'light' | 'dark'
export type ColorScheme = 'default' | 'claude' | 'cosmic-night' | 'modern-minimal' | 'ocean-breeze' | 'perplexity'

export const COLOR_SCHEMES = ['default', 'claude', 'cosmic-night', 'modern-minimal', 'ocean-breeze', 'perplexity'] as const

export const THEME_CONFIG: Record<ColorScheme, { name: string; color: string }> = {
  default: { name: 'Default', color: '#343434' },
  claude: { name: 'Claude', color: '#b45309' },
  'cosmic-night': { name: 'Cosmic Night', color: '#7c3aed' },
  'modern-minimal': { name: 'Modern Minimal', color: '#6366f1' },
  'ocean-breeze': { name: 'Ocean Breeze', color: '#10b981' },
  perplexity: { name: 'Perplexity', color: '#0d9488' },
}

const STORAGE_KEY = 'douyin-keeper-theme'
const THEME_CLASSES = ['dark', ...COLOR_SCHEMES.filter((scheme) => scheme !== 'default').map((scheme) => `theme-${scheme}`)]

export function applyTheme(mode: ThemeMode, colorScheme: ColorScheme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove(...THEME_CLASSES)
  if (mode === 'dark') root.classList.add('dark')
  if (colorScheme !== 'default') root.classList.add(`theme-${colorScheme}`)
}

export function readTheme(): { mode: ThemeMode; colorScheme: ColorScheme } {
  if (typeof window === 'undefined') return { mode: 'light', colorScheme: 'default' }
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '') as { mode?: ThemeMode; colorScheme?: ColorScheme }
    if ((stored.mode === 'light' || stored.mode === 'dark') && stored.colorScheme && COLOR_SCHEMES.includes(stored.colorScheme)) return { mode: stored.mode, colorScheme: stored.colorScheme }
  } catch { /* use defaults */ }
  return { mode: 'light', colorScheme: 'default' }
}

export function saveTheme(theme: { mode: ThemeMode; colorScheme: ColorScheme }) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theme))
}
