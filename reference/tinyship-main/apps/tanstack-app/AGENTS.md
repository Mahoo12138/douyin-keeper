# AGENTS.md

## Overview

TanStack Start application — one of three frontend apps in the TinyShip monorepo, alongside Next.js and Nuxt.js. Built on TanStack Router + TanStack Start (Vite + Nitro server). Shares React components with Next.js via `libs/react-shared`, and shares all business logic via `libs/*` and `config/*`.

## Setup Commands

```bash
# Install dependencies (from monorepo root)
pnpm install

# Development
pnpm dev:tanstack          # Standard Vite dev server on port 7001

# Cloudflare Workers development
pnpm dev:tanstack:cf       # CF_DEPLOY=1 Vite + Cloudflare plugin on port 8788

# Build & start
pnpm build:tanstack        # Vite production build
pnpm start:tanstack        # Node.js production server

# Cloudflare deploy
cd apps/tanstack-app && pnpm run deploy:cf   # Build + wrangler deploy

# Typecheck
pnpm --filter @tinyship/tanstack-app typecheck
```

## Code Style

- TypeScript strict mode, React 19 JSX
- File-system routing via TanStack Router (`src/routes/`)
- `$lang` route param for i18n (e.g., `/$lang/dashboard`)
- Route groups: `(auth)` for auth pages, `(root)` for main pages, `admin` for admin
- Server API routes in `src/routes/api/` using `createAPIFileRoute`
- Server functions via `createServerFn` for type-safe RPC
- Shared UI from `@libs/react-shared/ui/*`
- App-specific components in `src/components/`
- Single `useTranslation` hook in `src/hooks/use-translation.ts`

## Directory Structure

```
apps/tanstack-app/
├── src/
│   ├── routes/                    # TanStack Router file-system routes
│   │   ├── __root.tsx             # Root layout (providers, global header, toaster)
│   │   ├── index.tsx              # / redirect to /$lang
│   │   ├── $lang/
│   │   │   ├── (auth)/            # Auth pages (signin, signup, forgot-password, etc.)
│   │   │   ├── (root)/            # Main pages (home, dashboard, pricing, AI, upload, etc.)
│   │   │   └── admin.tsx          # Admin layout + admin sub-pages
│   │   └── api/                   # Server API routes
│   │       ├── auth/$.ts          # Better Auth catch-all
│   │       ├── chat.ts            # AI chat streaming
│   │       ├── credits/           # Credits balance, status, transactions
│   │       ├── payment/           # Payment initiate, verify, webhook, cancel
│   │       ├── admin/             # Admin API routes
│   │       └── ...
│   ├── components/                # App-specific React components
│   │   ├── global-header.tsx
│   │   ├── login-form.tsx
│   │   ├── signup-form.tsx
│   │   ├── dashboard/             # Dashboard tab components
│   │   └── admin/                 # Admin sidebar, cards
│   ├── hooks/
│   │   └── use-translation.ts     # i18n hook using TanStack Router params
│   ├── router.tsx                 # Router creation
│   └── routeTree.gen.ts           # Auto-generated route tree
├── public/                        # Static assets (favicon, manifest, logo)
├── vite.config.ts                 # Vite config (conditional CF plugin)
├── tsconfig.json                  # TypeScript config with path aliases
├── wrangler.jsonc                 # Cloudflare Workers config
├── Dockerfile                     # Docker build for Node.js deployment
├── .dev.vars.example              # CF local dev vars template
└── package.json
```

## Usage Examples

### Adding a New Page

```tsx
// src/routes/$lang/(root)/my-page.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from '@/hooks/use-translation'

export const Route = createFileRoute('/$lang/(root)/my-page')({
  component: MyPage,
})

function MyPage() {
  const { t } = useTranslation()
  return <div>{t.myPage.title}</div>
}
```

### Adding a Protected Page (auth required)

```tsx
export const Route = createFileRoute('/$lang/(root)/my-protected-page')({
  beforeLoad: async ({ context }) => {
    // Auth check happens in the (root) layout's beforeLoad
  },
  component: MyProtectedPage,
})
```

### Adding an API Route

```tsx
// src/routes/api/my-endpoint.ts
import { createAPIFileRoute } from '@tanstack/react-start/api'
import { json } from '@tanstack/react-start'

export const APIRoute = createAPIFileRoute('/api/my-endpoint')({
  GET: async ({ request }) => {
    return json({ status: 'ok' })
  },
  POST: async ({ request }) => {
    const body = await request.json()
    return json({ received: body })
  },
})
```

### Using Server Functions

```tsx
import { createServerFn } from '@tanstack/react-start'

const getMyData = createServerFn({ method: 'GET' })
  .handler(async () => {
    const data = await db.query.myTable.findMany()
    return data
  })

// In route loader:
export const Route = createFileRoute('/$lang/(root)/my-page')({
  loader: () => getMyData(),
  component: MyPage,
})
```

## Common Tasks

### Feature Parity with Next.js/Nuxt.js

When adding a feature, implement it in all three apps following the checklist in root `AGENTS.md`. Key mappings:

| Concept | Next.js | TanStack Start | Nuxt.js |
|---------|---------|----------------|---------|
| Pages | `app/[lang]/page.tsx` | `src/routes/$lang/(root)/index.tsx` | `pages/[lang]/index.vue` |
| API routes | `app/api/*/route.ts` | `src/routes/api/*.ts` | `server/api/*.ts` |
| Middleware | `middleware.ts` | `beforeLoad` in route config | `server/middleware/` |
| Server functions | N/A (API routes) | `createServerFn` | `server/api/` |
| i18n | `useTranslation()` | `useTranslation()` | `useI18n()` |

### Cloudflare Workers Deployment

See `docs/user-guide/deployment/cloudflare-workers.md` for the full guide. Key points:
- Set `CF_DEPLOY=1` to activate Cloudflare Vite plugin
- Configure Hyperdrive for PostgreSQL access
- Use `wrangler secret put` for sensitive env vars

## Testing Instructions

```bash
# Typecheck
pnpm --filter @tinyship/tanstack-app typecheck

# Build
pnpm --filter @tinyship/tanstack-app build

# Dev server
pnpm dev:tanstack
# Visit http://localhost:7001

# E2E (start app first, then run from repo root)
npx playwright test --config=tests/e2e/playwright.config.ts
```

## Troubleshooting

### Route Not Found (404)

- Verify file is in the correct route group (`(auth)`, `(root)`, or `admin`)
- Run `pnpm dev:tanstack` — TanStack Router auto-generates `routeTree.gen.ts`
- Check that `$lang` param is present in the URL path

### Import Resolution Issues

- Path aliases: `@/*` → `./src/*`, `@libs/*` → `../../libs/*`, `@config` → `../../config.ts`
- Ensure `vite-tsconfig-paths` plugin is active in `vite.config.ts`

### Cloudflare Build Fails

- Ensure `CF_DEPLOY` is only set when intentionally building for Workers
- Check `wrangler.jsonc` for correct Hyperdrive ID
- See `docs/user-guide/deployment/cloudflare-workers.md` troubleshooting section

### Shared Component Errors

- Shared components from `@libs/react-shared` must not import `next/*` modules
- If a component is missing, check that the Radix dependency is in this app's `package.json`

## Architecture Notes

- **TanStack Start**: Full-stack React framework built on Vite + Nitro (same server engine as Nuxt)
- **Two Server Mechanisms**: Server Routes (raw HTTP, for webhooks/auth/uploads) and Server Functions (`createServerFn`, type-safe RPC for data fetching)
- **Shares React Layer**: UI components and hooks via `libs/react-shared` with Next.js
- **Shares Business Logic**: All `libs/*` and `config/*` are shared across all three apps
- **i18n**: `/$lang/` route parameter pattern, translation via `useTranslation()` hook
- **Auth**: Better Auth via server route catch-all, `beforeLoad` guards for protected pages
- **Dual Deployment**: Standard Node.js (Vite build + `.output/server/index.mjs`) or Cloudflare Workers (opt-in via `CF_DEPLOY=1`)
- **No React Server Components**: All pages are client components with server-side data loading via loaders/server functions
