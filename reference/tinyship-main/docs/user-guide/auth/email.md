# 邮箱密码认证配置

邮箱密码认证是默认启用的认证方式，本文档介绍如何配置邮箱验证和邮件发送功能。

## 📑 目录

- [核心特性](#核心特性)
- [邮箱验证配置](#邮箱验证配置)
- [📧 邮件服务配置](#-邮件服务配置)
  - [Resend 配置](#resend-配置)
  - [Cloudflare Email 配置](#cloudflare-email-配置)
  - [开发环境建议](#开发环境建议)
- [扩展邮件功能](#扩展邮件功能)

## 核心特性

邮箱密码认证包含以下功能：

- ✅ 用户注册，支持邮箱验证
- ✅ 用户登录，支持"记住我"功能
- ✅ 密码重置功能
- ✅ 账户恢复选项
- ✅ 安全的会话管理

## 邮箱验证配置

默认情况下，系统要求新用户验证邮箱不需要验证就可以使用。你可以在 `config/auth.ts` 中开启此功能：

```typescript
// config/auth.ts
// 当设置为 true 的时候，系统会在新用户注册的时候发送验证邮件
// 并且假如用户邮箱没有验证，登录以后没有验证的警告
// 设置为 false 以后，用户注册没有任何限制
export const authConfig = {
  requireEmailVerification: true,
  // ...其他认证配置
}
```

这里强烈建议在线上设置为 true，它通过确认电子邮件地址属于用户来帮助防止垃圾邮件和滥用，也是大多数网站的默认方式。

## 📧 邮件服务配置

假如你将 `requireEmailVerification` 设置为 true，认证系统会自动发送验证邮件和密码重置邮件。这个时候你就需要接入邮件服务。

### Resend 配置

现在推荐选用 Resend：

#### 设置步骤
1. 访问 [Resend](https://resend.com/) 注册账号
2. 验证你的发送域名
3. 获取 API Key

#### 环境变量配置
```env
RESEND_API_KEY="re_123456789_abcdefghijklmnop"
# 默认发送邮件地址, 按照你验证的网址进行配置, 这里你需要任意一个域名进行验证
EMAIL_DEFAULT_FROM="noreply@tinyship.cn"
```

#### 修改配置文件

`config/email.ts`

```typescript
export const emailConfig = {
  /**
   * 默认 email 发送提供商
   */
  defaultProvider: 'resend',
  // ...其他配置
}
```

配置完毕以后应该就在注册的时候成功的发送验证邮件了。

### Cloudflare Email 配置

如果你希望把认证邮件发送接入 Cloudflare Email Service，现在也已经支持。

#### 适用场景

Cloudflare Email 更适合这类 **transactional email**：

- 注册验证邮件
- 密码重置邮件
- 登录/账户安全通知

不建议把它当成营销群发工具来使用。

#### 设置步骤

1. 登录 Cloudflare Dashboard
2. 进入 Email Sending
3. 选择你的域名并完成 onboard
4. 确认发送相关 DNS 记录已正确配置
5. 创建一个拥有 `所有帐户 - 电子邮件发送:编辑` 权限的 API Token
6. 准备一个属于该已启用域名的发件地址

#### 环境变量配置

```env
# 默认发件地址
# 必须属于你已经在 Cloudflare Email Sending 中启用的域名或子域名
EMAIL_DEFAULT_FROM="noreply@tinyship.cn"

# Cloudflare 通用账号变量
CLOUDFLARE_ACCOUNT_ID="your-cloudflare-account-id"
CLOUDFLARE_API_TOKEN="your-cloudflare-api-token"
```

#### 修改配置文件

`config/email.ts`

```typescript
export const emailConfig = {
  /**
   * 默认 email 发送提供商
   */
  defaultProvider: 'cloudflare',
  // ...其他配置
}
```

#### 关键说明

- `EMAIL_DEFAULT_FROM` 不能随便填，必须使用你已经在 Cloudflare Email Sending 中完成配置的域名
- 比如：

```env
EMAIL_DEFAULT_FROM="noreply@tinyship.cn"
```

- Cloudflare 官方也建议把 transactional email 和 marketing email 分到不同域名或子域名，避免互相影响投递信誉
- 为了更好的投递率，建议同时发送 `html` 和 `text` 内容

配置完毕以后，你可以直接运行邮件 smoke test 来验证：

```bash
pnpm email:test -- verification --to your-email@example.com --provider cloudflare --name Viking
```

### 开发环境建议

**开发环境建议**: 在本地开发时，调试成功以后，建议先注释掉邮件发送代码，如果想获得最终的数据，我们的代码中已经将它添加到一个临时字段中：

```typescript
// 开发环境：将验证链接存储到 context 中，通过 hooks 返回
if (process.env.NODE_ENV === 'development') {
  // 将验证链接存储到全局上下文中，hooks 可以访问
  (request as any).context = (request as any).context || {};
  (request as any).context.verificationUrl = url;
  console.log('🔗 [DEVELOPMENT MODE] Verification URL stored in context:', url);
}
```

你可以查看 network，将对应的 url 复制出来，然后在浏览器中打开即可，在生产环境再启用。

## 扩展邮件功能

除了认证邮件，你还可以扩展邮件服务用于：
- 🎉 欢迎邮件
- 🔔 通知邮件
- 📊 系统报告
- 🚨 安全警报

如果你选择的是 Cloudflare Email Service，请优先将它用于事务型邮件，而不是营销群发。

详细配置请参考：[邮件服务文档](../../../libs/email/README.md)

---

返回 [认证配置概览](./overview.md)
