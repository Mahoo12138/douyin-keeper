# TanStack Start 应用指南

本指南介绍 TinyShip 中 TanStack Start 应用（`apps/tanstack-app`）的架构、开发方式和与其他应用的关系。

## 📑 目录

- [架构概览](#架构概览)
- [与 Next.js 的代码共享](#与-nextjs-的代码共享)
- [路由系统](#路由系统)
  - [文件系统路由](#文件系统路由)
  - [i18n 路由](#i18n-路由)
  - [路由分组](#路由分组)
- [服务端机制](#服务端机制)
  - [Server Routes（API 路由）](#server-routesapi-路由)
  - [Server Functions](#server-functions)
  - [何时使用哪种](#何时使用哪种)
- [中间件与权限](#中间件与权限)
- [开发与调试](#开发与调试)
- [部署方式](#部署方式)
- [与 Next.js / Nuxt.js 对照](#与-nextjs--nuxtjs-对照)

---

## 架构概览

TanStack Start 是一个基于 **Vite + Nitro** 的全栈 React 框架。它与 Nuxt.js 共享相同的服务端引擎（Nitro），但使用 React 作为视图层，配合 TanStack Router 提供文件系统路由。

```
┌────────────────────────────────────────────┐
│  TanStack Start App                        │
│                                            │
│  ┌─────────────┐  ┌────────────────────┐   │
│  │ TanStack     │  │ Server (Nitro)     │   │
│  │ Router       │  │  ├── Server Routes │   │
│  │ (文件系统    │  │  └── Server Fns    │   │
│  │  路由)       │  │      (createServerFn)│  │
│  └──────┬──────┘  └─────────┬──────────┘   │
│         │                    │              │
│         ▼                    ▼              │
│  ┌──────────────────────────────────────┐   │
│  │  libs/* (auth, ai, credits, payment, │   │
│  │  database, i18n, permissions, etc.)  │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │  libs/react-shared (共享 React 组件)  │   │
│  └──────────────────────────────────────┘   │
└────────────────────────────────────────────┘
```

**核心特点：**

- 基于 Vite 的极速 HMR 和构建
- TanStack Router 文件系统路由，类型安全
- `createServerFn` 提供类型安全的服务端 RPC
- 与 Next.js 共享 React 组件层（`libs/react-shared`）
- 支持 Node.js 和 Cloudflare Workers 双部署模式

## 与 Next.js 的代码共享

TanStack Start 和 Next.js 都使用 React，因此它们通过 `libs/react-shared` 共享大量 UI 代码：

| 共享内容 | 位置 | 说明 |
|---------|------|------|
| UI 组件 | `libs/react-shared/ui/` | shadcn/Radix 组件（Button、Card、Dialog 等） |
| Hooks | `libs/react-shared/hooks/` | `useIsMobile`、`useTheme` 等 |
| AI 聊天组件 | `libs/react-shared/components/ai-elements/` | Conversation、Message、PromptInput |
| 上下文 | `libs/react-shared/providers/` | SharedAppProvider（翻译 + 语言环境） |

**不共享的部分（各自实现）：**

- 路由定义和页面文件
- `useTranslation` hook（依赖各自的路由参数获取方式）
- `global-header.tsx`（使用各自的 Link 组件和路由导航）
- 中间件/路由守卫

## 路由系统

### 文件系统路由

TanStack Router 通过 `src/routes/` 目录自动生成路由树：

```
src/routes/
├── __root.tsx              # 根布局（全局 Provider、Header、Toaster）
├── index.tsx               # / → 自动重定向到 /$lang
├── $lang/
│   ├── (auth)/             # 认证页面组
│   │   ├── route.tsx       # 认证布局
│   │   ├── signin.tsx
│   │   ├── signup.tsx
│   │   └── forgot-password.tsx
│   ├── (root)/             # 主页面组
│   │   ├── route.tsx       # 主布局（含 auth 守卫）
│   │   ├── index.tsx       # 首页
│   │   ├── dashboard.tsx
│   │   ├── pricing.tsx
│   │   ├── ai.tsx
│   │   └── ...
│   └── admin.tsx           # 管理后台布局 + 子页面
└── api/                    # Server API 路由
    ├── auth/$.ts           # Better Auth 全匹配
    ├── chat.ts
    ├── credits/
    └── payment/
```

### i18n 路由

使用 `$lang` 动态路由参数实现多语言：

```
/en/dashboard     → 英文仪表盘
/zh-CN/dashboard  → 中文仪表盘
```

`useTranslation()` hook 从路由参数中获取 `lang`，返回对应的翻译对象：

```tsx
import { useTranslation } from '@/hooks/use-translation'

function MyComponent() {
  const { t, locale } = useTranslation()
  return <h1>{t.dashboard.title}</h1>
}
```

### 路由分组

TanStack Router 使用括号 `()` 创建路由分组，不影响 URL 路径：

| 分组 | 路径前缀 | 用途 |
|------|---------|------|
| `(auth)` | `/$lang/` | 认证页面（登录、注册等），无 header |
| `(root)` | `/$lang/` | 主功能页面（仪表盘、AI 等），需要登录 |
| `admin` | `/$lang/admin/` | 管理后台页面，需要 admin 角色 |

## 服务端机制

TanStack Start 提供两种服务端机制：

### Server Routes（API 路由）

类似 Next.js API Routes，处理原始 HTTP 请求/响应：

```tsx
// src/routes/api/my-endpoint.ts
import { createAPIFileRoute } from '@tanstack/react-start/api'
import { json } from '@tanstack/react-start'

export const APIRoute = createAPIFileRoute('/api/my-endpoint')({
  GET: async ({ request }) => {
    return json({ status: 'ok' })
  },
  POST: async ({ request }) => {
    const body = await request.json()
    return json({ data: body })
  },
})
```

### Server Functions

类型安全的 RPC 机制，构建时自动将服务端代码替换为 `fetch` 调用：

```tsx
import { createServerFn } from '@tanstack/react-start'

const getBalance = createServerFn({ method: 'GET' })
  .handler(async () => {
    const balance = await db.query.credits.findFirst(...)
    return { balance }
  })

// 在路由 loader 中使用
export const Route = createFileRoute('/$lang/(root)/dashboard')({
  loader: () => getBalance(),
  component: Dashboard,
})
```

### 何时使用哪种

| 场景 | 推荐 | 原因 |
|------|------|------|
| Webhook 回调 | Server Routes | 需要验证签名、处理原始请求体 |
| Better Auth | Server Routes | 需要全匹配路由 `/api/auth/$` |
| 支付回调 | Server Routes | 第三方服务发送原始 HTTP 请求 |
| 文件上传 | Server Routes | 需要处理 multipart/form-data |
| 页面数据加载 | Server Functions | 类型安全，自动序列化 |
| 表单提交 | Server Functions | 类型安全，自动验证 |
| CRUD 操作 | Server Functions | 类型安全，减少样板代码 |

## 中间件与权限

TanStack Start 使用路由的 `beforeLoad` 函数实现中间件逻辑：

```tsx
// src/routes/$lang/(root)/route.tsx — 主布局
export const Route = createFileRoute('/$lang/(root)')({
  beforeLoad: async ({ context }) => {
    // 检查用户是否已登录
    // 未登录则重定向到 /signin
  },
  component: RootLayout,
})

// src/routes/$lang/admin.tsx — 管理后台
export const Route = createFileRoute('/$lang/admin')({
  beforeLoad: async ({ context }) => {
    // 检查用户是否为 admin 角色
    // 非 admin 则重定向
  },
  component: AdminLayout,
})
```

权限检查通过 `libs/permissions` 进行，与 Next.js 和 Nuxt.js 使用相同的权限规则。

## 开发与调试

### 启动开发服务器

```bash
# 标准开发模式（Vite，端口 7001）
pnpm dev:tanstack

# Cloudflare Workers 模拟模式（端口 8788）
cd apps/tanstack-app && pnpm dev:cf
```

### 构建与启动

```bash
# 构建
pnpm build:tanstack

# 启动生产服务器
pnpm start:tanstack
```

### 类型检查

```bash
pnpm --filter @tinyship/tanstack-app typecheck
```

### 路由树更新

TanStack Router 在开发模式下会自动监听文件变化，重新生成 `src/routeTree.gen.ts`。如果路由树不更新，尝试重启开发服务器。

## 部署方式

TanStack Start 支持两种部署方式：

### 1. Node.js 部署

标准的服务端渲染部署，与 Next.js / Nuxt.js 类似：

```bash
pnpm build:tanstack
pnpm start:tanstack  # 启动 .output/server/index.mjs
```

支持 Docker、PM2、传统服务器等。详见 [传统部署](./deployment/traditional.md) 和 [Docker 部署](./deployment/docker.md)。

### 2. Cloudflare Workers 部署

将应用部署到 Cloudflare 全球边缘网络，通过 `CF_DEPLOY=1` 环境变量启用：

```bash
cd apps/tanstack-app
pnpm run deploy:cf   # CF_DEPLOY=1 vite build && wrangler deploy
```

详见 [Cloudflare Workers 部署指南](./deployment/cloudflare-workers.md)。

> **注意**：Cloudflare Workers 模式仅影响 TanStack Start 应用。`pnpm dev:tanstack` 始终使用标准 Vite 开发服务器，不加载 Cloudflare 插件。

## 与 Next.js / Nuxt.js 对照

| 概念 | Next.js | TanStack Start | Nuxt.js |
|------|---------|----------------|---------|
| **框架基础** | Webpack/Turbopack | Vite + Nitro | Vite + Nitro |
| **视图层** | React | React | Vue |
| **路由** | App Router (文件系统) | TanStack Router (文件系统) | Nuxt Router (文件系统) |
| **页面文件** | `app/[lang]/page.tsx` | `src/routes/$lang/(root)/index.tsx` | `pages/[lang]/index.vue` |
| **API 路由** | `app/api/*/route.ts` | `src/routes/api/*.ts` | `server/api/*.ts` |
| **中间件** | `middleware.ts` (全局) | `beforeLoad` (路由级) | `server/middleware/` |
| **服务端函数** | Server Actions | `createServerFn` | Server API |
| **i18n** | `useTranslation()` | `useTranslation()` | `useI18n()` |
| **共享组件** | `libs/react-shared` | `libs/react-shared` | 各自实现 (Vue) |
| **部署** | Node.js / Vercel | Node.js / Cloudflare Workers | Node.js / Netlify |

---

## 相关文档

- **[部署概览](./deployment/overview.md)** — 选择适合的部署方式
- **[Cloudflare Workers 部署](./deployment/cloudflare-workers.md)** — TanStack Start 边缘部署详细指南
- **[开发最佳实践](./best-practices.md)** — 框架选择建议和开发规范
- **[本地 E2E 测试](./e2e-local.md)** — 三端回归测试流程
