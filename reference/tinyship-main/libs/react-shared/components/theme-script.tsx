import { config } from '@config'
import { ALL_THEME_CLASSES, COLOR_SCHEME_CLASSES } from '@libs/ui/themes'

/**
 * Inline script that applies the stored theme before React hydrates.
 * Must be placed in <head> to prevent flash of wrong theme.
 */
export function ThemeScript() {
  const script = `
    (function() {
      try {
        var storageKey = '${config.app.theme.storageKey}';
        var defaultTheme = '${config.app.theme.defaultTheme}';
        var defaultColorScheme = '${config.app.theme.defaultColorScheme}';
        var allThemeClasses = ${JSON.stringify(ALL_THEME_CLASSES)};
        var colorSchemeClasses = ${JSON.stringify(COLOR_SCHEME_CLASSES)};
        var theme = defaultTheme;
        var colorScheme = defaultColorScheme;
        try {
          var stored = localStorage.getItem(storageKey);
          if (stored) {
            var parsed = JSON.parse(stored);
            if (parsed.theme) theme = parsed.theme;
            if (parsed.colorScheme) colorScheme = parsed.colorScheme;
          }
        } catch (e) {}
        var root = document.documentElement;
        root.classList.remove.apply(root.classList, allThemeClasses);
        if (theme === 'dark') {
          root.classList.add('dark');
        }
        if (colorScheme !== 'default') {
          var cls = colorSchemeClasses[colorScheme];
          if (cls) root.classList.add(cls);
        }
      } catch (error) {}
    })();
  `

  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning={true}
    />
  )
}
