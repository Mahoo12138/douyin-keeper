# TinyShip

🚀 一个现代化的、功能完备的 monorepo 起始套件，专为构建 SaaS 应用设计，同时支持国内和国际市场。

## ✨ 核心特性

### 🏗️ 现代化架构
- **灵活的 Monorepo 结构**：使用 `libs` 共享代码，避免复杂的 packages 配置
- **三框架支持**：
  - 为 React 开发者提供 Next.js
  - 为 Vue 开发者提供 Nuxt.js
  - 为追求轻量级 React 方案的开发者提供 TanStack Start
  - 选择你熟悉的框架，享受相同的强大后端支持

### 🔐 全面的身份认证
- **[Better-Auth](https://www.better-auth.com/) 集成**：
  - 邮箱/密码认证
  - 手机号验证与 OTP
  - 多因素认证 (2FA)
  - 会话管理
  - 账号关联
- **多种 OAuth 提供商**：
  - Google 登录
  - GitHub 登录
  - 微信登录
  - 易于扩展更多登录方式

### 🌐 全球化支持
- **国际化支持**：
  - 内置 i18n 支持
  - 多语言 UI 和邮件模板
  - 区域特定集成
- **支付解决方案**：
  - Stripe 支持全球支付
  - 微信支付接入
  - Creem 支付集成

### 📱 通信服务
- **邮件服务**：
  - 多提供商支持 (Resend, SendGrid, SMTP)
  - 模板化邮件
  - 本地化内容
- **短信集成**：
  - 国际提供商 (Twilio)
  - 国内提供商 (阿里云)
  - OTP 和通知支持

### 🎨 现代化 UI/UX
- **丰富的组件库**：
  - Next.js 使用 [shadcn/ui](https://ui.shadcn.com/)
  - Nuxt.js 使用 [Magic UI](https://www.magicui.design/)
- **样式方案**：
  - Tailwind CSS 实用优先的样式系统
  - 一致的设计系统
- **内置管理后台**：
  - 用户管理
  - 内容管理
  - 数据分析

### 💪 核心功能
- **基于 Zod 的类型安全验证**：
  - 全应用的 Schema 验证
  - 与 TypeScript 集成的运行时类型检查
  - API 请求/响应验证
  - 表单验证与详细错误提示
  - 自定义验证规则
  - 自动 TypeScript 类型推断
- **高级授权系统**：
  - 基于角色的访问控制 (RBAC)
  - 细粒度权限管理
  - 动态策略管理
  - 资源级别访问控制
  - 基于 CASL 的灵活权限规则

### 🤖 AI 集成
- **AI 服务**：
  - Vercel AI SDK 集成
  - 多 AI 提供商支持
  - 易于扩展的自定义 AI 功能

### 🧠 AI 开发就绪
- **Cursor 集成**：
  - 内置 Cursor 规则，支持 AI 辅助开发
  - 智能代码导航和补全
  - 上下文感知的 AI 建议
- **AI 优先开发**：
  - 结构化的代码库，便于 AI 理解
  - 完整的 AI 工具文档
  - 预置的提示和模板
- **增强开发体验**：
  - AI 辅助快速理解项目
  - 加速功能开发
  - 智能代码重构

## 🚀 快速开始

详细的设置说明和配置指南，请参考我们的[启动指南](./docs/user-guide/overview.md)。

## 📦 技术栈

### 前端
- Next.js/Nuxt.js
- TypeScript
- Tailwind CSS
- shadcn/ui 与 Magic UI
- [Zod](https://zod.dev/) 端到端类型安全

### 后端
- Better-Auth
- CASL 权限管理
- PostgreSQL
- Drizzle ORM

### 服务
- 邮件 (Resend/SendGrid/SMTP)
- 短信 (阿里云/Twilio)
- 支付 (Stripe/微信支付/Creem)
- AI 集成

## 🌟 为什么选择 TinyShip？

1. **快速启动**：几分钟内即可启动你的 SaaS 应用
2. **最佳实践**：采用现代工具和模式构建
3. **全球本地化**：同时支持国际和中国市场需求
4. **框架自由**：选择 React 或 Vue，保持所有强大特性
5. **生产就绪**：内置企业级安全和可扩展性
6. **AI 驱动开发**：通过 Cursor 和 AI 工具提供增强的开发体验