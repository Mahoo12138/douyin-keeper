# TinyShip 用户指南

🚀 一个现代化的、功能完备的 monorepo 起始套件，专为构建 SaaS 应用设计，同时支持国内和国际市场。

## 📑 目录

- [🌟 核心特性](#-核心特性)
- [🏗️ 项目架构](#️-项目架构)
  - [Monorepo 结构](#monorepo-结构)
  - [技术栈](#技术栈)
- [🚀 快速开始](#-快速开始)
- [📚 配置指南](#-配置指南)
  - [基础配置](#基础配置)
  - [身份认证](#身份认证)
  - [支付配置](#支付配置)
  - [AI 功能](#ai-功能)
  - [其他配置](#其他配置)
  - [数据库](#数据库)
  - [应用部署](#应用部署)
- [📖 文档站点](#-文档站点-docs-app)
- [📚 深入了解](#-深入了解)
- [🤝 社区与支持](#-社区与支持)

## 🌟 核心特性

- **三框架支持**：同时支持 Next.js (React)、Nuxt.js (Vue) 和 TanStack Start (React)，开发者可根据偏好选择
- **完整的身份认证**：支持邮箱密码、OAuth（Google、GitHub、微信）、手机短信登录
- **多种支付集成**：支持 Stripe、微信支付、CREEM 等主流支付平台
- **国际化支持**：内置多语言系统，轻松支持全球市场
- **RBAC 权限管理**：基于角色的访问控制，灵活的权限体系
- **AI 功能集成**：支持多种 AI 提供商，快速构建智能应用
- **类型安全**：全面的 TypeScript 支持和数据验证
- **现代化 UI**：基于 shadcn/ui 的组件库，支持多主题切换

## 🏗️ 项目架构

### Monorepo 结构
TinyShip 采用简化的 monorepo 结构，使用 `libs` 目录共享核心代码，避免复杂的 packages 配置：

```
tinyship/
├── apps/                  # 应用实现
│   ├── next-app/         # Next.js 应用
│   ├── nuxt-app/         # Nuxt.js 应用
│   ├── tanstack-app/     # TanStack Start 应用
│   └── docs-app/         # 文档站点 (Fumadocs)
├── libs/                  # 核心库
│   ├── database/         # 数据库操作和架构
│   ├── auth/             # 身份认证服务
│   ├── email/            # 邮件服务
│   ├── sms/             # 短信服务
│   ├── payment/         # 支付服务
│   ├── storage/         # 存储服务（OSS/S3/R2）
│   ├── ai/              # AI 集成
│   ├── i18n/            # 国际化
│   ├── permissions/      # 权限管理
│   ├── react-shared/     # 共享 React 组件和 Hooks（Next.js + TanStack Start）
│   ├── ui/              # 共享 UI 样式（CSS 变量、主题）
│   └── validators/       # 数据验证
└── docs/                 # 项目文档
```

### 技术栈

**前端框架**
- Next.js 15 (App Router)
- Nuxt.js 3
- TanStack Start (Vite + TanStack Router)
- TypeScript
- Tailwind CSS

**后端服务**
- Drizzle ORM（多方言：PostgreSQL / SQLite / Cloudflare D1）
- PostgreSQL（默认）/ SQLite / Cloudflare D1
- Better Auth
- tRPC (计划中)

**部署与工具**
- Vercel / Netlify
- Docker
- PNPM 工作空间
- Turborepo (可选)

## 🚀 快速开始

完成以下步骤即可运行你的应用：

→ **[快速开始指南](./get-started.md)** - 安装依赖、配置数据库、启动应用

> **💡 AI 用户推荐：** 如果你使用 Cursor、Claude Code、Codex 等 AI 编辑器，可以安装 [Agent Skills](https://github.com/TinyshipCN/tinyship-skills) 获得交互式引导配置：
> ```bash
> npx skills add TinyshipCN/tinyship-skills
> ```
> 安装后直接对 AI 说「帮我设置 TinyShip」或「all-in Cloudflare」即可开始。

## 🔗 应用页面总览

启动应用后，以下是主要的页面路径：

| 分类 | 页面 | 路径 | 说明 |
|------|------|------|------|
| **首页** | 首页 | `/` | 应用首页 |
| **认证** | 登录 | `/signin` | 用户登录 |
| | 注册 | `/signup` | 用户注册 |
| | 手机登录 | `/cellphone` | 手机验证码登录 |
| | 微信登录 | `/wechat` | 微信扫码登录 |
| **用户** | 仪表盘 | `/dashboard` | 用户个人中心 |
| | 高级功能 | `/premium-features` | 付费功能示例 |
| **支付** | 定价页 | `/pricing` | 查看订阅计划和积分包 |
| **AI** | AI 对话 | `/ai` | AI 聊天功能 |
| | 图片生成 | `/image-generate` | AI 图片生成 |
| | 视频生成 | `/video-generate` | AI 视频生成 |
| **存储** | 上传示例 | `/upload` | 文件上传示例 |
| **管理** | 管理后台 | `/admin` | 管理员仪表盘 |
| | 用户管理 | `/admin/users` | 用户列表和管理 |
| | 订单管理 | `/admin/orders` | 订单列表和管理 |
| | 订阅管理 | `/admin/subscriptions` | 订阅列表和管理 |
| | 积分管理 | `/admin/credits` | 积分交易记录 |
|| | 定价管理 | `/admin/pricing` | 动态定价方案管理 |

## 📚 配置指南

### 基础配置
- **[基础配置](./basic-config.md)** - 应用名称、Logo、主题系统、国际化

### 身份认证
- **[认证配置概览](./auth/overview.md)** - 认证系统概览
  - [邮箱密码认证](./auth/email.md) - 默认认证方式
  - [Google OAuth](./auth/google.md) - Google 账号登录
  - [GitHub OAuth](./auth/github.md) - GitHub 账号登录
  - [微信扫码登录](./auth/wechat.md) - 微信账号登录
  - [短信验证登录](./auth/sms.md) - 手机短信验证

### 支付配置
- **[支付配置概览](./payment/overview.md)** - 支付系统概览
  - [微信支付](./payment/wechat.md) - 中国大陆用户
  - [Stripe](./payment/stripe.md) - 国际用户
  - [Creem](./payment/creem.md) - 独立开发者出海
  - [动态定价](./payment/dynamic-pricing.md) - 数据库驱动的实时定价管理
- **[支付测试](./payment-testing.md)** - 本地开发测试和 Webhook 调试
- **[积分系统](./credits.md)** - 积分充值和消耗配置

### AI 功能
- **[AI 对话配置](./ai/chat.md)** - AI 聊天功能
- **[AI 图片生成](./ai/image.md)** - AI 图片生成功能
- **[AI 视频生成](./ai/video.md)** - AI 视频生成功能

### 其他配置
- **[存储服务](./storage.md)** - OSS/S3/R2 云存储配置
- **[验证码](./captcha.md)** - Cloudflare Turnstile 验证码

### 数据库
- **[数据库配置](./database.md)** - 多方言支持（PostgreSQL / SQLite / Cloudflare D1）

### 框架指南
- **[TanStack Start 指南](./tanstack-start.md)** - TanStack Start 应用架构与开发指南

### 应用部署
- **[部署概览](./deployment/overview.md)** - 部署方式选择
  - [传统部署](./deployment/traditional.md) - PM2 进程管理
  - [Docker 部署](./deployment/docker.md) - 容器化部署
  - [云平台部署](./deployment/cloud.md) - Vercel/Netlify/Railway
  - [Cloudflare Workers](./deployment/cloudflare-workers.md) - TanStack Start 边缘部署（Hyperdrive / D1）

## 📖 文档站点 (docs-app)

TinyShip 包含一个基于 [Fumadocs](https://fumadocs.dev) 构建的独立文档站点应用，适用于：

- 📚 **产品文档**：为你的 SaaS 产品编写用户指南和 API 文档
- ✍️ **技术博客**：发布技术文章、产品更新和公告
- 🌐 **静态页面**：创建任何静态内容页面

### 快速使用

```bash
# 开发模式
pnpm dev:docs

# 构建静态站点
pnpm build:docs

# 预览构建结果
pnpm start:docs
```

详细的使用指南请参阅 [文档站点使用指南](./docs-app.md)。

## 📚 深入了解

### 核心功能模块

- **[身份认证](../../libs/auth/README.md)**：完整的用户认证和授权系统
- **[数据库](../../libs/database/README.md)**：数据库架构和迁移管理
- **[支付集成](../../libs/payment/README.md)**：多平台支付解决方案
- **[邮件服务](../../libs/email/README.md)**：邮件发送和模板管理系统
- **[短信服务](../../libs/sms/README.md)**：短信发送和验证码服务
- **[存储服务](../../libs/storage/README.md)**：统一云存储接口（OSS/S3/R2）
- **[共享 React 组件](../../libs/react-shared/AGENTS.md)**：Next.js 和 TanStack Start 共享的 React UI 组件和 Hooks
- **[UI 样式](../../libs/ui/README.md)**：通用 UI 样式库和主题系统
- **[权限管理](../../libs/permissions/README.md)**：基于角色的访问控制
- **[数据验证](../../libs/validators/README.md)**：类型安全的数据验证
- **[国际化](../../libs/i18n/README.md)**：多语言支持系统
- **[AI 功能](../../libs/ai/README.md)**：AI 服务集成和开发指南

### 开发指南

- **[开发最佳实践](./best-practices.md)**：代码规范和开发建议
- **[本地 E2E 测试流程](./e2e-local.md)**：如何在本地运行单测/全量 E2E（含 Next + Nuxt + TanStack 三端回归）

## 🤝 社区与支持

- **问题反馈**：[GitHub Issues](https://github.com/TinyshipCN)

---

每个 `libs/` 目录下的库都有自己的 README 文档，包含详细的 API 说明和使用示例。本指南提供高层次的概览和设置说明，帮助你快速上手项目。
