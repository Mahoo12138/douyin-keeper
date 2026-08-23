# Configuration System Documentation

## Overview

The TinyShip project uses a unified configuration system to manage all environment variables and application configurations. The configuration system is based on a single `config.ts` file and supports Next.js, Nuxt.js, and TanStack Start frameworks.

## Architecture Design

### Core Files
- **`config.ts`**: Unified configuration file containing all application configurations (pure configuration object without environment variable loading logic)
- **`.env`**: Environment variables file (project root directory)
- **`next.config.ts`**: Next.js build-time environment variable loading
- **`nuxt.config.ts`**: Nuxt.js build-time environment variable loading

### How It Works

**New Architecture (Recommended)**:
```
.env file → Framework config file loading → process.env → config.ts → Application code
```

1. **Environment Variable Loading**: Load environment variables using dotenv (Next.js) or Vite loadEnv (Nuxt.js) in framework configuration files
2. **Configuration Access**: `config.ts` reads environment variables through `process.env`
3. **Configuration Validation**: Provides validation and default values for required/optional services
4. **Type Safety**: Complete TypeScript type support

**Advantages**:
- ✅ **Avoid executing Node.js code on client**: `config.ts` contains no Node.js-specific APIs
- ✅ **Framework best practices**: Utilizes recommended environment variable loading methods for each framework
- ✅ **Better Tree Shaking**: Cleaner configuration files enable better build optimization

## Framework Integration

### Next.js Integration

**Environment Variable Loading (next.config.ts)**:
```typescript
// next.config.ts
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

// Get current file directory
const __dirname = dirname(fileURLToPath(import.meta.url));
// Load .env file from project root
config({ path: join(__dirname, '../../.env') });

// Next.js configuration...
```

**Usage in Components**:
```typescript
// Server Components
import { config } from '@config';
const isEnabled = config.captcha.enabled;

// Client Components (static config or NEXT_PUBLIC_ variables only)
import { config } from '@config';
const plans = config.payment.plans; // Static config, safe
```

### Nuxt.js Integration

**Environment Variable Loading (nuxt.config.ts)**:
```typescript
// nuxt.config.ts
import { resolve } from 'path';
import { loadEnv } from 'vite';

// Load environment variables using Vite's loadEnv
const env = loadEnv(process.env.NODE_ENV || 'development', resolve(__dirname, '../..'), '');
// Merge environment variables into process.env
Object.assign(process.env, env);

import { config as appConfig } from '../../config';

export default defineNuxtConfig({
  runtimeConfig: {
    // Server-side environment variables
    databaseUrl: appConfig.database.url,
    
    public: {
      // Client-accessible configuration
      captchaEnabled: String(appConfig.captcha.enabled),
      turnstileSiteKey: appConfig.captcha.cloudflare.siteKey,
      wechatAppId: process.env.WECHAT_APP_ID || 'your-wechat-app-id',
      wechatRedirectUri: process.env.WECHAT_REDIRECT_URI || `${appConfig.app.baseUrl}/api/auth/oauth2/callback/wechat`
    }
  }
});
```

**Usage in Components**:
```vue
<script setup>
// Server-side: Use config directly
import { config } from '@config';
const dbUrl = config.database.url; // Server-side only

// Client-side: Use runtime config
const runtimeConfig = useRuntimeConfig();
const siteKey = runtimeConfig.public.turnstileSiteKey;
</script>
```

## Environment Variable Loading Comparison

| Framework | Loading Method | Advantages | Location |
|-----------|----------------|------------|----------|
| **Next.js** | `dotenv.config()` | Simple and direct, compatible with Next.js ecosystem | `next.config.ts` |
| **Nuxt.js** | `loadEnv()` from Vite | Native support, better environment handling, supports `.env.local` etc. | `nuxt.config.ts` |

### Vite loadEnv Advantages (Nuxt.js)

✅ **Automatic Environment Detection**: Automatically selects corresponding `.env` files based on `NODE_ENV`  
✅ **File Priority**: Automatically handles `.env.local` > `.env.development` > `.env` priority  
✅ **Native Support**: Perfect integration with Nuxt 3's Vite foundation  
✅ **Better Error Handling**: Built-in robust error handling mechanisms

## Configuration Categories

### 1. Application Configuration (`config.app`)
- **baseUrl**: Application base URL
- **payment**: Payment-related URLs (success, cancel, webhooks)

### 2. Payment Configuration (`config.payment`)
- **providers**: Payment provider configurations (WeChat, Stripe, Creem)
- **plans**: Subscription plan configurations

### 3. Authentication Configuration (`config.auth`)
- **socialProviders**: Social login configurations (Google, GitHub, WeChat)

### 4. Communication Services (`config.sms`, `config.email`)
- **SMS**: Aliyun, Twilio SMS services
- **Email**: Resend, SendGrid, SMTP email services

### 5. Captcha Configuration (`config.captcha`)
- **enabled**: Whether to enable captcha
- **cloudflare**: Turnstile configuration

### 6. Database Configuration (`config.database`)
- **url**: Database connection string

## Environment Variable Management

### Required Variables
```bash
# Basic application configuration
APP_BASE_URL=http://localhost:7001
DATABASE_URL=postgresql://user:pass@localhost:5432/db
BETTER_AUTH_SECRET=your-secret-key
```

### Optional Variables
```bash
# Payment services
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLIC_KEY=pk_test_...
CREEM_API_KEY=your-creem-key

# Social login
GOOGLE_CLIENT_ID=your-google-id
GITHUB_CLIENT_ID=your-github-id
WECHAT_APP_ID=your-wechat-app-id
WECHAT_REDIRECT_URI=http://localhost:7001/api/auth/oauth2/callback/wechat

# Captcha
TURNSTILE_SITE_KEY=your-site-key
TURNSTILE_SECRET_KEY=your-secret-key
```

## Configuration Validation

### Service Categories
- **Required Services**: Core application functionality, throws error if missing
- **Optional Services**: Feature enhancements, shows warning if missing

### Development Environment Support
```typescript
// Provide default values in development environment
function requireEnvForService(key: string, service: string, devDefault?: string)

// Example
get baseUrl() {
  return requireEnvForService('APP_BASE_URL', 'Application', 'http://localhost:7001');
}
```

## Usage Guide

### 1. Server-side Usage
```typescript
import { config } from '@config';

// In API routes
export async function POST() {
  const dbUrl = config.database.url;
  const stripeKey = config.payment.providers.stripe.secretKey;
}
```

### 2. Client-side Usage

#### Next.js
```typescript
import { config } from '@config';

// Use only static config or NEXT_PUBLIC_ variables
const plans = config.payment.plans; // Static config, safe
const isEnabled = config.captcha.enabled; // Static config, safe
```

#### Nuxt.js
```typescript
// Use runtime config
const runtimeConfig = useRuntimeConfig();
const siteKey = runtimeConfig.public.turnstileSiteKey;
const apiBaseUrl = runtimeConfig.public.apiBaseUrl;
```

### 3. Type Safety
```typescript
import type { Plan } from '@config';

// Complete type support
const plan: Plan = config.payment.plans.monthly;
```

## Best Practices

### 1. Environment Variable Naming
- **Server-side**: Use variable names directly (`DATABASE_URL`)
- **Next.js Client**: Use `NEXT_PUBLIC_` prefix
- **Nuxt.js Client**: Inject through `runtimeConfig.public`

### 2. Configuration Access
- **Server-side**: Import `config` directly
- **Next.js Client**: Prefer static configuration, avoid depending on environment variables
- **Nuxt.js Client**: Use `useRuntimeConfig()` to access configuration

### 3. Environment Variable Loading
- **Next.js**: Use dotenv in `next.config.ts`
- **Nuxt.js**: Use Vite's loadEnv in `nuxt.config.ts`
- **Avoid**: Loading environment variables directly in `config.ts`

### 4. Development Environment
- Create `.env` file to override default configuration
- Use development default values for quick startup
- Nuxt.js supports environment-specific files like `.env.development`

### 5. Production Environment
- Must set all required environment variables
- Validate configuration completeness

## Troubleshooting

### 1. "Missing required environment variable" Error
- Check if `.env` file exists in project root directory
- Confirm environment variable names are correct
- Check if default values exist in development environment
- Confirm framework config files correctly load environment variables

### 2. Client Configuration Not Working
- **Next.js**: Confirm using `NEXT_PUBLIC_` prefix or static configuration
- **Nuxt.js**: Check `runtimeConfig.public` configuration

### 3. "(0, {imported module}) is not a function" Error
- This usually indicates client-side attempting to execute Node.js code
- Confirm `config.ts` contains no Node.js-specific APIs
- Confirm environment variable loading occurs in framework config files

### 4. Configuration Type Errors
- Confirm import paths are correct
- Check TypeScript type definitions

## Summary

The new configuration system has the following advantages:
- ✅ **Unified Management**: All configurations centralized in one clean file
- ✅ **Type Safety**: Complete TypeScript support
- ✅ **Framework Compatibility**: Supports Next.js, Nuxt.js, and TanStack Start best practices
- ✅ **Developer Friendly**: Provides default values and validation
- ✅ **Production Ready**: Strict environment variable validation
- ✅ **Client Safety**: Avoids executing Node.js code in browsers
- ✅ **Better Build Optimization**: More effective tree shaking and code splitting

This design provides sufficient flexibility, security, and performance optimization while maintaining simplicity. 