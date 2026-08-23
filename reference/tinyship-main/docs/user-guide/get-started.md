# 快速开始

本指南将帮助你在本地环境中设置和运行 TinyShip 项目。

## 📑 目录

- [📋 系统要求](#-系统要求)
  - [必需软件](#必需软件)
- [🚀 快速安装](#-快速安装)
  - [1. 克隆项目](#1-克隆项目)
  - [2. 安装 AI Agent Skills（可选，推荐）](#2-安装-ai-agent-skills可选推荐)
  - [3. 安装 PNPM（如果尚未安装）](#3-安装-pnpm如果尚未安装)
  - [4. 复制环境变量模板](#4-复制环境变量模板)
  - [5. 安装项目依赖](#5-安装项目依赖)
- [🗄️ 数据库配置](#️-数据库配置)
  - [1. PostgreSQL（默认、推荐、最稳）](#1-postgresql默认推荐最稳)
  - [2. SQLite（可选，与 D1 兼容）](#2-sqlite可选与-d1-兼容)
  - [3. D1 与 SQLite 的关系](#3-d1-与-sqlite-的关系)
- [🔐 最小化认证配置](#-最小化认证配置)
- [🎉 启动应用](#-启动应用)

## 📋 系统要求

在开始之前，请确保你的开发环境满足以下要求：

### 必需软件
- **Node.js**: >= 22.20.0 （**必须使用 22.20.0 或更高的 LTS 版本**）
  > ⚠️ **重要提示**：由于 Nuxt 4 使用的 [oxc-parser 原生绑定问题](https://github.com/nuxt/nuxt/issues/33480)，Node.js 版本必须 >= 22.20.0。低于此版本可能导致安装失败。
- **PNPM**: >= 9.0.0 （推荐的包管理器）
- **SQLite / PostgreSQL**: 二选一（本地开发推荐 SQLite）


## 🚀 快速安装

### 1. 克隆项目

```bash
# 克隆仓库
git clone https://github.com/TinyshipCN/tinyship.git
cd tinyship

# 或者使用 SSH
git clone git@github.com:TinyshipCN/tinyship.git
cd tinyship
```

### 2. 安装 AI Agent Skills（可选，推荐）

如果你使用 AI 编辑器（Cursor、Claude Code、Codex、OpenCode 等），现在就可以安装 [TinyShip Agent Skills](https://github.com/TinyshipCN/tinyship-skills) 获得 AI 引导式配置体验：

```bash
npx skills add TinyshipCN/tinyship-skills
```

安装后，你可以直接对 AI 说「帮我设置 TinyShip」、「all-in Cloudflare」、「配置 Stripe 支付」等，AI 会按照 Skills 中的步骤交互式引导你完成配置。支持 67+ AI 编辑器。

### 3. 安装 PNPM（如果尚未安装）

```bash
# 使用 npm 安装 pnpm
npm install -g pnpm

# 或使用 corepack (Node.js 16.10+)
corepack enable
corepack prepare pnpm@latest --activate
# 验证安装
pnpm --version
```

### 4. 复制环境变量模板

```bash
# 复制环境变量模板
cp env.example .env
```

### 5. 安装项目依赖

```bash
# 安装所有依赖
pnpm install
```

## 🗄️ 数据库配置

TinyShip 默认并推荐使用 PostgreSQL（`pg`），这是当前项目最稳定、最完整验证的数据库方案。  
同时也支持 `sqlite`（本地文件）和 `d1`（Cloudflare D1）作为补充场景。

### 1. PostgreSQL（默认、推荐、最稳）

我们需要在 PostgreSQL中 创建一个新的数据库来使用 tinyship，下面是三种推荐的方式。

#### 方法 1: 使用 Docker（推荐）
```bash
# 拉取并运行 PostgreSQL 容器
docker run --name tinyship-db \
  -e POSTGRES_USER=tinyship \
  -e POSTGRES_PASSWORD=your_password \
  -e POSTGRES_DB=tinyship \
  -p 5432:5432 \
  -d postgres:15

# 验证容器运行
docker ps | grep tinyship-db
```

#### 方法 2: 本地安装
```bash
# 创建数据库用户和数据库
sudo -u postgres createuser --interactive tinyship
sudo -u postgres createdb tinyship --owner=tinyship

# 设置用户密码
sudo -u postgres psql -c "ALTER USER tinyship PASSWORD 'your_password';"
```

#### 方法 3: 云数据库服务
支持以下云服务提供商：
- **Vercel Postgres**: 与 Vercel 部署无缝集成
- **Supabase**: 提供免费套餐，易于设置
- **AWS RDS**: 企业级选择
- **Google Cloud SQL**: 可靠的托管服务
- **阿里云 RDS**: 国内用户推荐

在项目根目录 `.env` 文件中配置数据库连接：

```env
# 默认就是 pg，可不写 DB_DIALECT
DB_DIALECT="pg"
DATABASE_URL="postgresql://username:password@localhost:5432/tinyship"
```

```bash
# 检查数据库连接
pnpm db:check
# 初始化表结构
pnpm db:push
# 填充测试数据
pnpm db:seed
```

这将创建两个测试用户：
- **管理员**: `admin@example.com` / `admin123` (角色: admin)
- **普通用户**: `user@example.com` / `user123456` (角色: user)

两个用户都已验证邮箱，可以直接登录系统进行测试。

### 2. SQLite（可选，与 D1 兼容）

如果你希望未来使用 Cloudflare D1，或希望采用 SQLite 技术栈，也可以使用 SQLite 作为数据库选项：

```env
DB_DIALECT="sqlite"
# 可选：不配置时默认 ./data/local.sqlite
# SQLITE_DB_PATH="./data/local.sqlite"
```

```bash
pnpm db:check:sqlite
pnpm db:push:sqlite
pnpm db:seed:sqlite
pnpm db:studio:sqlite
```

### 3. D1 与 SQLite 的关系

- `sqlite`: 标准 SQLite 实现（本地运行时使用文件数据库）
- `d1`: Cloudflare Workers 上的托管 SQLite（运行在云端，不是本地文件）
- 代码层面两者复用同一套 SQLite schema；区别主要在运行环境和驱动  
- 如果你的目标是 Cloudflare Workers 线上部署，可以在部署环境使用 `DB_DIALECT="d1"`

## 🔐 最小化认证配置

在 `.env` 文件中配置认证相关环境变量：

```env
# 认证配置
BETTER_AUTH_SECRET="your-secret-key-here-32-characters-min" # 32位随机数
BETTER_AUTH_URL="http://localhost:7001"  # 7001端口是应用启动的默认端口，生产环境改为实际域名

# 数据库配置（认证需要，上一步应该已经配置）
# 推荐：PostgreSQL
DB_DIALECT="pg"
DATABASE_URL="postgresql://username:password@localhost:5432/tinyship"

# 可选：SQLite（与 D1 兼容）
# DB_DIALECT="sqlite"
# SQLITE_DB_PATH="./data/local.sqlite"
```

**生成 32 位随机字符串的方法：**

命令行生成：
```bash
# 使用 openssl 生成（推荐）
openssl rand -hex 32

# 使用 Node.js 生成
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 使用 Python 生成
python -c "import secrets; print(secrets.token_hex(32))"
```

在线生成器：
- [RandomKeygen](https://randomkeygen.com/) - 提供多种格式的随机密钥生成
- [Password Generator](https://passwordsgenerator.net/) - 可自定义长度和字符类型

## 🎉 启动应用

现在我们的应用应该就可以最小化运行了 🎉🎉🎉，可以在根目录运行如下命令来启动应用：

```bash
# 启动 Next.js 应用
pnpm run dev:next
# 或者启动 Nuxt.js 应用
pnpm run dev:nuxt
# 或者启动 TanStack Start 应用
pnpm run dev:tanstack
# 访问 http://localhost:7001
```

你可以先感受一下大体的功能，现在是最小化应用，一些高级的配置还没有实现（更多登录方式/支付等等）。
---

🎊 **恭喜！** 你已经成功运行了 TinyShip 应用。

接下来，你可以根据需要进行更多配置：
- [数据库配置](./database.md) - 多方言详解（PostgreSQL / SQLite / D1）
- [基础配置](./basic-config.md) - 应用名称、Logo、主题、国际化
- [身份认证配置](./auth/overview.md) - 更多登录方式
- [支付配置](./payment/overview.md) - 接入支付功能
- [应用部署](./deployment/overview.md) - 部署到生产环境

如果遇到问题，请在 [GitHub Discussion](https://github.com/orgs/TinyshipCN/discussions) 或者 [Tinyship Issues](https://github.com/TinyshipCN/tinyship/issues)中提交问题。
