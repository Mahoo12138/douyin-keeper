'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { config } from '@config'
import { 
  type Theme, 
  type ColorScheme, 
  type ThemeState,
  applyThemeToDocument,
  getStoredThemeState,
  saveThemeState
} from '@libs/ui/themes'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  defaultColorScheme?: ColorScheme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  colorScheme: ColorScheme
  setTheme: (theme: Theme) => void
  setColorScheme: (scheme: ColorScheme) => void
}

const initialState: ThemeProviderState = {
  theme: config.app.theme.defaultTheme,
  colorScheme: config.app.theme.defaultColorScheme,
  setTheme: () => null,
  setColorScheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = config.app.theme.defaultTheme,
  defaultColorScheme = config.app.theme.defaultColorScheme,
  storageKey = config.app.theme.storageKey,
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme)
  const [colorScheme, setColorScheme] = useState<ColorScheme>(defaultColorScheme)

  useEffect(() => {
    // Try to get stored preferences
    const stored = getStoredThemeState(storageKey)
    
    if (stored) {
      if (stored.theme !== theme) {
        setTheme(stored.theme)
      }
      if (stored.colorScheme !== colorScheme) {
        setColorScheme(stored.colorScheme)
      }
    } else {
      // No stored preferences, use config defaults and save them
      const defaultState: ThemeState = {
        theme: defaultTheme,
        colorScheme: defaultColorScheme
      }
      
      if (defaultTheme !== theme) {
        setTheme(defaultTheme)
      }
      if (defaultColorScheme !== colorScheme) {
        setColorScheme(defaultColorScheme)
      }
      
      // Save defaults to localStorage
      saveThemeState(storageKey, defaultState)
    }
  }, [storageKey, defaultTheme, defaultColorScheme]) // Include all dependencies

  useEffect(() => {
    // Apply theme to document
    applyThemeToDocument(theme, colorScheme)
    
    // Save to localStorage
    saveThemeState(storageKey, { theme, colorScheme })
  }, [theme, colorScheme, storageKey])

  const value = {
    theme,
    colorScheme,
    setTheme,
    setColorScheme,
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider')

  return context
} 