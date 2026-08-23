'use client'

import * as React from 'react'
import { Moon, Sun, Palette, Check, Monitor } from 'lucide-react'
import { useTheme } from '@libs/react-shared/hooks/use-theme'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@libs/react-shared/ui/dropdown-menu"
import { Button } from "@libs/react-shared/ui/button"
import { THEME_CONFIG } from '@libs/ui/themes'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      className="relative"
    >
      <Sun className="size-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute size-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}

export function ColorSchemeToggle() {
  const { colorScheme, setColorScheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 px-3">
          <Palette className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">
            {THEME_CONFIG[colorScheme]?.name || 'Unknown'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {Object.entries(THEME_CONFIG).map(([key, config]) => (
          <DropdownMenuItem
            key={key}
            onClick={() => setColorScheme(key as any)}
          >
            <div 
              className="mr-2 h-4 w-4 rounded-full" 
              style={{ backgroundColor: config.color }}
            />
            <span>{config.name}</span>
            {colorScheme === key && (
              <Check className="ml-auto h-4 w-4" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Combined theme selector that includes both theme and color scheme
export function ThemeSelector() {
  const { theme, colorScheme, setTheme, setColorScheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 px-3">
          <Palette className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-sm font-semibold text-foreground">
          Appearance
        </div>
        <DropdownMenuSeparator />
        
        <DropdownMenuItem 
          onClick={() => setTheme('light')}
        >
          <Sun className="mr-2 h-4 w-4" />
          <span>Light</span>
          {theme === 'light' && <Check className="ml-auto h-4 w-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme('dark')}
        >
          <Moon className="mr-2 h-4 w-4" />
          <span>Dark</span>
          {theme === 'dark' && <Check className="ml-auto h-4 w-4" />}
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-sm font-semibold text-foreground">
          Color Scheme
        </div>
        
        {Object.entries(THEME_CONFIG).map(([key, config]) => (
          <DropdownMenuItem 
            key={key}
            onClick={() => setColorScheme(key as keyof typeof THEME_CONFIG)}
          >
            <div 
              className="mr-2 h-4 w-4 rounded-full" 
              style={{ backgroundColor: config.color }}
            ></div>
            <span>{config.name}</span>
            {colorScheme === key && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 