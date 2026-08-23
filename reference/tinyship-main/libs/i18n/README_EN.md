# Internationalization (i18n) Library

[中文文档](./README.md) | **English**

## Overview

This is the centralized internationalization library for the entire monorepo project, providing translation data and utilities shared across Next.js, Nuxt.js, and TanStack Start applications.

## 🏗️ Architecture

```
libs/i18n/
├── locales/
│   ├── types.ts       # TypeScript type definitions (auto-inferred from en.ts)
│   ├── en.ts          # English translations (source of truth for types)
│   ├── zh-CN.ts       # Chinese (Simplified) translations
│   └── index.ts       # Exports all locale modules
├── index.ts           # Main library entry point
├── README.md          # Chinese documentation
└── README_EN.md       # English documentation
```

## 🌍 Supported Languages

- **English (en)** - Primary language and type source
- **简体中文 (zh-CN)** - Simplified Chinese

## ⚙️ Unified Configuration

All internationalization configurations are managed through `@config` to ensure all applications use the same settings:

```typescript
// config.ts
export const config = {
  app: {
    i18n: {
      defaultLocale: 'zh-CN' as const,      // Default language
      locales: ['en', 'zh-CN'] as const,    // Supported language list
      cookieKey: 'NEXT_LOCALE',             // Cookie storage key
      autoDetect: false                     // Auto-detect browser language
    }
  }
};
```

**Features:**
- ✅ **Unified Configuration Source**: Next.js, Nuxt.js, and TanStack Start share configuration
- ✅ **Type Safety**: TypeScript type inference and validation
- ✅ **Persistence**: Cookie automatically saves user language preference
- ✅ **Flexible Control**: Optional browser language auto-detection

## 🎯 Framework Integration

This library supports two different frameworks with different implementation approaches:

### 🟢 Nuxt.js Applications (@nuxtjs/i18n)

Uses the official `@nuxtjs/i18n` module for automatic route generation and built-in features.

**Configuration:**
```typescript
// nuxt.config.ts
import { config as appConfig } from '@config'

export default defineNuxtConfig({
  modules: ['@nuxtjs/i18n'],
  
  // Internationalization configuration (dynamically retrieved from @config)
  i18n: {
    locales: appConfig.app.i18n.locales.map(code => ({
      code,
      name: code === 'en' ? 'English' : '中文',
    })),
    defaultLocale: appConfig.app.i18n.defaultLocale,
    strategy: 'prefix',
    detectBrowserLanguage: appConfig.app.i18n.autoDetect ? {
      useCookie: true,
      cookieKey: appConfig.app.i18n.cookieKey,
      redirectOn: 'root',
      alwaysRedirect: true,
      fallbackLocale: appConfig.app.i18n.defaultLocale,
    } : false, // Disable browser detection if autoDetect is false
  }
})
```

```typescript
// i18n/i18n.config.ts
import { translations } from '@libs/i18n'

export default defineI18nConfig(() => ({
  messages: translations,
  legacy: false,
  fallbackLocale: 'zh-CN'
}))
```

**Server-side (pages/components):**
```vue
<template>
  <div>
    <!-- Basic translation -->
    <h1>{{ $t('header.navigation.ai') }}</h1>
    
    <!-- Route link -->
    <NuxtLink :to="localePath('/dashboard')">
      {{ $t('header.userMenu.personalSettings') }}
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
// Server-side automatically gets current language and translations
const localePath = useLocalePath()
</script>
```

**Client-side components:**
```vue
<template>
  <div>
    <!-- Basic translation -->
    <h1>{{ t('header.navigation.ai') }}</h1>
    
    <!-- Route link -->
    <NuxtLink :to="localePath('/dashboard')">
      {{ t('header.userMenu.personalSettings') }}
    </NuxtLink>
    
    <!-- Language switching -->
    <button @click="changeLanguage('en')">English</button>
    <button @click="changeLanguage('zh-CN')">中文</button>
  </div>
</template>

<script setup lang="ts">
// Get internationalization functionality
const { t, locale, locales } = useI18n()
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()

// Language switching
const changeLanguage = (targetLocale: string) => {
  const path = switchLocalePath(targetLocale as any)
  if (path) navigateTo(path)
}
</script>
```

**Server-side API routes:**
```typescript
// server/api/example.ts
export default defineEventHandler(async (event) => {
  // Get language information from request headers (Accept-Language)
  const locale = getHeader(event, 'accept-language')?.split(',')[0] || 'zh-CN'

  // Get Nuxt i18n instance
  const i18n = useNuxtApp().$i18n

  // Set current language
  i18n.locale.value = locale.includes('zh') ? 'zh-CN' : 'en'

  // Use translation functionality
  return {
    message: i18n.t('header.navigation.ai'),
    currentLocale: i18n.locale.value
  }
})
```

### 🔵 Next.js Applications (Manual Implementation)

Uses a custom implementation with file-system routing and middleware, configuration dynamically retrieved from `@config`.

**Configuration:**
```typescript
// app/i18n-config.ts
import { translations, locales } from '@libs/i18n';
import { config } from '@config';

export const i18n = {
  defaultLocale: config.app.i18n.defaultLocale,
  locales: locales as readonly string[],
} as const;
```

**Server Components:**
```typescript
import { translations } from "@libs/i18n";
import { config } from "@config";

export default async function Page({ params }: { params: { lang: string } }) {
  const { lang } = await params;
  const locale = lang || config.app.i18n.defaultLocale;
  const t = translations[locale];
  
  return (
    <div>
      {/* Basic translation */}
      <h1>{t.header.navigation.ai}</h1>
      
      {/* Route link */}
      <Link href={`/${locale}/dashboard`}>
        {t.header.userMenu.personalSettings}
      </Link>
    </div>
  );
}
```

**Client Components:**
```typescript
'use client';
import { useTranslation } from "@/hooks/use-translation";

export function Component() {
  const { t, locale, locales, changeLocale } = useTranslation();

  return (
    <div>
      {/* Basic translation */}
      <h1>{t.header.navigation.ai}</h1>
      
      {/* Route link */}
      <Link href={`/${locale}/dashboard`}>
        {t.header.userMenu.personalSettings}
      </Link>
      
      {/* Language switching */}
      <button onClick={() => changeLocale('en')}>English</button>
      <button onClick={() => changeLocale('zh-CN')}>中文</button>
    </div>
  );
}
```

## 📚 API Reference

### Core Exports

```typescript
import { 
  translations,      // Complete translation object
  defaultLocale,     // Default language ('en')
  locales,          // Supported languages array
  isValidLocale,    // Locale validation function
  getTranslation    // Type-safe translation getter
} from '@libs/i18n'
```

### Type Definitions

```typescript
import type { 
  SupportedLocale,  // 'en' | 'zh-CN'
  Translations      // Complete translation structure type
} from '@libs/i18n'
```

### Translation Structure

The translation object follows a nested structure:

```typescript
{
  common: {
    welcome: string
    buttons: {
      submit: string
      cancel: string
      save: string
    }
    // ...
  },
  navigation: {
    home: string
    dashboard: string
    // ...
  },
  auth: {
    signin: {
      title: string
      email: string
      // ...
    }
    // ...
  }
  // ... more namespaces
}
```

## 🔧 Adding New Translations

### Step 1: Add to English translations

Edit `libs/i18n/locales/en.ts`:

```typescript
export const en = {
  // ... existing translations
  newFeature: {
    title: "New Feature",
    description: "This is a new feature",
    actions: {
      enable: "Enable",
      disable: "Disable"
    }
  }
} as const;
```

### Step 2: Add corresponding Chinese translations

Edit `libs/i18n/locales/zh-CN.ts`:

```typescript
export const zhCN = {
  // ... existing translations
  newFeature: {
    title: "新功能",
    description: "这是一个新功能",
    actions: {
      enable: "启用",
      disable: "禁用"
    }
  }
} as const;
```

### Step 3: Use in applications

The new translations will be automatically available in both frameworks:

- **Nuxt.js**: `$t('newFeature.title')` or `t('newFeature.title')`
- **Next.js Server**: `t.newFeature.title`
- **Next.js Client**: `t.newFeature.title`

## 🎨 Translation Patterns

### Form Fields
```typescript
form: {
  labels: {
    name: "Name",
    email: "Email"
  },
  placeholders: {
    name: "Enter your name",
    email: "Enter your email"
  },
  errors: {
    nameRequired: "Name is required",
    emailInvalid: "Please enter a valid email"
  }
}
```

### Action States
```typescript
actions: {
  submit: "Submit",
  submitting: "Submitting...",
  save: "Save",
  saving: "Saving..."
}
```

### Status Messages
```typescript
status: {
  success: "Operation completed successfully",
  error: "An error occurred",
  loading: "Loading..."
}
```

## 🚀 Performance Considerations

### Bundle Size Optimization

**Next.js:**
- Server Components have zero JavaScript overhead for translations
- Client Components include only the active locale
- Tree-shaking removes unused translation keys

**Nuxt.js:**
- @nuxtjs/i18n provides automatic code splitting
- Lazy loading support for large translation files
- Built-in optimization for SSR/SSG

### Memory Usage

- Translation objects are singletons (shared across components)
- TypeScript provides compile-time type checking
- No runtime validation overhead in production

## 🔍 Type Safety

This library provides full TypeScript support:

```typescript
// Auto-completion and type checking
const message: string = t.common.welcome
const nested: string = t.auth.signin.title

// Compile-time error for invalid keys
const invalid = t.nonexistent.key // ❌ TypeScript error
```

Types are automatically inferred from the English translation file (`en.ts`), ensuring consistency across all languages.

## 🌐 URL Structure

Both frameworks support consistent URL patterns:

```
/                    → Default locale homepage
/dashboard           → Default locale dashboard
/zh-CN/              → Chinese homepage  
/zh-CN/dashboard     → Chinese dashboard
/en/                 → English homepage (Nuxt.js with prefix strategy)
/en/dashboard        → English dashboard (Nuxt.js with prefix strategy)
```

## 🛠️ Development Tools

### Validation

```typescript
import { isValidLocale } from '@libs/i18n'

// Runtime validation
if (isValidLocale(userLocale)) {
  // Safe to use
}
```

### Type-safe getter

```typescript
import { getTranslation } from '@libs/i18n'

// Get translations with full type safety
const t = getTranslation('en')
const message = t.common.welcome // ✅ Fully typed
```

## 📖 Best Practices

1. **Use English as the source of truth** for translation structure
2. **Keep nesting to 4 levels maximum** for maintainability
3. **Group related translations** under meaningful namespaces
4. **Follow consistent patterns** for forms, actions, and status messages
5. **Provide loading states** for async operations
6. **Include error messages** for all validation scenarios

## 🔧 Troubleshooting

### Missing Translation Keys

If you see runtime warnings about missing keys:
1. Check if the key exists in both `en.ts` and `zh-CN.ts`
2. Ensure the key path is correct (case-sensitive)
3. Restart the development server after adding new keys

### Type Errors

If TypeScript shows errors for valid translation keys:
1. Ensure you're importing from `@libs/i18n` correctly
2. Check that both language files have the same structure
3. The English file (`en.ts`) drives the type definitions

### Framework-Specific Issues

- **Next.js**: Check the `useTranslation` hook implementation
- **Nuxt.js**: Verify `@nuxtjs/i18n` module configuration
- **Both**: Ensure `@libs/i18n` is properly linked in the monorepo

## 📝 Contributing

When adding new translations:

1. Always add to English first (`en.ts`)
2. Ensure Chinese translations are accurate and contextually appropriate
3. Follow existing naming conventions and structure
4. Test in all three applications (Next.js, Nuxt.js, and TanStack Start)
5. Update documentation if adding new patterns or namespaces

## 📄 License

Part of the TinyShip monorepo project. 