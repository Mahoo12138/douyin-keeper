# Email Service

这个服务提供统一的邮件发送接口，支持多个邮件服务提供商和国际化邮件模板。

当前已实现的 provider：
- `resend`
- `cloudflare`

计划中的 provider：
- `sendgrid`
- `smtp`

## 邮件模板系统

本模块使用内联 MJML 模板解决 monorepo 部署问题，支持多语言邮件模板：

- **验证邮件** - 用户注册后的邮箱验证
- **重置密码邮件** - 用户忘记密码时的重置链接
- **支持语言** - 中文 (`zh-CN`) 和英文 (`en`)
- **响应式设计** - 基于 MJML 的响应式邮件布局

### MJML 资源

- **[MJML 官网](https://mjml.io/)** - 了解 MJML 语法和最佳实践
- **[MJML 在线编辑器](https://mjml.io/try-it-live/)** - 实时预览和调试邮件模板
- **[MJML 文档](https://documentation.mjml.io/)** - 完整的组件和语法文档

## 配置

配置分为两部分：
- 敏感信息通过环境变量配置
- 非敏感信息在 `config/email.ts` 中配置

### 环境变量

复制 `.env.example` 文件为 `.env`，并填入敏感信息：

```env
# Resend 配置（敏感信息）
RESEND_API_KEY=your_resend_api_key

# 通用发件人
EMAIL_DEFAULT_FROM=noreply@yourdomain.com

# Cloudflare 通用账号凭据
# Cloudflare Email Sending 复用这组账号级变量，不新增 email 专属同义变量
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
```

### 配置文件

`config/email.ts` 中的 Email 配置结构：

```typescript
export const emailConfig = {
  defaultProvider: 'resend',
  get defaultFrom() {
    return getEnvForService('EMAIL_DEFAULT_FROM', 'Email Service');
  },
  resend: {
    get apiKey() {
      return getEnvForService('RESEND_API_KEY', 'Resend Email');
    },
  },
  cloudflare: {
    get accountId() {
      return getEnvForService('CLOUDFLARE_ACCOUNT_ID', 'Cloudflare Email');
    },
    get apiToken() {
      return getEnvForService('CLOUDFLARE_API_TOKEN', 'Cloudflare Email');
    }
  }
} as const;
```

## Cloudflare Email Sending

Cloudflare provider 目前走 **REST API**，这是三端共享实现的默认路径。后续如果只针对 TanStack Cloudflare Workers 做优化，可以再增加 `env.EMAIL.send()` binding 适配层，但当前共享库不会默认使用 binding。

### 前置条件

- 你的域名必须先在 Cloudflare Email Sending 中完成 onboard
- `from` 地址必须属于已经启用 Email Sending 的域名
- 这是 **transactional email** 能力，不适合 bulk / marketing email
- 建议同时传 `html` 和 `text`，有助于兼容性和投递率

### REST 与 Workers binding 的区别

- REST API 使用 `reply_to`，Workers binding 使用 `replyTo`
- REST 的 `from` 对象字段是 `address`，Workers binding 是 `email`
- REST 返回 `delivered` / `queued` / `permanent_bounces`
- Workers binding 才会返回 `messageId`

当前 `libs/email` 对 Cloudflare provider 仅封装共享字段，不扩展 `attachments`、`headers` 或对象形式的 `from`

## 使用方法

### 推荐的真实发送测试方式

对于“provider 现在到底能不能发出去”这个问题，推荐优先使用独立 smoke-test 脚本，而不是先跑完整应用流程。这样可以更快定位问题到底出在：

- 环境变量
- provider 凭据
- 发件域名 onboarding
- 模板生成

可用命令：

```bash
# 基础邮件
pnpm email:test -- basic --to you@example.com --provider resend
pnpm email:test -- basic --to you@example.com --provider cloudflare

# 验证邮件模板
pnpm email:test -- verification --to you@example.com --provider cloudflare --name Viking

# 重置密码模板
pnpm email:test -- reset --to you@example.com --provider resend --locale zh-CN
```

如果脚本发送成功，再去应用里验证注册/忘记密码流程，会更容易区分“邮件基础设施问题”和“业务流程问题”。

### 邮件模板使用

#### 发送验证邮件

```typescript
import { sendVerificationEmail } from '@libs/email';

// 用户注册后发送验证邮件
await sendVerificationEmail('user@example.com', {
  name: 'vikingmute',  // 用户名
  verification_url: 'https://example.com/verify?token=123',
  expiry_hours: 1,     // 过期时间（小时）
  locale: 'zh-CN'      // 语言（'en' | 'zh-CN'）
});
```

#### 发送重置密码邮件

```typescript
import { sendResetPasswordEmail } from '@libs/email';

// 用户忘记密码后发送重置邮件
await sendResetPasswordEmail('user@example.com', {
  name: 'vikingmute',  // 用户名  
  reset_url: 'https://example.com/reset?token=456',
  expiry_hours: 1,     // 过期时间（小时）
  locale: 'zh-CN'      // 语言（'en' | 'zh-CN'）
});
```

### 基本邮件发送

```typescript
import { sendEmail } from '@libs/email';

// 使用默认提供商发送邮件
await sendEmail({
  to: 'user@example.com',
  subject: '欢迎使用我们的服务',
  html: '<h1>欢迎！</h1><p>感谢您注册我们的服务。</p>'
});

// 使用指定提供商发送邮件
await sendEmail({
  to: 'user@example.com',
  subject: 'Welcome',
  html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
  text: 'Welcome! Thanks for signing up.',
  provider: 'cloudflare'
});
```

### 响应格式

```typescript
interface EmailResponse {
  success: boolean;        // 发送是否成功
  id?: string;            // 可选邮件ID
  error?: {
    message: string;
    name: string;
    provider?: 'resend' | 'cloudflare' | 'sendgrid' | 'mailchimp' | 'smtp';
  } | null;
}
```

> Cloudflare REST API 不会像 Workers binding 那样返回 `messageId`，因此 `id` 在 Cloudflare provider 下通常为空。

## 邮件模板开发

### 模板结构

模板文件位于 `templates/` 目录：
```
templates/
├── index.ts         # 模板生成函数
├── templates.ts     # MJML 模板内容
└── README.md        # 模板文档
```

### 添加新模板

1. 使用 [MJML 在线编辑器](https://mjml.io/try-it-live/) 设计和测试新模板
2. 在 `templates.ts` 中添加新的 MJML 模板字符串
3. 在 `index.ts` 中添加对应的接口和生成函数
4. 在 `i18n/locales/` 中添加相应的翻译文本
5. 在 `templates-sender.ts` 中添加发送函数

### 模板特性

- **内联部署** - 模板内容直接嵌入代码，解决 monorepo 部署问题
- **多语言支持** - 基于 `@libs/i18n` 的翻译系统
- **响应式设计** - 使用 MJML 确保邮件在各设备正常显示
- **占位符替换** - 自动处理 `{{name}}`、`{{expiry_hours}}`、`{{year}}` 等变量

## 添加新的服务提供商

1. 在 `.env.example` 和 `.env` 中添加新提供商所需的敏感信息
2. 在 `config/email.ts` 中添加新提供商配置
3. 在 `providers` 目录下创建新的提供商实现文件
4. 在 `types.ts` 中的 `EmailProvider` 类型中添加新的提供商
5. 在 `email-sender.ts` 中添加新的 case 处理

## 注意事项

- 确保在使用前正确配置所有必需的环境变量
- 非敏感结构配置在 `config/email.ts` 中维护
- 不同提供商可能需要不同的配置参数
- 建议在生产环境中使用错误处理和重试机制
- 模板使用内联方式，无需担心 monorepo 构建时的文件路径问题
