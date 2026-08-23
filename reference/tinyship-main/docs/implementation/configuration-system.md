# 配置系统文档

## 概述

TinyShip 项目使用统一的配置系统来管理所有环境变量和应用配置。配置系统基于单一的 `config.ts` 文件，支持 Next.js 和 Nuxt.js 两个框架。

## 架构设计

### 核心文件
- **`config.ts`**: 统一配置文件，包含所有应用配置（纯配置对象，不包含环境变量加载逻辑）
- **`.env`**: 环境变量文件（项目根目录）
- **`next.config.ts`**: Next.js 构建时环境变量加载
- **`nuxt.config.ts`**: Nuxt.js 构建时环境变量加载

### 工作原理

**新架构（推荐）**:
```
.env 文件 → 框架配置文件加载 → process.env → config.ts → 应用代码
```

1. **环境变量加载**: 在框架配置文件中使用 dotenv（Next.js）或 Vite loadEnv（Nuxt.js）加载环境变量
2. **配置访问**: `config.ts` 通过 `process.env` 读取环境变量
3. **配置验证**: 提供必需/可选服务的验证和默认值
4. **类型安全**: 完整的 TypeScript 类型支持

**优势**:
- ✅ **避免客户端执行 Node.js 代码**: `config.ts` 不包含 Node.js 特定 API
- ✅ **框架最佳实践**: 利用各框架推荐的环境变量加载方式
- ✅ **更好的 Tree Shaking**: 配置文件更纯净，构建优化更好

## 框架集成

### Next.js 集成

**环境变量加载（next.config.ts）**:
```typescript
// next.config.ts
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

// 获取当前文件的目录
const __dirname = dirname(fileURLToPath(import.meta.url));
// 加载根目录的 .env 文件
config({ path: join(__dirname, '../../.env') });

// Next.js 配置...
```

**组件中使用**:
```typescript
// 服务端组件
import { config } from '@config';
const isEnabled = config.captcha.enabled;

// 客户端组件（仅静态配置或 NEXT_PUBLIC_ 变量）
import { config } from '@config';
const plans = config.payment.plans; // 静态配置，安全
```

### Nuxt.js 集成

**环境变量加载（nuxt.config.ts）**:
```typescript
// nuxt.config.ts
import { resolve } from 'path';
import { loadEnv } from 'vite';

// 使用 Vite 的 loadEnv 加载环境变量
const env = loadEnv(process.env.NODE_ENV || 'development', resolve(__dirname, '../..'), '');
// 将环境变量合并到 process.env
Object.assign(process.env, env);

import { config as appConfig } from '../../config';

export default defineNuxtConfig({
  runtimeConfig: {
    // 服务端环境变量
    databaseUrl: appConfig.database.url,
    
    public: {
      // 客户端可访问的配置
      captchaEnabled: String(appConfig.captcha.enabled),
      turnstileSiteKey: appConfig.captcha.cloudflare.siteKey,
      wechatAppId: process.env.WECHAT_APP_ID || 'your-wechat-app-id',
      wechatRedirectUri: process.env.WECHAT_REDIRECT_URI || `${appConfig.app.baseUrl}/api/auth/oauth2/callback/wechat`
    }
  }
});
```

**组件中使用**:
```vue
<script setup>
// 服务端直接使用 config
import { config } from '@config';
const dbUrl = config.database.url; // 仅服务端

// 客户端使用 runtime config
const runtimeConfig = useRuntimeConfig();
const siteKey = runtimeConfig.public.turnstileSiteKey;
</script>
```

## 环境变量加载对比

| 框架 | 加载方式 | 优势 | 位置 |
|------|----------|------|------|
| **Next.js** | `dotenv.config()` | 简单直接，与 Next.js 生态兼容 | `next.config.ts` |
| **Nuxt.js** | `loadEnv()` from Vite | 原生支持，更好的环境处理，支持 `.env.local` 等 | `nuxt.config.ts` |

### Vite loadEnv 的优势（Nuxt.js）

✅ **自动环境检测**: 根据 `NODE_ENV` 自动选择对应的 `.env` 文件  
✅ **文件优先级**: 自动处理 `.env.local` > `.env.development` > `.env` 的优先级  
✅ **原生支持**: 与 Nuxt 3 的 Vite 基础完美集成  
✅ **更好的错误处理**: 内置了更健壮的错误处理机制

## 配置分类

### 1. 应用配置 (`config.app`)
- **baseUrl**: 应用基础 URL
- **payment**: 支付相关 URL (success, cancel, webhooks)

### 2. 支付配置 (`config.payment`)
- **providers**: 支付提供商配置 (WeChat, Stripe, Creem)
- **plans**: 订阅计划配置

### 3. 认证配置 (`config.auth`)
- **socialProviders**: 社交登录配置 (Google, GitHub, WeChat)

### 4. 通信服务 (`config.sms`, `config.email`)
- **SMS**: 阿里云、Twilio 短信服务
- **Email**: Resend、SendGrid、SMTP 邮件服务

### 5. 验证码配置 (`config.captcha`)
- **enabled**: 是否启用验证码
- **cloudflare**: Turnstile 配置

### 6. 数据库配置 (`config.database`)
- **url**: 数据库连接字符串

## 环境变量管理

### 必需变量
```bash
# 应用基础配置
APP_BASE_URL=http://localhost:7001
DATABASE_URL=postgresql://user:pass@localhost:5432/db
BETTER_AUTH_SECRET=your-secret-key
```

### 可选变量
```bash
# 支付服务
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLIC_KEY=pk_test_...
CREEM_API_KEY=your-creem-key

# 社交登录
GOOGLE_CLIENT_ID=your-google-id
GITHUB_CLIENT_ID=your-github-id
WECHAT_APP_ID=your-wechat-app-id
WECHAT_REDIRECT_URI=http://localhost:7001/api/auth/oauth2/callback/wechat

# 验证码
TURNSTILE_SITE_KEY=your-site-key
TURNSTILE_SECRET_KEY=your-secret-key
```

## 配置验证

### 服务分类
- **必需服务**: 应用核心功能，缺失会抛出错误
- **可选服务**: 功能增强，缺失会显示警告

### 开发环境支持
```typescript
// 开发环境提供默认值
function requireEnvForService(key: string, service: string, devDefault?: string)

// 示例
get baseUrl() {
  return requireEnvForService('APP_BASE_URL', 'Application', 'http://localhost:7001');
}
```

## 使用指南

### 1. 服务端使用
```typescript
import { config } from '@config';

// API 路由中
export async function POST() {
  const dbUrl = config.database.url;
  const stripeKey = config.payment.providers.stripe.secretKey;
}
```

### 2. 客户端使用

#### Next.js
```typescript
import { config } from '@config';

// 只使用静态配置或 NEXT_PUBLIC_ 变量
const plans = config.payment.plans; // 静态配置，安全
const isEnabled = config.captcha.enabled; // 静态配置，安全
```

#### Nuxt.js
```typescript
// 使用 runtime config
const runtimeConfig = useRuntimeConfig();
const siteKey = runtimeConfig.public.turnstileSiteKey;
const apiBaseUrl = runtimeConfig.public.apiBaseUrl;
```

### 3. 类型安全
```typescript
import type { Plan } from '@config';

// 完整的类型支持
const plan: Plan = config.payment.plans.monthly;
```

## 最佳实践

### 1. 环境变量命名
- **服务端**: 直接使用变量名 (`DATABASE_URL`)
- **Next.js 客户端**: 使用 `NEXT_PUBLIC_` 前缀
- **Nuxt.js 客户端**: 通过 `runtimeConfig.public` 注入

### 2. 配置访问
- **服务端**: 直接导入 `config`
- **Next.js 客户端**: 优先使用静态配置，避免依赖环境变量
- **Nuxt.js 客户端**: 使用 `useRuntimeConfig()` 访问配置

### 3. 环境变量加载
- **Next.js**: 在 `next.config.ts` 中使用 dotenv
- **Nuxt.js**: 在 `nuxt.config.ts` 中使用 Vite 的 loadEnv
- **避免**: 在 `config.ts` 中直接加载环境变量

### 4. 开发环境
- 创建 `.env` 文件覆盖默认配置
- 使用开发默认值快速启动
- Nuxt.js 支持 `.env.development` 等环境特定文件

### 5. 生产环境
- 必须设置所有必需的环境变量
- 验证配置完整性

## 故障排除

### 1. "Missing required environment variable" 错误
- 检查 `.env` 文件是否存在于项目根目录
- 确认环境变量名称正确
- 开发环境检查是否有默认值
- 确认框架配置文件正确加载了环境变量

### 2. 客户端配置未生效
- **Next.js**: 确认使用 `NEXT_PUBLIC_` 前缀或静态配置
- **Nuxt.js**: 检查 `runtimeConfig.public` 配置

### 3. "(0, {imported module}) is not a function" 错误
- 这通常表示客户端尝试执行 Node.js 代码
- 确认 `config.ts` 不包含 Node.js 特定 API
- 确认环境变量加载在框架配置文件中进行

### 4. 配置类型错误
- 确认导入路径正确
- 检查 TypeScript 类型定义


## 总结

新的配置系统具有以下优势：
- ✅ **统一管理**: 所有配置集中在一个纯净的文件
- ✅ **类型安全**: 完整的 TypeScript 支持
- ✅ **框架兼容**: 支持 Next.js 和 Nuxt.js 的最佳实践
- ✅ **开发友好**: 提供默认值和验证
- ✅ **生产就绪**: 严格的环境变量验证
- ✅ **客户端安全**: 避免在浏览器中执行 Node.js 代码
- ✅ **更好的构建优化**: Tree shaking 和代码分割更有效

这个设计在保持简洁的同时，提供了足够的灵活性、安全性和性能优化。 