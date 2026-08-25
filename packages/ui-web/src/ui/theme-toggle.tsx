import { Check, Moon, Palette, Sun } from 'lucide-react'
import { Button } from './button'
import { COLOR_SCHEMES, THEME_CONFIG, type ColorScheme } from '../themes'
import { useTheme } from './theme-provider'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu'

export function ThemeToggle() {
  const { mode, colorScheme, setMode, setColorScheme } = useTheme()
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" onClick={() => setMode(mode === 'light' ? 'dark' : 'light')} aria-label={mode === 'light' ? '切换深色模式' : '切换浅色模式'}>
        {mode === 'light' ? <Moon /> : <Sun />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="选择主题色"><Palette /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {COLOR_SCHEMES.map((scheme) => (
            <DropdownMenuItem key={scheme} onSelect={() => setColorScheme(scheme as ColorScheme)}>
              <span className="size-3 rounded-full" style={{ backgroundColor: THEME_CONFIG[scheme].color }} />
              <span>{THEME_CONFIG[scheme].name}</span>
              {scheme === colorScheme && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
