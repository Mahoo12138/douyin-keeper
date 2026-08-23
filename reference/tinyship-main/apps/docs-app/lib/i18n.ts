import { defineI18n } from 'fumadocs-core/i18n';
import { config } from '@config';

export const i18n = defineI18n({
  defaultLanguage: config.app.i18n.defaultLocale || 'en',
  languages: [...config.app.i18n.locales],
  hideLocale: 'never',
});