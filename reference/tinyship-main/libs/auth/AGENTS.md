# AGENTS.md

## Overview

Comprehensive authentication and authorization service built on Better Auth. Provides email/password, social (Google, GitHub, WeChat), and phone number authentication with role-based access control, email verification, password reset, and internationalized error handling.

## Setup Commands

```bash
# Core environment variables required (add to .env):
BETTER_AUTH_SECRET="your-secret-key-here-32-characters-minimum"
BETTER_AUTH_URL="http://localhost:7001"

# Social providers (optional)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"
WECHAT_APP_ID="your-wechat-app-id"
NEXT_PUBLIC_WECHAT_APP_ID="your-wechat-app-id"
WECHAT_APP_SECRET="your-wechat-app-secret"

# Captcha protection (optional)
TURNSTILE_SITE_KEY="your-cloudflare-site-key"
TURNSTILE_SECRET_KEY="your-cloudflare-secret-key"

# No direct installation - configured via @config
```

## Code Style

- Better Auth core with Drizzle adapter for PostgreSQL
- Plugin-based architecture (admin, phoneNumber, captcha, wechat, validator)
- **Configuration split**: sensitive data in env vars, functional settings in `@config`
- Framework-agnostic server core with React/Vue clients
- International error handling via `@libs/i18n`
- Rate limiting and security middleware integration

## Usage Examples

### Server Setup (Next.js API Route)
```typescript
// app/api/auth/[...all]/route.ts
import { auth, toNextJsHandler } from "@libs/auth";

export const { GET, POST } = toNextJsHandler(auth.handler);
```

### Server Setup (Nuxt.js API Route)
```typescript
// server/api/auth/[...all].ts
import { auth } from '@libs/auth';
import { toNodeHandler } from 'better-auth/node';

export default toNodeHandler(auth);
```

### Client Usage (React)
```typescript
import { authClientReact } from '@libs/auth/authClient';

// Session management
const session = authClientReact.useSession();
const user = session.data?.user;

// Email/password authentication
const { data, error } = await authClientReact.signIn.email({
  email: 'user@example.com',
  password: 'password123',
  rememberMe: true
});

// Social authentication
await authClientReact.signIn.social({
  provider: 'google' // 'google' | 'github' | 'wechat'
});

// Phone number authentication
await authClientReact.signIn.phoneNumber({
  phoneNumber: '+86 138 0000 0000',
  otp: '123456'
});

// User management
await authClientReact.signUp.email({
  email: 'user@example.com',
  password: 'password123',
  name: 'User Name'
});

await authClientReact.updateUser({
  name: 'New Name',
  image: 'https://example.com/avatar.jpg'
});

// Password reset
await authClientReact.requestPasswordReset({
  email: 'user@example.com',
  redirectTo: '/reset-password'
});

// Session management
const sessions = await authClientReact.listSessions();
await authClientReact.revokeSession({ token: "session-token" });
await authClientReact.revokeOtherSessions();
```

### Client Usage (Vue/Nuxt.js)
```typescript
import { authClientVue } from '@libs/auth/authClient';
import { useAuth } from '@/composables/useAuth'; // Nuxt.js composable

// Better Auth Vue client (direct)
const session = authClientVue.useSession();
const user = computed(() => session.value?.data?.user);

// Nuxt.js composable (recommended)
const { 
  isAuthenticated, 
  user, 
  signOut, 
  isAdmin,
  hasRole,
  requireAuth 
} = useAuth();
```

### Error Handling with Internationalization
```typescript
// Next.js
import { useTranslation } from '@/hooks/use-translation';

const { t } = useTranslation();
const { data, error } = await authClientReact.signIn.email({ email, password });

if (error?.code) {
  const authErrorMessage = t.auth.authErrors[error.code] || t.auth.authErrors.UNKNOWN_ERROR;
  setErrorMessage(authErrorMessage);
}

// Nuxt.js
const { t } = useI18n();
const authErrorMessage = t('auth.authErrors.' + error.code) || t('auth.authErrors.UNKNOWN_ERROR');
```

## Configuration (@config)

The auth system heavily depends on centralized configuration via `@config`. Understanding this configuration is crucial for proper setup.

### Core Auth Configuration (config.ts)
```typescript
// config.ts
export const config = {
  auth: {
    // Email verification requirement
    requireEmailVerification: true, // Set to false to disable email verification
    
    // Social login providers
    socialProviders: {
      google: {
        get clientId() {
          return getEnvForService('GOOGLE_CLIENT_ID', 'Google Auth');
        },
        get clientSecret() {
          return getEnvForService('GOOGLE_CLIENT_SECRET', 'Google Auth');
        }
      },
      github: {
        get clientId() {
          return getEnvForService('GITHUB_CLIENT_ID', 'GitHub Auth');
        },
        get clientSecret() {
          return getEnvForService('GITHUB_CLIENT_SECRET', 'GitHub Auth');
        }
      },
      wechat: {
        get appId() {
          return getEnvForService('NEXT_PUBLIC_WECHAT_APP_ID', 'WeChat Auth');
        },
        get appSecret() {
          return getEnvForService('WECHAT_APP_SECRET', 'WeChat Auth');
        }
      }
    }
  },
  
  // Captcha configuration (affects auth endpoints)
  captcha: {
    enabled: false, // Set to true to enable Cloudflare Turnstile
    defaultProvider: 'cloudflare-turnstile',
    cloudflare: {
      get secretKey() {
        if (process.env.NODE_ENV === 'development') {
          return '1x0000000000000000000000000000000AA'; // Test key
        }
        return getEnvForService('TURNSTILE_SECRET_KEY', 'Cloudflare Turnstile');
      },
      get siteKey() {
        if (process.env.NODE_ENV === 'development') {
          return '1x00000000000000000000AA'; // Test key
        }
        return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
               getEnvForService('TURNSTILE_SITE_KEY', 'Cloudflare Turnstile');
      }
    }
  }
};
```

### Configuration Usage in Auth System
The auth library uses config values for:

1. **Email Verification**: `config.auth.requireEmailVerification`
   - `true`: Sends verification email on signup, blocks unverified users
   - `false`: Allows immediate access without email verification

2. **Social Providers**: `config.auth.socialProviders.*`
   - Dynamic credential loading from environment variables
   - Runtime validation and error handling for missing credentials

3. **Captcha Protection**: `config.captcha.enabled`
   - When enabled, adds captcha to: signup, signin, password reset, phone OTP
   - Supports Cloudflare Turnstile with test keys for development

4. **Plugin Configuration**: Conditional plugin loading
   - Captcha plugin only loads if `config.captcha.enabled === true`
   - WeChat plugin uses `config.auth.socialProviders.wechat` credentials

### Framework Integration
- **Next.js**: Direct config import in middleware and API routes
- **Nuxt.js**: Config exposed via `runtimeConfig` for client-side access
- **Environment Variables**: Auto-loaded via `getEnvForService()` with fallbacks

## Common Tasks

### Authentication Methods
- **Email/Password**: Full registration, login, verification, password reset
- **Social Login**: Google, GitHub, WeChat scan code login
- **Phone Number**: SMS OTP verification with auto account creation
- **Account Linking**: Connect multiple providers to same account

### Role Management
- **Admin Role**: Full system access via `@libs/permissions`
- **Normal Users**: Standard application access
- **Role Checking**: `hasRole('admin')`, `isAdmin` computed properties

### Email Integration
- **Verification**: Auto-send on signup (configurable)
- **Password Reset**: Secure token-based reset flow
- **Internationalization**: Locale detection from referer headers
- **Templates**: MJML-based responsive emails via `@libs/email`

### Development Features
- **Debug Mode**: Verification URLs and OTP codes in API responses
- **Console Logging**: All auth events logged for debugging
- **Rate Limiting**: Configurable limits on sensitive endpoints

## Testing Instructions

```bash
# Test authentication flows in all three apps:
# Next.js: http://localhost:3000/signin
# Nuxt.js: http://localhost:7001/signin

# Development mode features:
# 1. Check console for verification URLs and OTP codes
# 2. API responses include 'dev' field with debug info
# 3. Rate limiting may be disabled for testing

# Test social providers with valid OAuth credentials
# Test phone authentication with SMS provider configured
```

## Troubleshooting

### Environment Configuration
- Verify `BETTER_AUTH_SECRET` is at least 32 characters
- Check `BETTER_AUTH_URL` matches your application URL
- Ensure social provider credentials are valid and active

### Configuration Issues (@config)
- **Email Verification**: Check `config.auth.requireEmailVerification` setting
  - If `true`, ensure `@libs/email` is properly configured
  - If `false`, users can access without email verification
- **Social Providers**: Verify `config.auth.socialProviders.*` credentials
  - Missing credentials will cause runtime errors during social login
  - Use `getEnvForService()` for proper error messages
- **Captcha Problems**: Check `config.captcha.enabled` and keys
  - Development uses test keys automatically
  - Production requires valid Turnstile site/secret keys

### Database Issues
- Confirm PostgreSQL connection via `@libs/database`
- Verify auth schema tables exist (user, account, session, verification)
- Run database migrations if schema is outdated

### Email/SMS Problems
- Check `@libs/email` configuration for verification emails
- Verify `@libs/sms` setup for phone number authentication
- Ensure rate limiting doesn't block development testing

### Authentication Errors
- Use internationalized error messages for better UX
- Check browser network tab for detailed error responses
- Verify session cookies are being set correctly

### Permission Issues
- Confirm `@libs/permissions` configuration matches user roles
- Check middleware setup in Next.js/Nuxt.js applications
- Verify admin role assignment in database

## Architecture Notes

- **Better Auth Foundation**: Leverages mature authentication library with extensive plugin ecosystem
- **Centralized Configuration**: All auth behavior controlled via `@config` - email verification, social providers, captcha, etc.
- **Multi-Framework Support**: Unified server core with React and Vue client adapters
- **Database Integration**: Drizzle ORM adapter with PostgreSQL for type-safe data operations
- **Plugin Architecture**: Modular design with admin, phone, captcha, WeChat, and validation plugins
- **Configuration-Driven Plugins**: Conditional plugin loading based on `@config` settings (captcha, social providers)
- **Security First**: Rate limiting, email verification, password strength validation, CAPTCHA support
- **Internationalization**: Seamless integration with `@libs/i18n` for error messages and email templates
- **Development Experience**: Enhanced debugging with URL/OTP exposure in development mode, test keys for captcha
- **Middleware Integration**: Framework-specific middleware for route protection and permission checking
- **Session Management**: Robust session handling with device tracking and multi-session support
- **Account Linking**: Users can connect multiple authentication methods to single account
- **Role-Based Access**: Admin/user roles with extensible permission system via `@libs/permissions`
- **Environment Separation**: Clean separation between sensitive (env vars) and functional (config) settings
