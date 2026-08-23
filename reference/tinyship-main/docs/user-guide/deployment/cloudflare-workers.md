# Cloudflare Workers 部署指南（TanStack Start）

本指南介绍如何将 TinyShip 的 TanStack Start 应用部署到 Cloudflare Workers。

> **适用范围**：仅适用于 `apps/tanstack-app`（TanStack Start）。Next.js 和 Nuxt.js 建议部署到 Node.js 环境，或使用 Vercel / Netlify。

> 💡 **AI 一键配置：** 已安装 [Agent Skills](https://github.com/TinyshipCN/tinyship-skills) 的用户可以直接对 AI 说「all-in Cloudflare」，使用 `tinyship-cloudflare` skill 一次性配置 Workers + D1/Hyperdrive + R2 + Email + Turnstile。

## 目录

- [为什么选择 Cloudflare Workers](#为什么选择-cloudflare-workers)
- [兼容性说明](#兼容性说明)
- [仓库中已完成的配置](#仓库中已完成的配置)
- [分步骤部署](#分步骤部署)
  - [步骤 1：登录 Cloudflare](#步骤-1登录-cloudflare)
  - [步骤 2：配置 Hyperdrive（数据库）](#步骤-2配置-hyperdrive数据库)
  - [步骤 3：配置 Secrets](#步骤-3配置-secrets)
  - [步骤 4：本地预览](#步骤-4本地预览)
  - [步骤 5：部署上线](#步骤-5部署上线)
  - [步骤 6：部署后验证](#步骤-6部署后验证)
- [数据库连接](#数据库连接)
  - [方案 A：Hyperdrive + PostgreSQL（推荐）](#方案-ahyperdrive--postgresql推荐)
  - [方案 B：Cloudflare D1（SQLite）](#方案-bcloudflare-d1sqlite)
  - [方案 C：Neon Serverless Driver](#方案-cneon-serverless-driver)
- [环境变量与 Secrets](#环境变量与-secrets)
- [CI/CD](#cicd)
  - [GitHub Actions](#github-actions)
  - [Cloudflare Workers Builds](#cloudflare-workers-builds)
- [CF 模式工作原理（开发者说明）](#cf-模式工作原理开发者说明)
- [故障排查](#故障排查)

## 为什么选择 Cloudflare Workers

| 特性 | 说明 |
|------|------|
| **全球边缘部署** | 自动分发到 300+ 数据中心 |
| **冷启动极快** | 基于 V8 Isolate，冷启动 < 5ms |
| **按量计费** | 免费额度：每日 10 万次请求 |
| **内置 R2 存储** | 可无缝集成 Cloudflare R2 |
| **完整 SSR 支持** | 支持 TanStack Start 的 SSR、Streaming、Server Functions |
| **低运维成本** | 无需管理服务器、负载均衡或容器 |

## 兼容性说明

Cloudflare Workers 运行在 V8 Isolate（非 Node.js）环境。通过 `nodejs_compat` 标志可覆盖大多数 Node.js API，但仍有一些注意事项。

### 已验证兼容

- TanStack Start SSR / Streaming / Server Functions
- Better Auth（基于 HTTP）
- Stripe / PayPal / Creem 支付（基于 HTTP API）
- AI SDK（Vercel AI SDK，HTTP 请求）
- `Buffer`、`crypto` 等（通过 `nodejs_compat`）
- Cloudflare R2 对象存储

### 需要额外配置

- **PostgreSQL**：`pg` 使用 TCP 连接，Workers 不支持原生 TCP。需使用 **Hyperdrive** 或 **Neon Serverless Driver**（见下文）。也可以选择 **Cloudflare D1**（SQLite）来避免外部数据库依赖。
- **文件上传**：请求体上限为 100MB（免费版）/ 500MB（付费版）。
- **执行时间**：CPU 时间限制为 10ms（免费版）/ 30s（付费版）。长耗时 AI 任务建议使用流式响应或异步处理。

### 不兼容项

- 依赖原生 C++ 扩展的 npm 包（如 `bcrypt`，建议换成 `bcryptjs`）
- 文件系统写入（如 `fs.writeFile`）
- 长连接 TCP（WebSocket 需配合 Durable Objects）

## 仓库中已完成的配置

以下文件已在仓库中预置完成，你只需补充自己的环境配置：

| 文件 | 用途 |
|------|------|
| `apps/tanstack-app/wrangler.jsonc` | Wrangler 配置文件（请替换为你自己的 Hyperdrive 与域名配置） |
| `apps/tanstack-app/vite.config.ts` | 通过 `CF_DEPLOY` 环境变量按需加载 Cloudflare Vite 插件 |
| `apps/tanstack-app/package.json` | 已提供 `dev:cf` / `deploy:cf` / `cf-typegen` 脚本 |
| `libs/database/index.ts` | 多方言驱动（PG / SQLite / D1），Hyperdrive 通过 `setHyperdriveBinding()` 注入 |
| `libs/database/drivers/d1.ts` | D1 驱动实现（AsyncLocalStorage + Proxy 模式） |
| `apps/tanstack-app/src/lib/with-request-db.ts` | Workers binding 注入逻辑（D1 binding + Hyperdrive binding），`withCfDb` / `withDbContext` |

> **不会影响日常开发**：`pnpm dev` 仍使用标准 Vite 开发服务。  
> 仅当设置 `CF_DEPLOY=1` 时才启用 CF 模式（`dev:cf` 和 `deploy:cf` 脚本会自动设置）。

## 分步骤部署

### 前置条件

- 拥有 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)
- 数据库方案二选一：本地 `.env` 中已配置 `DATABASE_URL`（Hyperdrive 方案），或已创建 D1 数据库（D1 方案）
- 依赖已安装（`wrangler` 与 `@cloudflare/vite-plugin` 已在 `devDependencies`）

### 步骤 1：登录 Cloudflare

```bash
cd apps/tanstack-app
npx wrangler login
```

执行后会自动打开浏览器授权。完成后终端会显示 `Successfully logged in`。

### 步骤 2：配置 Hyperdrive（数据库）

先使用你的 PostgreSQL 连接串创建 Hyperdrive（这是线上 Workers 使用的代理配置）：

```bash
npx wrangler hyperdrive create tinyship-db \
  --connection-string="postgresql://user:password@host:5432/dbname"
```

创建完成后会返回一个 Hyperdrive ID。然后在 `wrangler.jsonc` 中同时配置：

- `id`：**线上部署**时使用（`wrangler deploy` 后在 Cloudflare 边缘通过 Hyperdrive 访问数据库）
- `localConnectionString`：**本地开发**时使用（`wrangler dev` / `pnpm dev:cf` 直接连你本机或内网数据库）

示例（与当前项目结构一致）：

```jsonc
"hyperdrive": [
  {
    "binding": "HYPERDRIVE",
    "id": "<your-hyperdrive-id>",
    "localConnectionString": "postgresql://viking:unused@localhost:5432/shipeasy_dev"
  }
]
```

说明：
* 本地调试优先走 `localConnectionString`，便于连接本机数据库并避免依赖线上网络。
* 部署到 Cloudflare 后不会使用 `localConnectionString`，而是使用 `id` 对应的 Hyperdrive 配置。
* 若你不填 `localConnectionString`，本地 CF 调试会走 Hyperdrive 的远端连接路径，调试体验通常更慢且更依赖外网。

### 步骤 3：配置 Secrets

Cloudflare Workers 的敏感配置使用 Secrets（不是 `.env` 文件）：

```bash
# 必填
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put DATABASE_URL

# 按照需要多次放入 serect

# 2) 也可以使用文件进行一次导入
npx wrangler secret bulk .secrets.json
```

上述命令会逐个提示你输入值。  
如果你希望非交互式一次性导入，可使用 `wrangler secret bulk`：


> 建议：`.secrets.json` 仅用于本地临时导入，不要提交到 Git。

非敏感变量建议放在 `wrangler.jsonc` 的 `vars` 中（取消注释后填写）：

```jsonc
"vars": {
  "APP_BASE_URL": "https://your-domain.com",
  "BETTER_AUTH_URL": "https://your-domain.com"
}
```

### 步骤 4：本地预览

先在本地 Workers 模拟环境中验证：

```bash
cd apps/tanstack-app
pnpm dev:cf
```

该命令会以 `CF_DEPLOY=1` 运行 Vite + Cloudflare 插件，从而模拟 Workers 运行时。建议验证：

1. 页面在输出 URL（通常 `http://localhost:7001`）可正常打开
2. 登录 / 注册功能可用
3. 依赖数据库的功能可正常加载
4. API 端点返回符合预期

### 步骤 5：部署上线

```bash
cd apps/tanstack-app
pnpm run deploy:cf
```

该命令执行 `CF_DEPLOY=1 vite build && wrangler deploy`。成功后会输出类似地址：

```
https://tinyship-tanstack.<your-subdomain>.workers.dev
```

### 步骤 6：部署后验证

在部署地址上验证以下端点：

| 检查项 | URL | 期望 |
|-------|-----|------|
| 健康检查 | `/api/health` | 200 OK |
| 首页 | `/en` | 页面正常渲染 |
| 登录页 | `/en/signin` | 登录页可访问 |
| 数据库功能 | `/api/credits/balance`（需会话） | 正常返回余额 |

```bash
# 快速烟雾测试
curl -s -o /dev/null -w "%{http_code}" https://your-worker-url/api/health
```

## 数据库连接

TinyShip 在 Cloudflare Workers 上支持两种数据库方案，选择取决于你希望使用 PostgreSQL 还是 SQLite（D1）：

| 方案 | 数据库 | `DB_DIALECT` | 适用场景 |
|------|--------|-------------|----------|
| **A. Hyperdrive（推荐）** | PostgreSQL | `pg` | 复用已有 PostgreSQL、数据量大、事务密集 |
| **B. Cloudflare D1** | SQLite (D1) | `d1` | All-in Cloudflare、低运维、免费额度友好 |
| **C. Neon Serverless** | PostgreSQL (HTTP) | `pg` | Neon 用户的轻量替代方案 |

### 方案 A：Hyperdrive + PostgreSQL（推荐）

[Hyperdrive](https://developers.cloudflare.com/hyperdrive/) 是 Cloudflare 提供的数据库加速代理，可将 Workers 发起的 TCP 请求代理到你的 PostgreSQL。**无需改 ORM 驱动。**

当前代码库通过 `apps/tanstack-app/src/lib/with-request-db.ts` 中的 `withCfDb` / `withDbContext` 包装器，在每次请求时自动从 `cloudflare:workers` env 获取 Hyperdrive binding 并注入到数据库层：

```typescript
// with-request-db.ts — 自动注入 Hyperdrive binding
async function injectHyperdrive(): Promise<void> {
  const { env } = await import('cloudflare:workers')
  if (env.HYPERDRIVE) {
    setHyperdriveBinding(env.HYPERDRIVE)
  }
}

// libs/database/index.ts — 使用注入的 binding 获取连接串
function getConnectionString(): string {
  if (hyperdriveBinding?.connectionString) {
    return hyperdriveBinding.connectionString;
  }
  return process.env.DATABASE_URL!;
}
```

在 Node.js 环境（Next.js / Nuxt.js）下，`cloudflare:workers` 不可用，`setHyperdriveBinding` 不会被调用，自动回退到 `DATABASE_URL`。

**优势：**

- 无需改 ORM 驱动
- 自动连接池管理
- 全局边缘缓存查询结果
- 与现有代码保持兼容

### 方案 B：Cloudflare D1（SQLite）

[Cloudflare D1](https://developers.cloudflare.com/d1/) 是 Cloudflare 原生的 SQLite 数据库。如果你希望 All-in Cloudflare，不依赖外部 PostgreSQL 服务，D1 是最佳选择。

TinyShip 已内置 D1 支持：SQLite 和 D1 共用同一套 `schema/sqlite/` 定义，区别只在驱动层。

#### 1. 创建 D1 数据库

```bash
cd apps/tanstack-app
npx wrangler d1 create tinyship-db
```

执行后会返回 `database_id`，记录下来。

#### 2. 配置 `wrangler.jsonc`

在 `wrangler.jsonc` 中添加 D1 绑定，并在 `vars` 中设置 `DB_DIALECT`：

```jsonc
{
  "vars": {
    "DB_DIALECT": "d1",
    "APP_BASE_URL": "https://your-domain.com",
    "BETTER_AUTH_URL": "https://your-domain.com"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "tinyship-db",
      "database_id": "<your-d1-database-id>"
    }
  ]
}
```

> **注意**：使用 D1 时请移除或注释掉 `hyperdrive` 配置，两者不需要同时启用。

#### 3. 初始化表结构

将 SQLite schema 推送到 D1：

```bash
# 先在本地生成 SQLite 迁移文件
pnpm db:generate:sqlite

# 应用迁移到远端 D1
npx wrangler d1 migrations apply tinyship-db

# 或者在本地预览环境中应用
npx wrangler d1 migrations apply tinyship-db --local
```

> 迁移文件位于 `libs/database/drizzle-sqlite/` 目录，由 `drizzle-kit` 生成。  
> D1 迁移使用 Wrangler CLI 而非 `pnpm db:push:sqlite`（后者用于本地 SQLite 文件）。

#### 4. 填充数据（可选）

`pnpm db:seed` / `pnpm db:seed:sqlite` 无法直接对 D1 使用（seed 脚本依赖 `better-sqlite3` 本地驱动，无法连接 D1）。  
D1 的数据导入统一使用 `wrangler d1 execute --file` 命令。

**方法 A：部署后通过应用注册（推荐用于生产环境）**

部署上线后直接在应用中注册账户即可，无需预填充数据。

**方法 B：从本地 SQLite 导出后导入 D1**

```bash
# 1. 在 monorepo 根目录填充本地 SQLite 测试数据
pnpm db:seed:sqlite

# 2. 导出纯 INSERT 语句（按外键依赖顺序：user → account → blog_post）
#    注意：.dump 会包含 CREATE TABLE，已通过迁移建表时只需 INSERT
{
  echo "PRAGMA foreign_keys=OFF;"
  sqlite3 data/local.sqlite '.mode insert' '.dump user'    | grep '^INSERT'
  sqlite3 data/local.sqlite '.mode insert' '.dump account' | grep '^INSERT'
  sqlite3 data/local.sqlite '.mode insert' '.dump blog_post' | grep '^INSERT'
} > data/seed-data.sql

# 3. 在 apps/tanstack-app 目录下执行 wrangler 命令
cd apps/tanstack-app

# 导入到远端 D1
npx wrangler d1 execute tinyship-db --remote --file=../../data/seed-data.sql

# 或导入到本地 D1 预览环境
npx wrangler d1 execute tinyship-db --local --file=../../data/seed-data.sql

# 4. 验证数据
npx wrangler d1 execute tinyship-db --remote --command "SELECT email, name, role FROM user"
```

> **路径说明**：`wrangler` 必须在 `apps/tanstack-app` 目录运行（读取 `wrangler.jsonc`），  
> SQL 文件路径需用 `../../data/` 指向 monorepo 根目录。


#### 5. 本地预览

```bash
cd apps/tanstack-app

# 使用 D1 本地模拟运行
DB_DIALECT=d1 pnpm dev:cf
```

Wrangler 会在本地使用 `.wrangler/state/` 目录中的 SQLite 文件来模拟 D1。

#### 6. 部署上线

```bash
cd apps/tanstack-app
pnpm run deploy:cf
```

#### D1 技术细节

代码层面，D1 驱动通过 `cloudflare:workers` 模块获取 D1 binding（`apps/tanstack-app/src/lib/with-request-db.ts`）：

- 通过 `import { env } from 'cloudflare:workers'` 获取 Workers 环境绑定
- API 路由使用 `withCfDb()` 包装器自动注入 D1 连接
- Server Functions 使用 `withDbContext()` 获取 D1 binding
- 所有数据库访问在请求上下文内通过 `AsyncLocalStorage` 自动使用正确的 D1 连接

#### D1 限制

| 限制 | 说明 |
|------|------|
| **单写入** | D1 同一时刻只有一个写入器，高并发写入可能受限 |
| **存储上限** | 免费版 5 GB，付费版 10 GB |
| **行大小** | 单行最大 1 MB |
| **无 JSONB** | 使用 `text` + JSON 序列化代替（代码库已处理） |
| **无 PG 特有操作符** | `->`, `->>`, `@>` 等不可用（代码库已使用兼容写法） |

#### Hyperdrive vs D1 选型

| 考虑因素 | Hyperdrive + PostgreSQL | D1 |
|---------|------------------------|-----|
| **数据量** | 无限制 | 5-10 GB |
| **写入并发** | 高 | 受单写入限制 |
| **成本** | 需外部 PG 服务费用 | 含在 Workers 账单内，免费额度大 |
| **运维复杂度** | 需管理 PG 实例 + Hyperdrive | 全托管，零运维 |
| **与 Next/Nuxt 统一** | ✅ 三个应用使用同一 PG 实例 | ❌ D1 仅限 Workers（TanStack Start） |
| **迁移回传统部署** | 容易 | 需迁移数据到 PG |

> **提示**：如果你同时部署 Next.js / Nuxt.js（Node.js 环境）和 TanStack Start（Workers），推荐使用 Hyperdrive + PostgreSQL 保持三个应用的数据库统一。  
> 如果只部署 TanStack Start 并希望 All-in Cloudflare（Workers + D1 + R2），D1 是更简洁的选择。

### 方案 C：Neon Serverless Driver

如果你使用 [Neon](https://neon.tech) 托管 PostgreSQL，可使用其 HTTP 驱动：

```bash
pnpm add @neondatabase/serverless drizzle-orm/neon-http
```

```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

> **注意**：该方案需要改 `libs/database` 驱动实现，可能影响 Next.js 与 Nuxt.js。建议配合条件导入或环境变量开关使用。

## 环境变量与 Secrets

### Secrets（敏感，建议通过 CLI 或 Web 控制台配置）

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `BETTER_AUTH_SECRET` | 是 | 认证加密密钥 |
| `DATABASE_URL` | 使用 PG 时必填 | PostgreSQL 连接串（Hyperdrive 未就绪时或 Node.js 环境下的回退连接） |
| `STRIPE_SECRET_KEY` | 使用 Stripe 时必填 | Stripe API Key |
| `STRIPE_WEBHOOK_SECRET` | 使用 Stripe 时必填 | Stripe Webhook 签名密钥 |
| `PAYPAL_CLIENT_SECRET` | 使用 PayPal 时必填 | PayPal API Secret |
| `CREEM_API_KEY` | 使用 Creem 时必填 | Creem API Key |
| `OPENAI_API_KEY` | 使用 OpenAI 时必填 | OpenAI API Key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | 使用 Google AI 时必填 | Google AI API Key |

### Vars（非敏感，建议写在 `wrangler.jsonc`）

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `APP_BASE_URL` | 是 | 生产环境域名（如 `https://your-domain.com`） |
| `BETTER_AUTH_URL` | 是 | Better Auth 使用的站点基地址（通常与 `APP_BASE_URL` 一致） |

## CI/CD

### GitHub Actions

```yaml
name: Deploy TanStack to Cloudflare Workers

on:
  push:
    branches: [main]
    paths:
      - 'apps/tanstack-app/**'
      - 'libs/**'
      - 'config/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install pnpm
        run: npm install -g pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Build and Deploy
        working-directory: apps/tanstack-app
        run: pnpm run deploy:cf
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

### Cloudflare Workers Builds

也可使用 Cloudflare 内置 CI/CD：

1. 打开 Cloudflare Dashboard → Workers & Pages → Create Worker
2. 连接 GitHub 仓库
3. 设置构建命令：`pnpm install && pnpm --filter @tinyship/tanstack-app build`
4. 设置输出目录：`apps/tanstack-app/.output`
5. 后续 push 自动触发部署

## CF 模式工作原理（开发者说明）

Cloudflare 集成采用**按需启用（opt-in）**方案，不影响常规开发：

```
┌─────────────────────────────────────────────────┐
│  pnpm dev          (常规开发)                   │
│  → Vite dev server, Node.js, DATABASE_URL       │
│  → 不设置 CF_DEPLOY                             │
│  → 不加载 cloudflare() 插件                     │
├─────────────────────────────────────────────────┤
│  pnpm dev:cf       (CF 本地预览)                │
│  → CF_DEPLOY=1 → 加载 cloudflare() 插件         │
│  → Vite + Cloudflare 插件模拟 Workers 运行时     │
│  → 使用 Hyperdrive 或 DATABASE_URL              │
├─────────────────────────────────────────────────┤
│  pnpm run deploy:cf (生产部署)                  │
│  → CF_DEPLOY=1 → 加载 cloudflare() 插件         │
│  → vite build → 产出 Workers 兼容构建           │
│  → wrangler deploy → 发布到边缘网络             │
└─────────────────────────────────────────────────┘
```

关键机制：`vite.config.ts` 会检查 `process.env.CF_DEPLOY`，仅在该变量存在时才动态导入 `@cloudflare/vite-plugin`。这意味着：

- `pnpm dev` / `pnpm build`：纯 Vite/Node.js 流程，无 CF 额外开销
- `pnpm dev:cf` / `pnpm run deploy:cf`：走 Workers 兼容构建流程

## 故障排查

### 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `TypeError: Cannot read properties of undefined (reading 'connect')` | `pg` 在 Workers 中尝试 TCP 连接 | 配置 Hyperdrive 或改用 Neon 驱动 |
| `Error: No such module "node:..."` | 缺少 `nodejs_compat` 标志 | 在 `wrangler.jsonc` 中确认 `"compatibility_flags": ["nodejs_compat"]` |
| `Worker exceeded CPU time limit` | 请求处理时间过长 | 优化查询、使用流式处理或升级付费版 |
| `Request body too large` | 上传超过限制 | 使用 Cloudflare R2 直传或分片上传 |
| `Module not found: bcrypt` | 原生 C++ 扩展不兼容 | 替换为纯 JS 实现（如 `bcryptjs`） |
| 环境变量不生效 | Workers 不读取 `.env` 文件 | 使用 `wrangler secret put` 或控制台 Secrets |
| `pnpm dev` 行为异常 | 不应在常规开发加载 CF 插件 | 检查 Shell 中是否意外设置了 `CF_DEPLOY` |

### 调试命令

```bash
cd apps/tanstack-app

# 查看线上实时日志
npx wrangler tail

# 查看部署历史
npx wrangler deployments list

# 回滚到上一版本
npx wrangler rollback
```

### 性能监控

部署后可在 Cloudflare Dashboard 查看：

- 请求量与响应耗时
- CPU 使用率
- 错误率和错误详情
- 地域分布情况

---

## 与其他部署方式对比

| 特性 | Cloudflare Workers | Docker | Vercel | 传统部署 |
|------|--------------------|--------|--------|----------|
| **适用框架** | TanStack Start | 全部 | Next.js | 全部 |
| **冷启动** | < 5ms | 无（常驻） | ~250ms | 无 |
| **全球分发** | 自动 | 手动 | 自动 | 手动 |
| **免费额度** | 10 万次/天 | 无 | 有限 | 无 |
| **数据库支持** | Hyperdrive 或 D1 | 原生 TCP | 原生 TCP | 原生 TCP |
| **上传限制** | 100MB / 500MB | 无限制 | 50MB | 无限制 |
| **运维成本** | 很低 | 中等 | 低 | 高 |

Cloudflare Workers 适合追求**高性能、全球覆盖、低运维**的场景。如果你对数据库连接方式或执行时限有顾虑，可优先考虑 Docker 或传统部署。
