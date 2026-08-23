import { docs, blogPosts } from '@/.source/server';
import { i18n } from '@/lib/i18n';
import { loader } from 'fumadocs-core/source';
import { toFumadocsSource } from 'fumadocs-mdx/runtime/server';

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  // it assigns a URL to your pages
  i18n,
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});

// Blog loader with i18n support
export const blog = loader({
  i18n,
  baseUrl: '/blog',
  source: toFumadocsSource(blogPosts, []),
});
