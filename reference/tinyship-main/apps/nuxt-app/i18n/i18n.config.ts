import { translations } from '@libs/i18n'
import { config } from '@config'

export default defineI18nConfig(() => {
  return {
    legacy: false,
    locale: config.app.i18n.defaultLocale,
    fallbackLocale: config.app.i18n.defaultLocale,
    messages: translations
  }
})
