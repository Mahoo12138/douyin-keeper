import { translations, type SupportedLocale, type Translations } from '@libs/i18n'
import { config } from '@config'

interface HeadConfig {
  meta: Array<{ title: string } | { name: string; content: string }>
}

/**
 * Resolve translations for a given lang param (used in route `head()` functions
 * which run outside of React component context).
 */
export function getTranslations(lang: string): Translations {
  const locale = lang as SupportedLocale
  return (translations[locale] || translations[config.app.i18n.defaultLocale as SupportedLocale]) as Translations
}

/**
 * Build a TanStack Router `head()` return value from i18n metadata keys.
 */
export function seoHead(
  lang: string,
  extract: (t: Translations) => { title: string; description?: string; keywords?: string },
): HeadConfig {
  const t = getTranslations(lang)
  const seo = extract(t)
  const meta: HeadConfig['meta'] = [{ title: seo.title }]
  if (seo.description) meta.push({ name: 'description', content: seo.description })
  if (seo.keywords) meta.push({ name: 'keywords', content: seo.keywords })
  return { meta }
}
