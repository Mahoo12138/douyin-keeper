import { Moon, Palette, Sun } from 'lucide-react'
import { Button } from './button'
import { COLOR_SCHEMES, THEME_CONFIG, type ColorScheme } from '../themes'
import { useTheme } from './theme-provider'

export function ThemeToggle() {
  const { mode, colorScheme, setMode, setColorScheme } = useTheme()
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" onClick={() => setMode(mode === 'light' ? 'dark' : 'light')} aria-label={mode === 'light' ? '切换深色模式' : '切换浅色模式'}>
        {mode === 'light' ? <Moon /> : <Sun />}
      </Button>
      <label className="relative flex items-center">
        <Palette className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
        <select value={colorScheme} onChange={(event) => setColorScheme(event.target.value as ColorScheme)} aria-label="选择主题色" className="h-9 w-9 appearance-none rounded-md border border-transparent bg-transparent pl-7 pr-1 text-xs outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring sm:w-32">
          {COLOR_SCHEMES.map((scheme) => <option key={scheme} value={scheme}>{THEME_CONFIG[scheme].name}</option>)}
        </select>
      </label>
    </div>
  )
}
