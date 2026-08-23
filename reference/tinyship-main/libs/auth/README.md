# TinyShip 认证服务

[中文文档](./README.md) | [English](./README_EN.md)

这个服务使用 [Better Auth](https://www.better-auth.com/) 提供完整的身份认证和授权功能。支持多种认证方式，包括邮箱密码、社交登录、手机号码验证等。

## 功能特点

- 多种认证方式
  - 邮箱密码登录
  - 社交账号登录（Google、GitHub、微信）
  - 手机号码验证登录
- 账户管理
  - 邮箱验证
  - 密码重置
  - 账号关联（可以将多个登录方式关联到同一账户）
- 权限控制
  - 管理员角色
  - 基于角色的访问控制
- 国际化支持
  - 支持中英文邮件模板
  - 根据用户语言偏好发送邮件

## 配置说明

配置分为两部分：
- 敏感信息（如 OAuth 密钥等）通过环境变量配置
- 非敏感信息（如功能开关、过期时间等）直接在 `config.ts` 中配置

### 环境变量

复制 `.env.example` 文件为 `.env`，并填入敏感信息：

```env
# 认证配置
BETTER_AUTH_SECRET="your-secret-key-here-32-characters-minimum"
BETTER_AUTH_URL="http://localhost:7001"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# GitHub OAuth
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

# 微信 OAuth
WECHAT_APP_ID="your-wechat-app-id"
NEXT_PUBLIC_WECHAT_APP_ID="your-wechat-app-id"  # Next.js 客户端需要
WECHAT_APP_SECRET="your-wechat-app-secret"
```

### 配置文件

认证服务配置结构（在 `config.ts` 中）：

```typescript
export const config = {
  auth: {
    // 邮箱验证要求
    requireEmailVerification: true,

    // 社交登录提供商配置
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

## 使用方法

### 服务端

#### Next.js API 路由

```typescript
// app/api/auth/[...all]/route.ts
import { auth, toNextJsHandler } from '@libs/auth';

export const { GET, POST } = toNextJsHandler(auth);
```

#### Nuxt.js API 路由

```typescript
// server/api/auth/[...all].ts
import { auth } from '@libs/auth';
import { toNodeHandler } from 'better-auth/node';

export default toNodeHandler(auth);
```

### 客户端（React）

```typescript
import { authClientReact } from '@libs/auth/authClient';

// 获取会话状态
const session = authClientReact.useSession();
const user = session.data?.user;

// 邮箱密码登录
const { data, error } = await authClientReact.signIn.email({
  email: 'user@example.com',
  password: 'password123',
  rememberMe: true // 可选：记住我功能
});

// 社交登录
await authClientReact.signIn.social({
  provider: 'google', // 'google' | 'github' | 'wechat'
});

// 手机号登录
await authClientReact.signIn.phoneNumber({
  phoneNumber: '+86 138 0000 0000',
  otp: '123456'
});

// 退出登录
await authClientReact.signOut();

// 用户注册
const { data, error } = await authClientReact.signUp.email({
  email: 'user@example.com',
  password: 'password123',
  name: 'User Name'
});

// 密码重置
await authClientReact.requestPasswordReset({
  email: 'user@example.com',
  redirectTo: '/reset-password'
});

// 会话管理
const sessions = await authClientReact.listSessions();
await authClientReact.revokeSession({ token: "session-token" });
await authClientReact.revokeOtherSessions();

// 用户信息管理
await authClientReact.updateUser({
  name: '新名称',
  image: 'https://example.com/avatar.jpg'
});

// 获取关联账户
const accounts = await authClientReact.listAccounts();

// 删除用户账户
await authClientReact.deleteUser();
```

### 客户端（Vue）

```typescript
import { authClientVue } from '@libs/auth/authClient';

// 获取会话状态
const session = authClientVue.useSession();
const user = computed(() => session.value?.data?.user);

// 邮箱密码登录
const { data, error } = await authClientVue.signIn.email({
  email: 'user@example.com',
  password: 'password123',
  rememberMe: true
});

// 社交登录
await authClientVue.signIn.social({
  provider: 'google', // 'google' | 'github' | 'wechat'
});

// 手机号登录
await authClientVue.signIn.phoneNumber({
  phoneNumber: '+86 138 0000 0000',
  otp: '123456'
});

// 退出登录
await authClientVue.signOut();

// 用户注册
const { data, error } = await authClientVue.signUp.email({
  email: 'user@example.com',
  password: 'password123',
  name: 'User Name'
});

// 或者使用 Nuxt.js composable (推荐)
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

## 认证错误国际化

为了提供更好的用户体验，我们实现了认证错误消息的国际化支持。

### 使用方法

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
      // 使用国际化错误消息
      const authErrorMessage = t.auth.authErrors[error.code as keyof typeof t.auth.authErrors] || t.auth.authErrors.UNKNOWN_ERROR;
      setErrorMessage(authErrorMessage);
    } else if (data?.user) {
      // 登录成功
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
    // 使用国际化错误消息
    const authErrorMessage = t('auth.authErrors.' + error.code) || t('auth.authErrors.UNKNOWN_ERROR');
    errorMessage.value = authErrorMessage;
  } else if (data?.user) {
    // 登录成功，跳转到首页
    await navigateTo(localePath('/'));
  }
};
</script>
```

### 支持的错误代码

系统支持以下 Better Auth 错误代码的国际化：

| 错误代码 | 英文消息 | 中文消息 |
|---------|---------|---------|
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

### 添加新的错误代码

如果需要添加新的错误代码国际化支持：

1. 在 `libs/i18n/locales/en.ts` 的 `auth.authErrors` 中添加英文翻译
2. 在 `libs/i18n/locales/zh-CN.ts` 的 `auth.authErrors` 中添加中文翻译
3. 错误代码会自动被 `getAuthErrorMessage` 函数识别

### 设计原则

- **简约设计**：只为常见的认证错误提供国际化，避免过度设计
- **原生集成**：直接使用各框架现有的 i18n 系统，无需额外函数
- **类型安全**：利用 TypeScript 确保错误代码的类型安全
- **回退机制**：未知错误代码会回退到通用错误消息
- **可扩展性**：支持未来添加更多语言，不硬编码语言类型

## 高级功能

### 会话管理
Better Auth 提供完整的会话管理功能，包括会话缓存、会话刷新、会话撤销等。

**相关文档：**
- [会话管理](https://www.better-auth.com/docs/concepts/session-management)
- [会话缓存](https://www.better-auth.com/docs/concepts/session-management#session-caching)

### 用户和账户管理
支持用户信息更新、密码管理、账户删除等功能。

**相关文档：**
- [用户和账户管理](https://www.better-auth.com/docs/concepts/users-accounts)
- [更改密码](https://www.better-auth.com/docs/concepts/users-accounts#change-password)
- [删除用户](https://www.better-auth.com/docs/concepts/users-accounts#delete-user)

### 邮箱验证
支持邮箱验证功能，可配置自动登录和验证要求。

**相关文档：**
- [邮箱验证](https://www.better-auth.com/docs/authentication/email-verification)

### 权限控制
基于角色的访问控制系统，支持管理员权限和自定义角色。

**相关文档：**
- [管理员插件](https://www.better-auth.com/docs/plugins/admin)
- [角色和权限](https://www.better-auth.com/docs/concepts/roles-permissions)

### 速率限制
保护 API 端点免受滥用，限制用户在指定时间内的请求次数。

**相关文档：**
- [速率限制](https://www.better-auth.com/docs/concepts/rate-limiting)

### 自定义插件
Better Auth 支持自定义插件开发，可以扩展认证功能。

**相关文档：**
- [插件开发](https://www.better-auth.com/docs/plugins/custom-plugin)
- [插件 API](https://www.better-auth.com/docs/plugins/plugin-api)

## 数据库模型

认证服务使用 Drizzle ORM，包含以下数据表：

### 核心表结构
- **`user`**: 用户基本信息，包括邮箱、角色、手机号等
- **`account`**: 关联的社交账号信息，存储 OAuth 令牌
- **`session`**: 用户会话信息，包括过期时间和设备信息
- **`verification`**: 验证记录，支持邮箱验证、手机验证等

### 字段说明
详细的数据库模型请参考 [数据库文档](../database/README.md)。

## 插件系统

服务使用了以下 Better Auth 插件：

### 官方插件
- **`admin`**: 提供管理员角色和权限控制
- **`phoneNumber`**: 提供手机号码验证功能
- **`captcha`**: 提供验证码保护（Cloudflare Turnstile）

### 第三方插件
- **`validator`**: 输入验证插件（来自 validation-better-auth）

### 自定义插件
- **`wechat`**: 自定义微信扫码登录插件，支持网站应用登录

### 插件配置

```typescript
// 插件配置示例
plugins: [
  admin({
    adminRoles: ["admin"],
  }),
  
  // 验证码插件（根据配置启用）
  ...(config.captcha.enabled ? [
    captcha({
      provider: "cloudflare-turnstile",
      secretKey: config.captcha.cloudflare.secretKey!,
      endpoints: ["/sign-up/email", "/sign-in/email", "/forget-password"]
    })
  ] : []),
  
  // 微信登录插件
  wechatPlugin({
    appId: config.auth.socialProviders.wechat.appId!,
    appSecret: config.auth.socialProviders.wechat.appSecret!,
  }),
  
  // 手机号插件
  phoneNumber({
    sendOTP: async ({ phoneNumber, code }) => {
      // 发送短信验证码的实现
    },
    signUpOnVerification: {
      getTempEmail: (phoneNumber) => `${phoneNumber}@tinyship.co`,
      getTempName: (phoneNumber) => phoneNumber.slice(-4)
    }
  })
]
```

## 开发环境调试

### 开发模式特性

在开发环境中，认证系统提供了特殊的调试功能：

#### 邮箱验证链接
当需要邮箱验证时，验证链接会通过以下方式提供：
- 控制台日志输出
- 开发环境下，API 响应中包含 `dev.verificationUrl` 字段

```typescript
// 开发环境响应示例
{
  "user": { /* 用户信息 */ },
  "dev": {
    "verificationUrl": "http://localhost:7001/api/auth/verify-email?token=...",
    "message": "Development mode: Use this verification URL instead of checking email"
  }
}
```

#### 短信验证码
手机验证码会通过以下方式提供：
- 控制台日志输出
- 开发环境下，API 响应中包含 `dev.otpCode` 字段

```typescript
// 开发环境响应示例
{
  "data": { /* 响应数据 */ },
  "dev": {
    "otpCode": "123456",
    "message": "Development mode: Use this OTP code for verification"
  }
}
```

#### 密码重置链接
密码重置链接在开发环境下同样可通过 API 响应获取：

```typescript
// 开发环境响应示例
{
  "success": true,
  "dev": {
    "resetUrl": "http://localhost:7001/api/auth/reset-password?token=...",
    "message": "Development mode: Use this reset URL instead of checking email"
  }
}
```

### 速率限制

认证系统包含以下速率限制：

```typescript
rateLimit: {
  enabled: true,
  customRules: {
    "/send-verification-email": {
      window: 60, // 60秒窗口
      max: 1,     // 最多1次请求
    },
    "/forget-password": {
      window: 60, // 60秒窗口
      max: 1,     // 最多1次请求
    },
  },
}
```

## 参考文档

### 官方文档
- [Better Auth 官方文档](https://www.better-auth.com/docs) - 完整的 Better Auth 功能说明
- [Better Auth 插件](https://www.better-auth.com/docs/plugins) - 所有可用插件列表
- [Drizzle ORM 文档](https://orm.drizzle.team/docs/overview) - 数据库 ORM 使用指南

### 第三方服务
- [微信开放平台文档](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html) - 微信扫码登录接入
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) - 验证码服务文档

### 项目文档
- [数据库配置指南](../../docs/user-guide/database.md) - 数据库设置说明
- [认证配置指南](../../docs/user-guide/auth.md) - 详细的认证配置步骤
- [邮件服务文档](../email/README.md) - 邮件发送配置
- [短信服务文档](../sms/README.md) - 短信发送配置 