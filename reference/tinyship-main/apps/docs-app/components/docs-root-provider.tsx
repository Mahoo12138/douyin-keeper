'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { I18nProviderProps as FumadocsI18nProps } from 'fumadocs-ui/i18n';
import SearchDialog from '@/components/search';
import { config } from '@config';
import {
  applyThemeToDocument,
  getStoredThemeState,
} from '@libs/ui/themes';

type Props = {
  i18n: Omit<FumadocsI18nProps, 'children'>;
  children: ReactNode;
};

/**
 * Custom RootProvider wrapper that preserves theme classes on HTML element
 * when switching locales. Uses soft navigation to avoid full page refresh.
 */
export function DocsRootProvider({ i18n, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const localeSetRef = useRef<Set<string>>(new Set());

  // Build locale set for checking
  useMemo(() => {
    if (i18n.locales) {
      localeSetRef.current = new Set(i18n.locales.map((item) => item.locale));
    }
  }, [i18n.locales]);

  // Custom locale change handler that preserves theme classes
  const onLocaleChange = useCallback(
    (nextLocale: string) => {
      if (!nextLocale || nextLocale === i18n.locale) return;

      const segments = pathname.split('/').filter(Boolean);
      const localeSet = localeSetRef.current;

      if (segments.length === 0) {
        segments.unshift(nextLocale);
      } else if (localeSet.has(segments[0])) {
        segments[0] = nextLocale;
      } else {
        segments.unshift(nextLocale);
      }

      const href = `/${segments.join('/')}`;
      
      // Use soft navigation to preserve existing HTML classes (fonts/theme)
      router.push(href);
    },
    [i18n.locale, pathname, router]
  );

  // Re-apply theme classes after client navigation to preserve theme
  useEffect(() => {
    const storageKey = config.app.theme.storageKey;
    const defaultTheme = config.app.theme.defaultTheme;
    const defaultColorScheme = config.app.theme.defaultColorScheme;
    const stored = getStoredThemeState(storageKey);
    const themeState = stored || { theme: defaultTheme, colorScheme: defaultColorScheme };
    
    // Re-apply theme classes to ensure they persist
    applyThemeToDocument(themeState.theme, themeState.colorScheme);
  }, [i18n.locale]);

  // Merge custom onLocaleChange with the i18n config
  const i18nWithHandler = useMemo(() => ({
    ...i18n,
    onLocaleChange,
  }), [i18n, onLocaleChange]);

  return (
    <RootProvider
      search={{ SearchDialog }}
      i18n={i18nWithHandler}
    >
      {children}
    </RootProvider>
  );
}

