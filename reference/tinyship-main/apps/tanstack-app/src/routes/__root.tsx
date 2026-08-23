/// <reference types="vite/client" />
import { useEffect, type ReactNode } from 'react'
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  useLoaderData,
  useRouterState,
} from '@tanstack/react-router'
import { config } from '@config'
import { getPublicFeatureFlags } from '@/lib/feature-flags'
import { locales } from '@libs/i18n'
import { ThemeProvider } from '@libs/react-shared/hooks/use-theme'
import { ThemeScript } from '@libs/react-shared/components/theme-script'
import { Toaster } from '@libs/react-shared/ui/sonner'
import '../styles.css'

export const Route = createRootRoute({
  loader: () => getPublicFeatureFlags(),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'TinyShip' },
    ],
    links: [
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  component: RootComponent,
})

export function useAffiliateEnabled() {
  return useLoaderData({
    from: '__root__',
    select: (data) => data.affiliateEnabled,
  })
}

function useReferralCapture() {
  useEffect(() => {
    const url = new URL(window.location.href)
    const ref = url.searchParams.get('ref')
    if (!ref) return
    const referralCookieName = config.affiliate.cookie.name
    const existing = document.cookie.split(';').some(c => c.trim().startsWith(`${referralCookieName}=`))
    if (!existing) {
      const expires = new Date(
        Date.now() + config.affiliate.cookie.expiryDays * 24 * 60 * 60 * 1000,
      ).toUTCString()
      document.cookie = `${referralCookieName}=${encodeURIComponent(ref)}; path=/; expires=${expires}; samesite=lax`
    }
    url.searchParams.delete('ref')
    window.history.replaceState({}, '', url.pathname + url.search + url.hash)
  }, [])
}

function RootComponent() {
  useReferralCapture()
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function useHtmlLang(): string {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const segment = pathname.split('/')[1] ?? ''
  if ((locales as readonly string[]).includes(segment)) {
    return segment === 'zh-CN' ? 'zh-CN' : segment
  }
  return 'en'
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  const lang = useHtmlLang()
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <HeadContent />
        <ThemeScript />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
