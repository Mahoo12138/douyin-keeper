/**
 * Shared React component library for Next.js and TanStack Start apps.
 *
 * This is NOT a workspace package -- it's plain source code referenced via
 * the @libs/react-shared path alias, compiled by each consuming app's bundler.
 *
 * React UI dependencies (@radix-ui/*, lucide-react, etc.) are declared in
 * each app's package.json; pnpm deduplicates them on disk.
 *
 * Exports:
 *   - ui/*           shadcn/Radix UI primitives (Button, Card, Dialog, etc.)
 *   - hooks/*        Shared React hooks (useIsMobile, useTheme, etc.)
 *   - providers/*    SharedAppProvider (translation + locale context)
 *   - components/*   Feature components (AI chat elements, MagicUI)
 */

export { SharedAppProvider, useSharedApp } from './providers/app-context'
export { ThemeProvider, useTheme } from './hooks/use-theme'
export { useIsMobile } from './hooks/use-mobile'
