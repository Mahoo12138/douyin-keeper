# 🧪 本地 E2E 测试完整流程

本文档面向本地开发者，说明如何在 TinyShip 中运行 E2E（Playwright）测试、如何在 Next.js、Nuxt.js 与 TanStack Start 三端做回归，以及推荐的执行节奏。

> 💡 结论先行：E2E 推荐在本地手动运行，不建议作为每次云端 CI 的强制门禁。

## 📑 目录

- [🎯 适用场景](#-适用场景)
- [✅ 前置条件](#-前置条件)
- [🚀 标准执行流程](#-标准执行流程)
  - [步骤 1：安装测试依赖](#步骤-1安装测试依赖)
  - [步骤 2：准备环境变量](#步骤-2准备环境变量)
  - [步骤 3：启动目标应用（Next 或 Nuxt）](#步骤-3启动目标应用next-或-nuxt)
  - [步骤 4：运行 E2E](#步骤-4运行-e2e)
  - [步骤 5：切换到另一端再跑一次](#步骤-5切换到另一端再跑一次)
- [📦 常用命令速查](#-常用命令速查)
- [💳 支付相关测试注意事项](#-支付相关测试注意事项)
- [🧭 推荐测试策略（高效）](#-推荐测试策略高效)
- [🛠️ 常见问题排查](#️-常见问题排查)
- [📚 相关文档](#-相关文档)

## 🎯 适用场景

你在以下场景应运行本地 E2E：

- 开发完成某个 feature 后，验证主流程没有回归
- 修改支付、权限、认证、管理后台等高风险模块后
- 发版前做全量回归（Next + Nuxt + TanStack）

## ✅ 前置条件

### 1) Node.js / pnpm 已安装

确保能在项目根目录执行：

```bash
pnpm -v
node -v
```

### 2) Playwright 与 Chromium 可用

项目当前采用全局安装方式（与 `tests/e2e/AGENTS.md` 保持一致）：

```bash
# 安装 Playwright CLI 与测试包
npm install -g playwright @playwright/test

# 安装 Chromium 浏览器二进制
npx playwright install chromium
```

### 3) 数据库与 `.env` 可用

E2E 包含真实业务链路（认证、支付、AI、积分），需要可用数据库与完整环境变量。  
建议先确认应用可正常本地启动并完成基础登录流程。

### 4) 端口约定

E2E 配置默认使用：

- `http://localhost:7001`

同一时刻只运行一个应用（Next 或 Nuxt）在该端口。

## 🚀 标准执行流程

### 步骤 1：安装测试依赖

首次执行时完成：

```bash
npm install -g playwright @playwright/test
npx playwright install chromium
```

### 步骤 2：准备环境变量

确认 `.env` 中已配置好本次测试相关项，例如：

- 认证配置（邮箱/OAuth/短信按需）
- 支付配置（Stripe / PayPal / Creem 等）
- AI Provider Key（若跑 AI 真实生成测试）
- `DATABASE_URL`

### 步骤 3：启动目标应用（Next 或 Nuxt）

在项目根目录执行其一：

```bash
# 跑 Next.js
pnpm dev:next

# 或跑 Nuxt.js
pnpm dev:nuxt
```

确认服务可访问：

```bash
curl -I http://localhost:7001/en
```

### 步骤 4：运行 E2E

#### 跑全量

```bash
pnpm test:e2e
```

或等价命令：

```bash
npx playwright test --config=tests/e2e/playwright.config.ts
```

#### 跑单文件（推荐日常）

```bash
npx playwright test --config=tests/e2e/playwright.config.ts tests/e2e/specs/admin-filters.spec.ts
```

#### 按关键字筛选

```bash
npx playwright test --config=tests/e2e/playwright.config.ts --grep "Admin Sub-page Filters"
```

### 步骤 5：切换到另一端再跑一次

因为项目要求 Next + Nuxt + TanStack 功能对齐，建议完整验证三端：

1. 停止当前应用（释放 7001 端口）
2. 启动另一个应用（Next ↔ Nuxt）
3. 重复步骤 4

## 📦 常用命令速查

```bash
# 1) 启动 Next
pnpm dev:next

# 2) 启动 Nuxt
pnpm dev:nuxt

# 3) 跑全部 E2E
pnpm test:e2e

# 4) 跑单个 spec
npx playwright test --config=tests/e2e/playwright.config.ts tests/e2e/specs/<name>.spec.ts

# 5) 按 grep 跑
npx playwright test --config=tests/e2e/playwright.config.ts --grep "<keyword>"

# 6) 安装 Chromium
npx playwright install chromium
```

## 💳 支付相关测试注意事项

如果要跑 Stripe 支付链路，请先开启 Stripe CLI 转发：

```bash
stripe listen --forward-to localhost:7001/api/payment/webhook/stripe
```

PayPal / Creem / 微信支付测试依赖各自沙盒或测试环境配置，具体见支付相关指南。

## 🧭 推荐测试策略（高效）

为了平衡速度和质量，建议采用以下节奏：

| 时机 | 推荐范围 | 说明 |
|------|---------|------|
| 日常开发中 | 只跑本次改动相关 spec | 反馈快，迭代成本低 |
| feature 完成时 | 跑相关模块全套 + 三端 | 保证跨框架一致性 |
| 发版前 | 全量回归（三端） | 最终质量闸门 |
| 每次 push CI | typecheck + build | 不建议全量 E2E 上云端 |

> 经验值：全量 E2E 三端耗时较长，且支付/AI 场景依赖外部服务，本地手动回归更可控。

## 🛠️ 常见问题排查

### 1) `Executable doesn't exist` / 找不到浏览器

执行：

```bash
npx playwright install chromium
```

### 2) `No tests found`

- 检查命令中 spec 路径是否正确
- 优先直接传文件名，不要先用复杂 `--grep`

### 3) 页面打不开 / 一直超时

- 确认目标应用运行在 `localhost:7001`
- 确认当前只启动了一个应用（Next 或 Nuxt）

### 4) 支付测试失败

- 确认 Stripe CLI 正在运行并转发 webhook
- 确认 `.env` 中支付密钥、沙盒账号配置正确
- 先单独跑支付 spec，观察控制台日志

### 5) AI 测试失败

- 检查 AI provider API key 是否可用
- 检查积分种子逻辑是否执行成功（相关 spec 已内置种子步骤）

## 📚 相关文档

- [E2E 约定与规范](../../tests/e2e/AGENTS.md)
- [E2E 用例目录与结果追踪](../../tests/e2e/TEST-CATALOG.md)
- [支付测试指南](./payment-testing.md)
- [开发总流程（AGENTS）](../../AGENTS.md)

