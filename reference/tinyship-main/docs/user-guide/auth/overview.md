# 身份认证配置指南

TinyShip 基于 Better Auth 构建了完整的身份认证系统，支持多种认证方式，包括邮箱密码、OAuth 社交登录和手机短信验证。

> 💡 **AI 快速配置：** 已安装 [Agent Skills](https://github.com/TinyshipCN/tinyship-skills) 的用户可以直接对 AI 说「帮我配置认证」，使用 `tinyship-auth` skill 交互式完成配置。

## 🔗 相关页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 登录页 | `/signin` | 用户登录入口 |
| 注册页 | `/signup` | 用户注册入口 |
| 手机登录 | `/cellphone` | 手机验证码登录 |
| 微信登录 | `/wechat` | 微信扫码登录 |
| 忘记密码 | `/forgot-password` | 发送密码重置邮件 |
| 重置密码 | `/reset-password` | 设置新密码 |

## 📑 目录

- [🔐 认证技术栈](#-认证技术栈)
- [📧 支持的认证方式](#-支持的认证方式)
- [🚀 快速配置](#-快速配置)
- [📚 详细配置文档](#-详细配置文档)
- [🎨 前端界面配置](#-前端界面配置)

## 🔐 认证技术栈

- **认证库**: Better Auth
- **会话管理**: 基于 Token 的安全会话
- **多因素认证**: 邮箱验证、短信验证
- **社交登录**: Google、GitHub、微信等
- **安全特性**: CSRF 保护、速率限制、密码哈希

## 📧 支持的认证方式

| 认证方式 | 说明 | 配置难度 | 文档 |
|---------|------|---------|------|
| **邮箱密码** | 默认启用，支持邮箱验证和密码重置 | ⭐ 简单 | [邮箱认证配置](./email.md) |
| **Google OAuth** | Google 账号登录 | ⭐⭐ 中等 | [Google 配置](./google.md) |
| **GitHub OAuth** | GitHub 账号登录 | ⭐⭐ 中等 | [GitHub 配置](./github.md) |
| **微信扫码登录** | 微信账号登录（需企业资质） | ⭐⭐⭐ 复杂 | [微信配置](./wechat.md) |
| **短信验证登录** | 手机号 + 验证码登录 | ⭐⭐⭐ 复杂 | [短信配置](./sms.md) |

## 🚀 快速配置

如果你已经完成了 [快速开始](../get-started.md)，那么基本的邮箱密码认证已经可以使用了。

基本环境变量（在 `.env` 文件中）：

```env
# 认证配置
BETTER_AUTH_SECRET="your-secret-key-here-32-characters-min" # 32位随机数
BETTER_AUTH_URL="http://localhost:7001"  # 生产环境改为实际域名

# 数据库配置（认证需要）
DATABASE_URL="postgresql://username:password@localhost:5432/tinyship"
```

## 📚 详细配置文档

根据你的需求，选择需要配置的认证方式：

1. **[邮箱密码认证](./email.md)** - 默认启用，可配置邮箱验证和邮件发送
2. **[Google OAuth](./google.md)** - 接入 Google 账号登录
3. **[GitHub OAuth](./github.md)** - 接入 GitHub 账号登录
4. **[微信扫码登录](./wechat.md)** - 接入微信账号登录（国内用户）
5. **[短信验证登录](./sms.md)** - 接入手机短信验证登录

## 🎨 前端界面配置

你可以定制化前端的界面，来显示你想要显示的认证方式：

### Next.js 应用
编辑 `apps/next-app/components/social-auth.tsx` 来控制显示的 OAuth 按钮：

```tsx
const defaultProviders: SocialProvider[] = ['google', 'github', 'wechat', 'phone'];
```

### Nuxt.js 应用
编辑 `apps/nuxt-app/components/SocialAuth.vue`：

```typescript
const props = withDefaults(defineProps<Props>(), {
  className: '',
  providers: () => ['google', 'github', 'wechat', 'phone']
})
```

### TanStack Start 应用
TanStack Start 与 Next.js 共享 React 组件，社交认证组件位于 `libs/react-shared/components/social-auth.tsx`，配置方式与 Next.js 相同。

---

更多认证配置和 API 使用请参考 [Better Auth 官方文档](https://www.better-auth.com/docs) 和 `libs/auth/README.md` 文件。
