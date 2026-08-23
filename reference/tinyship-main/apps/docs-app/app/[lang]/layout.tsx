import '@/app/global.css';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import { ThemeScript } from '@/components/theme-script';
import { defineI18nUI } from 'fumadocs-ui/i18n';
import { i18n } from '@/lib/i18n';
import { config } from '@config';
import { translations } from '@libs/i18n';
import { DocsRootProvider } from '@/components/docs-root-provider';

// Define i18n UI with translations for language switcher
const { provider } = defineI18nUI(i18n, {
  translations: {
    en: {
      displayName: 'English',
    },
    'zh-CN': {
      displayName: '中文',
      search: '搜索文档',
    },
  },
});


const inter = Inter({
  subsets: ['latin'],
});

export async function generateViewport({ params }: { params: Promise<{ lang: string }> }): Promise<Viewport> {
  return {
    themeColor: '#3b82f6',
  };
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = translations[lang as keyof typeof translations];
  
  return {
    metadataBase: new URL(process.env.APP_BASE_URL || 'http://localhost:3001'),
    title: t.home.metadata.title,
    description: t.home.metadata.description,
    keywords: t.home.metadata.keywords,
    icons: {
      icon: [
        { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
        { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        { url: '/favicon.ico', type: 'image/svg+xml' },
      ],
      apple: [
        { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      ],
      other: [
        { rel: 'mask-icon', url: '/logo.svg', color: '#3b82f6' },
        { rel: 'icon', url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
        { rel: 'icon', url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    manifest: '/site.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: t.home.metadata.title,
    },
    other: {
      'msapplication-TileColor': '#3b82f6',
      'msapplication-TileImage': '/mstile-150x150.png',
      'msapplication-config': 'none',
    },
    openGraph: {
      type: 'website',
      locale: lang,
      siteName: t.home.metadata.title,
      title: t.home.metadata.title,
      description: t.home.metadata.description,
      images: [
        {
          url: '/android-chrome-512x512.png',
          width: 512,
          height: 512,
          alt: t.home.metadata.title,
        },
      ],
    },
    twitter: {
      card: 'summary',
      title: t.home.metadata.title,
      description: t.home.metadata.description,
      images: ['/android-chrome-512x512.png'],
    },
  };
}

export async function generateStaticParams() {
  return config.app.i18n.locales.map((locale) => ({
    lang: locale,
  }));
}

export default async function Layout({ 
  params,
  children,
 }: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
 }) {
  const lang = (await params).lang;
  
  return (
    <html lang={lang} className={inter.className} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="flex flex-col min-h-screen">
        <Suspense fallback={null}>
          <DocsRootProvider i18n={provider(lang)}>
            {children}
          </DocsRootProvider>
        </Suspense>
      </body>
    </html>
  );
}
