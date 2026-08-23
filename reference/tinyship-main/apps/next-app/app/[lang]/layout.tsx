import type { Metadata, Viewport } from "next";
import { GeistSans } from 'geist/font/sans';

import "../globals.css";
import { i18n } from '../i18n-config';
import { use } from 'react';
import { Toaster } from "@libs/react-shared/ui/sonner"
import { translations } from "@libs/i18n";
import { ThemeProvider } from '@libs/react-shared/hooks/use-theme';
import { ThemeScript } from "@libs/react-shared/components/theme-script";
import { SharedAppWrapper } from "@/components/shared-app-wrapper";


export async function generateViewport({ params }: { params: Promise<{ lang: string }> }): Promise<Viewport> {
  return {
    themeColor: '#3b82f6',
  };
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = translations[lang as keyof typeof translations];
  
  return {
    metadataBase: new URL(process.env.APP_BASE_URL || 'http://localhost:7001'),
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
  return i18n.locales.map((locale) => ({ lang: locale }));
}

export default function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = use(params);
  
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${GeistSans.className} antialiased`}>
        <ThemeProvider>
          <SharedAppWrapper>
            {children}
            <Toaster />
          </SharedAppWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
} 