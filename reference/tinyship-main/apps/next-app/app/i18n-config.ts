import { translations, locales } from '@libs/i18n';
import { config } from '@config';

export type Locale = keyof typeof translations;

export const i18n = {
  defaultLocale: config.app.i18n.defaultLocale,
  locales: locales as unknown as readonly [Locale, ...Locale[]],
} as const;

export type I18nConfig = typeof i18n; 