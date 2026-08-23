import { config } from '@config'
import { ALL_THEME_CLASSES, COLOR_SCHEME_CLASSES } from '@libs/ui/themes'

// This script runs immediately to prevent theme flash
// It must be placed in the <head> before any styled content
export function ThemeScript() {
  const script = `
    (function() {
      try {
        const storageKey = '${config.app.theme.storageKey}';
        const defaultTheme = '${config.app.theme.defaultTheme}';
        const defaultColorScheme = '${config.app.theme.defaultColorScheme}';
        
        // Theme class mappings from @libs/ui/themes
        const allThemeClasses = ${JSON.stringify(ALL_THEME_CLASSES)};
        
        const colorSchemeClasses = ${JSON.stringify(COLOR_SCHEME_CLASSES)};
        
        // Get stored preferences
        let theme = defaultTheme;
        let colorScheme = defaultColorScheme;
        
        try {
          const stored = localStorage.getItem(storageKey);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.theme) theme = parsed.theme;
            if (parsed.colorScheme) colorScheme = parsed.colorScheme;
          }
        } catch (e) {
          // Use defaults if parsing fails
        }
        
        // Apply theme immediately
        const root = document.documentElement;
        
        // Remove all theme classes
        root.classList.remove(...allThemeClasses);
        
        // Apply theme class (only dark needs explicit class)
        if (theme === 'dark') {
          root.classList.add('dark');
        }
        
        // Apply color scheme class
        if (colorScheme !== 'default') {
          const colorSchemeClass = colorSchemeClasses[colorScheme];
          if (colorSchemeClass) {
            root.classList.add(colorSchemeClass);
          }
        }
      } catch (error) {
        // Silent fail - theme will be applied later by React
      }
    })();
  `

  return (
    <script 
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning={true}
    />
  )
} 