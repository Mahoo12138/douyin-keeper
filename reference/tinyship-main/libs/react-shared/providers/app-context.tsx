'use client'

import { createContext, useContext } from 'react'
import type { Translations, SupportedLocale } from '@libs/i18n'

interface SharedAppContextValue {
  t: Translations
  locale: SupportedLocale
}

const SharedAppContext = createContext<SharedAppContextValue | null>(null)

export function SharedAppProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: SharedAppContextValue
}) {
  return (
    <SharedAppContext.Provider value={value}>
      {children}
    </SharedAppContext.Provider>
  )
}

/**
 * Access shared translation context from within libs/react-shared components.
 * Each app (Next.js, TanStack Start) wraps its root with SharedAppProvider,
 * injecting its own useTranslation() result.
 */
export function useSharedApp() {
  const ctx = useContext(SharedAppContext)
  if (!ctx) {
    throw new Error('useSharedApp must be used within a SharedAppProvider')
  }
  return ctx
}
