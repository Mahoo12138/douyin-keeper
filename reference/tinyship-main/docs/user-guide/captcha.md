# 验证码配置

TinyShip 支持 Cloudflare Turnstile 验证码，用于防止垃圾注册和恶意请求。

## 🔗 相关页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 登录页 | `/signin` | 登录时验证 |
| 注册页 | `/signup` | 注册时验证 |

## 📑 目录

- [在 config/captcha.ts 中配置](#在-configcaptchats-中配置)
- [环境变量配置](#环境变量配置)
- [获取 Cloudflare Turnstile 密钥](#获取-cloudflare-turnstile-密钥)

## 在 config/captcha.ts 中配置

```typescript
// config/captcha.ts
export const captchaConfig = {
  enabled: false,                          // 启用/禁用验证码验证
  defaultProvider: 'cloudflare-turnstile', // 默认验证码提供商
  cloudflare: {
    // 配置会自动从环境变量读取，开发环境自动使用测试密钥
  }
}
```

**配置选项说明**：
- `enabled`: 控制是否启用验证码功能
- `defaultProvider`: 目前支持 `'cloudflare-turnstile'`
- `cloudflare`: Cloudflare Turnstile 相关配置

## 环境变量配置

在 `.env` 文件中添加：

```env
# Cloudflare Turnstile 验证码
TURNSTILE_SECRET_KEY="your-turnstile-secret-key"
NEXT_PUBLIC_TURNSTILE_SITE_KEY="your-turnstile-site-key"
```

## 获取 Cloudflare Turnstile 密钥

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 选择您的账户
3. 进入 "Turnstile" 页面
4. 创建新站点或使用现有站点
5. 复制 Site Key 和 Secret Key

**注意**: 开发环境会自动使用测试密钥，生产环境必须配置真实的密钥。
