# TinyShip Authentication Service

[中文文档](./README.md) | **English**

This service uses [Better Auth](https://www.better-auth.com/) to provide comprehensive authentication and authorization functionality. It supports multiple authentication methods, including email/password, social login, and phone number verification.

## Features

- Multiple Authentication Methods
  - Email/Password Login
  - Social Account Login (Google, GitHub, WeChat)
  - Phone Number Verification Login
- Account Management
  - Email Verification
  - Password Reset
  - Account Linking (multiple login methods can be linked to a single account)
- Access Control
  - Admin Roles
  - Role-Based Access Control
- Internationalization Support
  - Supports English and Chinese email templates
  - Sends emails based on user language preferences

## Configuration

Configuration is divided into two parts:
- Sensitive information (like OAuth keys) configured through environment variables
- Non-sensitive information (like feature toggles, expiry times) configured directly in `config.ts`

### Environment Variables

Copy `.env.example` file to `.env` and fill in the sensitive information:

```env
# Authentication Configuration
BETTER_AUTH_SECRET="your-secret-key-here-32-characters-minimum"
BETTER_AUTH_URL="http://localhost:7001"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# GitHub OAuth
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

# WeChat OAuth
WECHAT_APP_ID="your-wechat-app-id"
NEXT_PUBLIC_WECHAT_APP_ID="your-wechat-app-id"  # Required for Next.js client-side
WECHAT_APP_SECRET="your-wechat-app-secret"
```

### Configuration File

Authentication service configuration structure (in `config.ts`):

```typescript
export const config = {
  auth: {
    // Email verification requirement
    requireEmailVerification: true,

    // Social login provider configuration
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
  }
};
```

## Usage

### Server-side

#### Next.js API Routes

```typescript
// app/api/auth/[...all]/route.ts
import { auth, toNextJsHandler } from '@libs/auth';

export const { GET, POST } = toNextJsHandler(auth);
```

#### Nuxt.js API Routes

```typescript
// server/api/auth/[...all].ts
import { auth } from '@libs/auth';
import { toNodeHandler } from 'better-auth/node';

export default toNodeHandler(auth);
```

### Client-side (React)

```typescript
import { authClientReact } from '@libs/auth/authClient';

// Get session state
const session = authClientReact.useSession();
const user = session.data?.user;

// Email/password login
const { data, error } = await authClientReact.signIn.email({
  email: 'user@example.com',
  password: 'password123',
  rememberMe: true // Optional: remember me functionality
});

// Social login
await authClientReact.signIn.social({
  provider: 'google', // 'google' | 'github' | 'wechat'
});

// Phone number login
await authClientReact.signIn.phoneNumber({
  phoneNumber: '+86 138 0000 0000',
  otp: '123456'
});

// Sign out
await authClientReact.signOut();

// User registration
const { data, error } = await authClientReact.signUp.email({
  email: 'user@example.com',
  password: 'password123',
  name: 'User Name'
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

// User information management
await authClientReact.updateUser({
  name: 'New Name',
  image: 'https://example.com/avatar.jpg'
});

// Get linked accounts
const accounts = await authClientReact.listAccounts();

// Delete user account
await authClientReact.deleteUser();
```

### Client-side (Vue)

```typescript
import { authClientVue } from '@libs/auth/authClient';

// Get session state
const session = authClientVue.useSession();
const user = computed(() => session.value?.data?.user);

// Email/password login
const { data, error } = await authClientVue.signIn.email({
  email: 'user@example.com',
  password: 'password123',
  rememberMe: true
});

// Social login
await authClientVue.signIn.social({
  provider: 'google', // 'google' | 'github' | 'wechat'
});

// Phone number login
await authClientVue.signIn.phoneNumber({
  phoneNumber: '+86 138 0000 0000',
  otp: '123456'
});

// Sign out
await authClientVue.signOut();

// User registration
const { data, error } = await authClientVue.signUp.email({
  email: 'user@example.com',
  password: 'password123',
  name: 'User Name'
});

// Or use Nuxt.js composable (recommended)
import { useAuth } from '@/composables/useAuth';

const { 
  isAuthenticated, 
  user, 
  signOut, 
  isAdmin,
  hasRole,
  requireAuth 
} = useAuth();
```

## Authentication Error Internationalization

To provide a better user experience, we have implemented internationalization support for authentication error messages.

### Usage

#### Next.js (React)

```typescript
import { authClientReact } from '@libs/auth/authClient';
import { useTranslation } from '@/hooks/use-translation';

function LoginForm() {
  const { t } = useTranslation();
  
  const handleLogin = async (email: string, password: string) => {
    const { data, error } = await authClientReact.signIn.email({
      email,
      password
    });

    if (error?.code) {
      // Use internationalized error messages
      const authErrorMessage = t.auth.authErrors[error.code as keyof typeof t.auth.authErrors] || t.auth.authErrors.UNKNOWN_ERROR;
      setErrorMessage(authErrorMessage);
    } else if (data?.user) {
      // Login successful
      console.log('Login successful:', data.user);
    }
  };
}
```

#### Nuxt.js (Vue)

```vue
<script setup>
import { authClientVue } from '@libs/auth/authClient';

const { t } = useI18n();
const localePath = useLocalePath();

const handleLogin = async (email, password) => {
  const { data, error } = await authClientVue.signIn.email({
    email,
    password
  });

  if (error?.code) {
    // Use internationalized error messages
    const authErrorMessage = t('auth.authErrors.' + error.code) || t('auth.authErrors.UNKNOWN_ERROR');
    errorMessage.value = authErrorMessage;
  } else if (data?.user) {
    // Login successful, redirect to homepage
    await navigateTo(localePath('/'));
  }
};
</script>
```

### Supported Error Codes

The system supports internationalization for the following Better Auth error codes:

| Error Code | English Message | Chinese Message |
|-----------|-----------------|-----------------|
| `USER_ALREADY_EXISTS` | User with this email already exists | 该邮箱已被注册 |
| `INVALID_EMAIL_OR_PASSWORD` | Invalid email or password | 邮箱或密码错误 |
| `EMAIL_NOT_VERIFIED` | Please verify your email address | 请先验证您的邮箱地址 |
| `USER_NOT_FOUND` | No account found with this email | 未找到该邮箱对应的账户 |
| `INVALID_CREDENTIALS` | Invalid credentials provided | 提供的凭据无效 |
| `ACCOUNT_BLOCKED` | Your account has been temporarily blocked | 您的账户已被临时冻结 |
| `TOO_MANY_REQUESTS` | Too many login attempts. Please try again later | 登录尝试次数过多，请稍后重试 |
| `INVALID_TOKEN` | Invalid or expired token | 无效或已过期的令牌 |
| `SESSION_EXPIRED` | Your session has expired. Please sign in again | 您的会话已过期，请重新登录 |
| `PHONE_NUMBER_ALREADY_EXISTS` | Phone number is already registered | 该手机号已被注册 |
| `INVALID_PHONE_NUMBER` | Invalid phone number format | 手机号格式无效 |
| `OTP_EXPIRED` | Verification code has expired | 验证码已过期 |
| `INVALID_OTP` | Invalid verification code | 验证码错误 |
| `OTP_TOO_MANY_ATTEMPTS` | Too many verification attempts. Please request a new code | 验证尝试次数过多，请重新获取验证码 |
| `CAPTCHA_REQUIRED` | Please complete the captcha verification | 请完成验证码验证 |
| `CAPTCHA_INVALID` | Captcha verification failed | 验证码验证失败 |
| `UNKNOWN_ERROR` | An unexpected error occurred | 发生未知错误 |

### Adding New Error Codes

To add internationalization support for new error codes:

1. Add English translation to `auth.authErrors` in `libs/i18n/locales/en.ts`
2. Add Chinese translation to `auth.authErrors` in `libs/i18n/locales/zh-CN.ts`
3. Error codes will be automatically recognized by the error handling system

### Design Principles

- **Simple Design**: Only provides internationalization for common authentication errors, avoiding over-engineering
- **Native Integration**: Uses existing i18n systems of each framework directly, no additional functions needed
- **Type Safety**: Leverages TypeScript to ensure type safety of error codes
- **Fallback Mechanism**: Unknown error codes fall back to generic error messages
- **Extensibility**: Supports adding more languages in the future without hardcoding language types

## Advanced Features

### Session Management
Better Auth provides comprehensive session management functionality, including session caching, session refresh, and session revocation.

**Related Documentation:**
- [Session Management](https://www.better-auth.com/docs/concepts/session-management)
- [Session Caching](https://www.better-auth.com/docs/concepts/session-management#session-caching)

### User and Account Management
Supports user information updates, password management, account deletion, and more.

**Related Documentation:**
- [Users and Accounts](https://www.better-auth.com/docs/concepts/users-accounts)
- [Change Password](https://www.better-auth.com/docs/concepts/users-accounts#change-password)
- [Delete User](https://www.better-auth.com/docs/concepts/users-accounts#delete-user)

### Email Verification
Supports email verification functionality with configurable auto-login and verification requirements.

**Related Documentation:**
- [Email Verification](https://www.better-auth.com/docs/authentication/email-verification)

### Access Control
Role-based access control system supporting admin permissions and custom roles.

**Related Documentation:**
- [Admin Plugin](https://www.better-auth.com/docs/plugins/admin)
- [Roles and Permissions](https://www.better-auth.com/docs/concepts/roles-permissions)

### Rate Limiting
Protects API endpoints from abuse by limiting the number of requests users can make within a specified time period.

**Related Documentation:**
- [Rate Limiting](https://www.better-auth.com/docs/concepts/rate-limiting)

### Custom Plugins
Better Auth supports custom plugin development to extend authentication functionality.

**Related Documentation:**
- [Plugin Development](https://www.better-auth.com/docs/plugins/custom-plugin)
- [Plugin API](https://www.better-auth.com/docs/plugins/plugin-api)

## Database Models

The authentication service uses Drizzle ORM and includes the following tables:

### Core Table Structure
- **`user`**: Basic user information including email, role, phone number, etc.
- **`account`**: Linked social account information storing OAuth tokens
- **`session`**: User session information including expiration time and device information
- **`verification`**: Verification records supporting email verification, phone verification, etc.

### Field Details
For detailed database models, please refer to the [Database Documentation](../database/README.md).

## Plugin System

The service uses the following Better Auth plugins:

### Official Plugins
- **`admin`**: Provides admin roles and access control
- **`phoneNumber`**: Provides phone number verification functionality
- **`captcha`**: Provides captcha protection (Cloudflare Turnstile)

### Third-party Plugins
- **`validator`**: Input validation plugin (from validation-better-auth)

### Custom Plugins
- **`wechat`**: Custom WeChat QR code login plugin supporting website applications

### Plugin Configuration

```typescript
// Plugin configuration example
plugins: [
  admin({
    adminRoles: ["admin"],
  }),
  
  // Captcha plugin (enabled based on configuration)
  ...(config.captcha.enabled ? [
    captcha({
      provider: "cloudflare-turnstile",
      secretKey: config.captcha.cloudflare.secretKey!,
      endpoints: ["/sign-up/email", "/sign-in/email", "/forget-password"]
    })
  ] : []),
  
  // WeChat login plugin
  wechatPlugin({
    appId: config.auth.socialProviders.wechat.appId!,
    appSecret: config.auth.socialProviders.wechat.appSecret!,
  }),
  
  // Phone number plugin
  phoneNumber({
    sendOTP: async ({ phoneNumber, code }) => {
      // SMS verification code implementation
    },
    signUpOnVerification: {
      getTempEmail: (phoneNumber) => `${phoneNumber}@tinyship.co`,
      getTempName: (phoneNumber) => phoneNumber.slice(-4)
    }
  })
]
```

## Development Environment Debugging

### Development Mode Features

In development environment, the authentication system provides special debugging features:

#### Email Verification Links
When email verification is required, verification links are provided through:
- Console log output
- In development environment, API responses include `dev.verificationUrl` field

```typescript
// Development environment response example
{
  "user": { /* user information */ },
  "dev": {
    "verificationUrl": "http://localhost:7001/api/auth/verify-email?token=...",
    "message": "Development mode: Use this verification URL instead of checking email"
  }
}
```

#### SMS Verification Codes
Phone verification codes are provided through:
- Console log output
- In development environment, API responses include `dev.otpCode` field

```typescript
// Development environment response example
{
  "data": { /* response data */ },
  "dev": {
    "otpCode": "123456",
    "message": "Development mode: Use this OTP code for verification"
  }
}
```

#### Password Reset Links
Password reset links in development environment can also be obtained through API responses:

```typescript
// Development environment response example
{
  "success": true,
  "dev": {
    "resetUrl": "http://localhost:7001/api/auth/reset-password?token=...",
    "message": "Development mode: Use this reset URL instead of checking email"
  }
}
```

### Rate Limiting

The authentication system includes the following rate limits:

```typescript
rateLimit: {
  enabled: true,
  customRules: {
    "/send-verification-email": {
      window: 60, // 60-second window
      max: 1,     // Maximum 1 request
    },
    "/forget-password": {
      window: 60, // 60-second window
      max: 1,     // Maximum 1 request
    },
  },
}
```

## Reference Documentation

### Official Documentation
- [Better Auth Official Documentation](https://www.better-auth.com/docs) - Complete Better Auth functionality guide
- [Better Auth Plugins](https://www.better-auth.com/docs/plugins) - All available plugins list
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview) - Database ORM usage guide

### Third-party Services
- [WeChat Open Platform Documentation](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html) - WeChat QR code login integration
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) - Captcha service documentation

### Project Documentation
- [Database Configuration Guide](../../docs/user-guide/database.md) - Database setup instructions
- [Authentication Configuration Guide](../../docs/user-guide/auth.md) - Detailed authentication configuration steps
- [Email Service Documentation](../email/README.md) - Email sending configuration
- [SMS Service Documentation](../sms/README.md) - SMS sending configuration 