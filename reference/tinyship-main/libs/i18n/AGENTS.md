# AGENTS.md

## Overview

Centralized internationalization library for the monorepo. Provides shared translations for Next.js, Nuxt.js, and TanStack Start applications with type-safe, framework-specific implementations and unified configuration via `@config`.

## Setup Commands

```bash
# No installation needed - pure TypeScript library

# Import in applications
import { translations } from '@libs/i18n'

# Configuration managed via @config
# Default locale: 'zh-CN'
# Supported locales: ['en', 'zh-CN']
```

## Code Style

- English (`en.ts`) as type source of truth for structure
- TypeScript `as const` for type inference
- Nested structure max 4 levels deep
- Consistent naming: `camelCase` for keys
- Framework-agnostic core with framework adapters
- Configuration unified through `@config`

## Usage Examples

### Next.js Server Components

```typescript
import { translations } from "@libs/i18n";
import { config } from "@config";

export default async function Page({ params }: { params: { lang: string } }) {
  const { lang } = await params;
  const locale = lang || config.app.i18n.defaultLocale; // 'zh-CN'
  const t = translations[locale];
  
  return <h1>{t.header.navigation.ai}</h1>;
}
```

### Next.js Client Components

```typescript
'use client';
import { useTranslation } from "@/hooks/use-translation";

export function Component() {
  const { t, locale, changeLocale } = useTranslation();
  return (
    <div>
      <h1>{t.header.navigation.ai}</h1>
      <button onClick={() => changeLocale('en')}>English</button>
      <button onClick={() => changeLocale('zh-CN')}>中文</button>
    </div>
  );
}
```

### Nuxt.js Components

```vue
<template>
  <div>
    <h1>{{ t('header.navigation.ai') }}</h1>
    <NuxtLink :to="localePath('/dashboard')">
      {{ t('header.userMenu.personalSettings') }}
    </NuxtLink>
    <button @click="changeLanguage('en')">English</button>
  </div>
</template>

<script setup>
const { t } = useI18n()
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()

const changeLanguage = (targetLocale) => {
  const path = switchLocalePath(targetLocale)
  if (path) navigateTo(path)
}
</script>
```

## Common Tasks

### Add New Translation

1. **Add to English first** (`libs/i18n/locales/en.ts`):
```typescript
export const en = {
  newFeature: {
    title: "New Feature",
    action: "Enable"
  }
} as const;
```

2. **Add Chinese translation** (`libs/i18n/locales/zh-CN.ts`):
```typescript
export const zhCN = {
  newFeature: {
    title: "新功能", 
    action: "启用"
  }
} as const;
```

### Framework Configuration

**Next.js** (`app/i18n-config.ts`):
```typescript
import { locales } from '@libs/i18n';
import { config } from '@config';

export const i18n = {
  defaultLocale: config.app.i18n.defaultLocale, // 'zh-CN'
  locales: locales as readonly string[], // ['en', 'zh-CN']
};
```

**Nuxt.js** (`nuxt.config.ts`):
```typescript
import { config as appConfig } from '@config'

export default defineNuxtConfig({
  modules: ['@nuxtjs/i18n'],
  i18n: {
    locales: appConfig.app.i18n.locales.map(code => ({
      code,
      name: code === 'en' ? 'English' : '中文',
    })),
    defaultLocale: appConfig.app.i18n.defaultLocale,
    strategy: 'prefix',
  }
})
```

**Nuxt.js** (`i18n/i18n.config.ts`):
```typescript
import { translations } from '@libs/i18n'

export default defineI18nConfig(() => ({
  messages: translations,
  legacy: false,
  fallbackLocale: 'zh-CN'
}))
```

## Testing Instructions

```bash
# Test type safety
# 1. Add invalid translation key
# 2. Verify TypeScript error
# 3. Verify auto-completion works

# Test runtime
# 1. Switch languages in all three apps
# 2. Verify translations display correctly
# 3. Check URL patterns match expected format
```

## Troubleshooting

### Missing Translation Keys
- Ensure key exists in both `en.ts` and `zh-CN.ts`
- Check key path case sensitivity
- Restart dev server after adding new keys

### Type Errors
- English file (`en.ts`) drives type definitions
- Verify both language files have identical structure
- Check import path: `@libs/i18n`

### Framework Issues
- **Next.js**: Verify `useTranslation` hook implementation
- **Nuxt.js**: Check `@nuxtjs/i18n` module configuration
- **Both**: Confirm monorepo path aliases work

## Architecture Notes

- **Type Safety**: Auto-inferred types from English translations (`en.ts`)
- **Framework Agnostic**: Core library works with any framework
- **Unified Config**: `@config` ensures consistent settings across apps (default: zh-CN)
- **Performance**: Tree-shaking removes unused translations, SSR optimization
- **URL Structure**: Consistent routing patterns (`/zh-CN/page`, `/en/page`)
- **Fallback**: Graceful degradation to default locale (zh-CN)
- **Cookie Persistence**: Language preference stored in `NEXT_LOCALE` cookie
