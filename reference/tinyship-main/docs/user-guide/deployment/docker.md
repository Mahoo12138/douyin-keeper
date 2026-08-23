# Docker 部署指南

本指南介绍如何使用 Docker 容器化部署 TinyShip 项目的 Next.js、Nuxt.js 和 TanStack Start 应用。

## 📑 目录

- [🚀 推荐方式：Docker Compose](#-推荐方式docker-compose)
- [🔧 手动 Docker 部署](#-手动-docker-部署)
  - [Next.js 部署](#nextjs-部署)
  - [Nuxt.js 部署](#nuxtjs-部署)
  - [TanStack Start 部署](#tanstack-start-部署)
- [⚠️ 重要提醒](#️-重要提醒)
  - [构建路径](#构建路径)
  - [构建依赖](#构建依赖)
  - [跨框架兼容性](#跨框架兼容性)
  - [构建时环境变量](#构建时环境变量)
- [🗃️ 数据库连接配置](#️-数据库连接配置)
  - [PostgreSQL（默认）](#postgresql默认)
  - [SQLite（可选）](#sqlite可选)
- [🐳 Docker Compose 详细说明](#-docker-compose-详细说明)
  - [使用命令](#使用命令)
  - [重启策略](#重启策略)
  - [优势](#优势)
- [📋 环境变量示例](#-环境变量示例)
- [🔧 常用命令](#-常用命令)
- [🚨 故障排除](#-故障排除)
  - [常见问题](#常见问题)
  - [日志调试](#日志调试)
  - [性能优化](#性能优化)

## 🚀 推荐方式：Docker Compose

使用项目根目录的 `docker-compose.yml` 文件：

```bash
# 启动 Next.js 应用
docker compose --profile next up -d

# 启动 Nuxt.js 应用  
docker compose --profile nuxt up -d

# 启动 TanStack Start 应用
docker compose --profile tanstack up -d

# 查看日志
docker compose logs -f

# 停止应用
docker compose down
```

## 🔧 手动 Docker 部署

### Next.js 部署

```bash
# 1. 确保项目根目录有 .env 文件，然后构建镜像
docker build -t tinyship-next -f apps/next-app/Dockerfile .

# 2. 运行容器
docker run -d \
  --name tinyship-next \
  -p 7001:7001 \
  --env-file .env \
  --restart unless-stopped \
  tinyship-next
```

### Nuxt.js 部署

```bash
# 1. 确保项目根目录有 .env 文件，然后构建镜像
docker build -t tinyship-nuxt -f apps/nuxt-app/Dockerfile .

# 2. 运行容器
docker run -d \
  --name tinyship-nuxt \
  -p 7001:7001 \
  --env-file .env \
  --restart unless-stopped
  tinyship-nuxt
```

### TanStack Start 部署

TanStack Start 的 Docker 部署方式与 Next.js 和 Nuxt.js 完全一致，使用独立的 Dockerfile 构建。

> **提示**：TanStack Start 还支持 Cloudflare Workers 边缘部署（无需 Docker），详见 [Cloudflare Workers 部署指南](./cloudflare-workers.md)。

```bash
# 1. 确保项目根目录有 .env 文件，然后构建镜像
docker build -t tinyship-tanstack -f apps/tanstack-app/Dockerfile .

# 2. 运行容器
docker run -d \
  --name tinyship-tanstack \
  -p 7001:7001 \
  --env-file .env \
  --restart unless-stopped \
  tinyship-tanstack
```

## ⚠️ 重要提醒

### 构建路径
- **必须在项目根目录**运行 `docker build` 命令
- 使用 `-f` 参数指定 Dockerfile 路径
- 构建上下文是项目根目录 (`.`)

### 构建依赖
Dockerfile 会自动复制这些必要的配置文件：
- `turbo.json` - Turbo 构建配置
- `config.ts` - 应用配置文件
- `tsconfig.json` - TypeScript 路径别名
- `libs/` - 共享库目录

### 跨框架兼容性
项目中的 `libs/auth/authClient.ts` 同时支持 React 和 Vue：
- Next.js 项目需要 Vue 作为 devDependency (已配置)
- 这是因为 better-auth 库会尝试导入 Vue 模块
- 在 Nuxt.js 中通过 `build.rollupOptions.external` 配置忽略 Next.js 模块

### 构建时环境变量

支持两种构建模式，**自动适配不同环境**：

#### **本地开发构建**
- Dockerfile 会自动复制项目根目录的 `.env` 文件 (如果存在)
- **前端公开变量自动读取**：
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` - Cloudflare Turnstile 验证码站点密钥  
  - `NEXT_PUBLIC_WECHAT_APP_ID` - 微信登录应用 ID
- **无需任何额外参数**，一行命令构建

#### **CI/CD 环境构建**
- 支持通过 `--build-arg` 传入环境变量
- GitHub Actions/其他 CI 环境中没有 `.env` 文件也能正常构建
- 优先级：构建参数 > .env 文件 > 默认值

#### **环境变量优先级**
1. Docker build args (CI/CD 环境)
2. .env 文件内容 (本地开发)  
3. nuxt.config.ts 中的默认值 (fallback)

## 🗃️ 数据库连接配置

### PostgreSQL（默认）

Docker 容器中**不能使用 `localhost`** 连接宿主机服务：

```bash
# ❌ 错误 - 容器内访问不到宿主机的 localhost
DATABASE_URL=postgresql://localhost:5432/db

# ✅ 正确 - 连接宿主机数据库
# Mac/Windows Docker Desktop:
DATABASE_URL=postgresql://viking@host.docker.internal:5432/tinyship_dev

# Linux VPS (两种方式):
# 方式1: 网桥模式 (默认)
DATABASE_URL=postgresql://viking@172.17.0.1:5432/tinyship_dev
# 方式2: 主机网络模式 (推荐，更可靠)
# 使用 --network host 参数，然后可以直接用 localhost
DATABASE_URL=postgresql://viking@localhost:5432/tinyship_dev

# ✅ 正确 - 连接远程数据库
DATABASE_URL=postgresql://user:pass@your-db-server.com:5432/db
```

**Linux VPS 主机网络模式使用方法：**
```bash
# 使用主机网络运行容器
docker run -d \
  --name tinyship-nuxt \
  --network host \
  --env-file .env \
  --restart unless-stopped \
  tinyship-nuxt
```

**重要提示：**
- 必须明确指定用户名，即使本地不需要用户名也要在 Docker 中指定
- 对于 Homebrew 安装的 PostgreSQL，用户名通常是你的系统用户名
- **Linux VPS 推荐使用主机网络模式**，避免网关地址不一致问题
- 只有数据库等后端服务需要修改连接地址，应用的对外 URL (如 `APP_BASE_URL`) 不需要修改

### SQLite（可选）

如果使用 `DB_DIALECT=sqlite`，SQLite 数据库文件存储在容器内的 `/app/data/` 目录中。**必须使用 Docker Volume 挂载该目录**，否则容器重启后数据会丢失。

```bash
# 1. 在宿主机上准备 SQLite 数据库
#    确保本地已初始化：pnpm db:push:sqlite && pnpm db:seed:sqlite

# 2. 使用 Volume 挂载运行容器
docker run -d \
  --name tinyship-next \
  -p 7001:7001 \
  -e DB_DIALECT=sqlite \
  -e SQLITE_DB_PATH=/app/data/local.sqlite \
  -v tinyship-data:/app/data \
  --env-file .env \
  --restart unless-stopped \
  tinyship-next
```

**首次部署需要初始化数据库：**

```bash
# 方式 1：将本地已有的 SQLite 文件拷贝到 Volume
docker volume create tinyship-data
docker run --rm -v tinyship-data:/data -v $(pwd)/data:/src alpine cp /src/local.sqlite /data/local.sqlite

# 方式 2：在容器内执行初始化（需要进入容器）
docker exec -it tinyship-next /bin/sh
# 容器内无法运行 pnpm db:push:sqlite，建议使用方式 1
```

**SQLite Docker 部署注意事项：**

| 事项 | 说明 |
|------|------|
| **Volume 必须挂载** | 不挂载 Volume 时，容器重启数据会丢失 |
| **SQLITE_DB_PATH** | 容器内路径，建议设置为 `/app/data/local.sqlite` |
| **初始化时机** | 先在本地 `pnpm db:push:sqlite` 创建数据库，再拷贝到 Volume |
| **备份** | 定期备份 Volume 中的 `.sqlite` 文件：`docker cp <container>:/app/data/local.sqlite ./backup.sqlite` |
| **并发写入** | SQLite 是单写入的，高并发写入场景建议使用 PostgreSQL |

## 🐳 Docker Compose 详细说明

### 使用命令

```bash
# 启动 Next.js 应用
docker compose --profile next up -d

# 启动 Nuxt.js 应用
docker compose --profile nuxt up -d

# 启动 TanStack Start 应用
docker compose --profile tanstack up -d

# 重新构建并启动
docker compose --profile next up -d --build

# 查看日志
docker compose logs -f

# 停止应用
docker compose down

# 查看运行状态
docker compose ps
```

### 重启策略

`--restart unless-stopped` 参数含义：
- ✅ **容器崩溃时**：自动重启
- ✅ **Docker 服务重启时**：自动重启容器
- ✅ **服务器重启时**：自动重启容器
- ❌ **手动停止时**：不会重启（`docker stop`）

### 优势

**Docker Compose 优势：**
- 简化命令，无需记住复杂的 docker run 参数
- 自动处理网络和卷配置
- 支持 profiles 分别启动不同应用
- 环境变量通过 `.env` 文件自动加载

## 📋 环境变量示例

创建 `.env` 文件用于 Docker 部署：

```bash
NODE_ENV=production

# --- 数据库配置（二选一）---

# 方案 1：PostgreSQL（默认）
DB_DIALECT=pg
# Mac/Windows Docker Desktop:
# DATABASE_URL=postgresql://viking@host.docker.internal:5432/tinyship_dev
# Linux VPS 网桥模式:
# DATABASE_URL=postgresql://viking@172.17.0.1:5432/tinyship_dev
# Linux VPS 主机网络模式 (推荐):
DATABASE_URL=postgresql://viking@localhost:5432/tinyship_dev

# 方案 2：SQLite（需配合 Volume 挂载）
# DB_DIALECT=sqlite
# SQLITE_DB_PATH=/app/data/local.sqlite

# --- 应用配置 ---
APP_BASE_URL=https://yourdomain.com
BETTER_AUTH_SECRET=your-production-secret-key
BETTER_AUTH_URL=https://yourdomain.com
RESEND_API_KEY=your-resend-api-key
EMAIL_DEFAULT_FROM=noreply@yourdomain.com
```

**重要说明：**
- `NEXT_PUBLIC_*` 变量会在构建时自动从 `.env` 文件读取，编译到前端代码中
- **本地构建**：构建时会自动复制 `.env` 文件，无需额外参数
- **CI/CD 构建**：通过 secrets 和 build args 传入环境变量
- 运行时仍需要 `--env-file .env` 用于其他环境变量（如数据库连接）


## 🔧 常用命令

```bash
# 查看运行中的容器
docker ps

# 查看日志
docker logs tinyship-next
docker logs tinyship-nuxt
docker logs tinyship-tanstack

# 停止容器
docker stop tinyship-next

# 删除容器
docker rm tinyship-next

# 删除镜像
docker rmi tinyship-next

# 进入容器调试
docker exec -it tinyship-next /bin/sh

# 查看容器资源使用
docker stats

# 清理无用的镜像和容器
docker system prune
```

## 🚨 故障排除

### 常见问题

| 问题 | 解决方案 |
|------|----------|
| 构建失败 - lockfile 不兼容 | 检查 pnpm 版本，更新 Dockerfile 中的 pnpm 版本 |
| 找不到 turbo.json | 确保在项目根目录运行 docker build 命令 |
| 数据库连接失败 | 检查 `host.docker.internal` 配置和用户名 |
| SQLite: no such table | 确认已挂载 Volume 且 SQLite 文件已初始化（`pnpm db:push:sqlite`） |
| SQLite: 容器重启后数据丢失 | 必须使用 `-v tinyship-data:/app/data` 挂载 Volume |
| 端口已被占用 | 修改端口映射或停止占用端口的服务 |
| 环境变量未生效 | 检查 `.env` 文件路径和格式 |
| 容器内存不足 | 调整 Docker 内存限制或优化应用 |

### 日志调试

```bash
# 查看构建过程日志
docker build -t tinyship-next -f apps/next-app/Dockerfile . --no-cache

# 查看容器启动日志
docker logs tinyship-next --follow

# 查看 Docker Compose 日志
docker compose logs -f --tail=100

# 查看系统资源使用
docker system df
docker system events
```

### 性能优化

```bash
# 多阶段构建缓存
docker build -t tinyship-next -f apps/next-app/Dockerfile . --target=deps

# 设置资源限制
docker run -d \
  --name tinyship-next \
  --memory=1g \
  --cpus=0.5 \
  -p 7001:7001 \
  tinyship-next

# 使用 Docker Compose 设置资源限制
# 在 docker-compose.yml 中添加：
# deploy:
#   resources:
#     limits:
#       memory: 1G
#       cpus: '0.5'
```

---

Docker 部署提供了隔离、一致的运行环境，适合生产环境使用。通过 Docker Compose 可以大大简化部署流程。 