import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { applyTheme, readTheme, saveTheme, type ColorScheme, type ThemeMode } from '../themes'

type ThemeContextValue = {
  mode: ThemeMode
  colorScheme: ColorScheme
  setMode: (mode: ThemeMode) => void
  setColorScheme: (colorScheme: ColorScheme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const initial = readTheme()
  const [mode, setMode] = useState<ThemeMode>(initial.mode)
  const [colorScheme, setColorScheme] = useState<ColorScheme>(initial.colorScheme)

  useEffect(() => {
    applyTheme(mode, colorScheme)
    saveTheme({ mode, colorScheme })
  }, [colorScheme, mode])

  const value = useMemo(() => ({ mode, colorScheme, setMode, setColorScheme }), [colorScheme, mode])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
