import { en, zhCN } from './locales'

// Re-export from config for consistency
export { config } from '@config'

export const defaultLocale = 'en'
export const locales = ['en', 'zh-CN'] as const

export type SupportedLocale = typeof locales[number]

/**
 * Human-readable labels for each locale.
 * When adding a new locale, add its label here so admin UIs can display it.
 * Falls back to the locale code itself if not listed.
 */
export const localeLabels: Record<string, string> = {
  'en': 'English',
  'zh-CN': '中文',
}

export function getLocaleLabel(locale: string): string {
  return localeLabels[locale] || locale
}

// 基于英文翻译自动推断类型
export type Translations = typeof en

export const translations = {
  en,
  'zh-CN': zhCN
} as const

export function isValidLocale(locale: string): locale is SupportedLocale {
  return locales.includes(locale as SupportedLocale)
}

// 类型安全的翻译函数
export function getTranslation(locale: SupportedLocale): Translations {
  return translations[locale] as Translations
}

export * from './locales' 