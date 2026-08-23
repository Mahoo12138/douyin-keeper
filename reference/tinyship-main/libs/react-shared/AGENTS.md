# AGENTS.md

## Overview

Shared React component and hooks library consumed by both Next.js (`apps/next-app`) and TanStack Start (`apps/tanstack-app`). This is **plain source code** referenced via the `@libs/react-shared` path alias — no workspace package, no separate build step. Each consuming app's bundler (Webpack for Next.js, Vite for TanStack Start) compiles it directly.

## Setup Commands

```bash
# No installation needed — imported via path alias.
# Both apps must declare React UI deps in their own package.json:
#   @radix-ui/*, lucide-react, framer-motion, class-variance-authority, etc.
# pnpm deduplicates shared deps on disk.
```

## Code Style

- All components are React 19 compatible, written in TypeScript + JSX
- Follow shadcn/ui conventions for UI primitives
- Use `cn()` from `@libs/ui` for class merging
- Components must be **framework-agnostic** — no `next/link`, `next/image`, `next/navigation`, `next/dynamic`
- Router-dependent behavior uses the `SharedAppProvider` context, not direct router imports
- File naming: kebab-case for files, PascalCase for components

## Directory Structure

```
libs/react-shared/
├── index.ts                 # Public exports (SharedAppProvider, useTheme, useIsMobile)
├── ui/                      # shadcn/Radix UI primitives
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   ├── select.tsx
│   ├── table.tsx
│   ├── sidebar.tsx
│   └── ... (~25 components)
├── hooks/                   # Shared React hooks
│   ├── use-mobile.ts
│   ├── use-theme.tsx
│   ├── use-lazy-ref.ts
│   ├── use-as-ref.ts
│   └── use-isomorphic-layout-effect.ts
├── providers/               # Context providers
│   └── app-context.tsx      # SharedAppProvider (translation, locale, router adapter)
└── components/              # Feature components
    ├── ai-elements/         # AI chat UI (Conversation, Message, PromptInput, Response, Loader)
    ├── magicui/             # MagicUI effects (BentoGrid, AnimatedBeam)
    └── theme-script.tsx     # SSR-safe theme initialization script
```

## Usage Examples

### Import UI Components

```tsx
import { Button } from '@libs/react-shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@libs/react-shared/ui/card'
import { Dialog, DialogContent, DialogTrigger } from '@libs/react-shared/ui/dialog'
```

### Import Hooks

```tsx
import { useIsMobile } from '@libs/react-shared/hooks/use-mobile'
import { useTheme } from '@libs/react-shared/hooks/use-theme'
```

### Import AI Elements

```tsx
import { Conversation } from '@libs/react-shared/components/ai-elements/conversation'
import { Message } from '@libs/react-shared/components/ai-elements/message'
import { PromptInput } from '@libs/react-shared/components/ai-elements/prompt-input'
```

### SharedAppProvider Setup

Each app wraps its root layout with `SharedAppProvider`, injecting framework-specific translation and locale:

```tsx
// In Next.js root layout or TanStack __root.tsx
import { SharedAppProvider } from '@libs/react-shared'

<SharedAppProvider translation={t} locale={locale}>
  {children}
</SharedAppProvider>
```

## Common Tasks

### Add a New UI Component

1. Create `libs/react-shared/ui/my-component.tsx`
2. Follow the shadcn/ui pattern: export named component, use `cn()` for styling
3. If the component needs Radix primitives, ensure both apps declare the `@radix-ui/*` dep in their `package.json`
4. Import from consuming apps as `@libs/react-shared/ui/my-component`

### Add a New Hook

1. Create `libs/react-shared/hooks/use-my-hook.ts`
2. Ensure it's framework-agnostic — no Next.js or TanStack Router imports
3. If it needs router/locale context, use `useSharedApp()` from `providers/app-context`

### Move a Component from an App to Shared

1. Remove any `next/*` or `@tanstack/react-router` imports
2. Replace router-specific calls with `SharedAppProvider` context
3. Move file to the appropriate `libs/react-shared/` subdirectory
4. Update imports in both apps
5. Verify both Next.js and TanStack Start builds pass

## Testing Instructions

```bash
# Verify shared components compile in both apps
pnpm --filter @tinyship/next-app typecheck
pnpm --filter @tinyship/tanstack-app typecheck

pnpm --filter @tinyship/next-app build
pnpm --filter @tinyship/tanstack-app build
```

## Troubleshooting

### Module Not Found

- Verify path aliases are configured in `tsconfig.json` of both apps: `"@libs/*": ["../../libs/*"]`
- Ensure the file path is correct (kebab-case)

### Missing Radix Dependency

- Each app must list the Radix package in its own `package.json`. Add it to both apps when introducing a new Radix primitive.

### Component Uses Next.js API

- If you see `next/link`, `next/image`, or `next/navigation` in a shared component, it must be refactored to be framework-agnostic before placement here.

## Architecture Notes

- **No Build Step**: Plain `.tsx` source compiled by each app's bundler
- **Path Alias**: `@libs/react-shared` resolves to `../../libs/react-shared` in both apps
- **Dependency Strategy**: React UI deps (`@radix-ui/*`, `lucide-react`, etc.) are declared in each app's `package.json`, not at root. pnpm deduplicates on disk.
- **Router Abstraction**: `SharedAppProvider` context provides translation, locale, and optional router utilities so components stay framework-agnostic
- **React 19**: All components are compatible with React 19 concurrent features
- **Consumed by**: `apps/next-app` and `apps/tanstack-app` only (not `apps/nuxt-app`, which uses Vue)
