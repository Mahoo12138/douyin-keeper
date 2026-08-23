'use client'

import { SharedAppProvider } from '@libs/react-shared/providers/app-context'
import { useTranslation } from '@/hooks/use-translation'

export function SharedAppWrapper({ children }: { children: React.ReactNode }) {
  const { t, locale } = useTranslation()
  return (
    <SharedAppProvider value={{ t, locale }}>
      {children}
    </SharedAppProvider>
  )
}
