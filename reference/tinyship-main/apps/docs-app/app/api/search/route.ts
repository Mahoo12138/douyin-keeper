import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

// Configure for static export
// it should be cached forever
export const revalidate = false;

export const { staticGET: GET } = createFromSource(source, {
  // Configure language mapping for i18n support
  // https://docs.orama.com/open-source/supported-languages
  localeMap: {
    en: { language: 'english' },
    'zh-CN': { language: 'english' }, // Use english for Chinese since zh-CN is not supported by Orama
  },
});

