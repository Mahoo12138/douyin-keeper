# 传统部署指南

本指南介绍如何在传统服务器环境中部署 TinyShip 项目的 Next.js、Nuxt.js 和 TanStack Start 应用。

## 📑 目录

- [📋 部署前准备](#-部署前准备)
  - [服务器环境要求](#服务器环境要求)
  - [环境变量配置](#环境变量配置)
  - [数据库准备](#数据库准备)
- [🚀 Next.js 部署](#-nextjs-部署)
  - [完整部署流程](#完整部署流程)
  - [快速启动（适用于已部署项目）](#快速启动适用于已部署项目)
- [🎯 Nuxt.js 部署](#-nuxtjs-部署)
  - [完整部署流程](#完整部署流程-1)
  - [快速启动（适用于已部署项目）](#快速启动适用于已部署项目-1)
- [⚡ TanStack Start 部署](#-tanstack-start-部署)
  - [完整部署流程](#完整部署流程-2)
  - [快速启动（适用于已部署项目）](#快速启动适用于已部署项目-2)
- [🔧 进程管理](#-进程管理)
  - [PM2 常用命令](#pm2-常用命令)
  - [端口配置说明](#端口配置说明)
- [🔍 健康检查](#-健康检查)
  - [应用监控](#应用监控)
- [🚨 故障排除](#-故障排除)
  - [常见问题](#常见问题)
  - [内存不足问题解决方案](#内存不足问题解决方案)
  - [日志查看](#日志查看)

## 📋 部署前准备

### 服务器环境要求

**基础环境：**
- **Node.js**: v22+ (LTS 推荐)
- **pnpm**: v9.4.0+
- **Git**: 用于代码拉取
- **PM2**: 进程管理 (可选，推荐)

**快速安装：**
```bash
# 安装 Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 pnpm
npm install -g pnpm

# 安装 PM2 (可选)
npm install -g pm2
```

### 环境变量配置

项目使用根目录的 `.env` 文件统一管理环境变量：

```bash
# 应用配置
NODE_ENV=production
APP_BASE_URL=https://yourdomain.com

# 数据库
DATABASE_URL="postgresql://user:password@host:5432/database"

# 认证
BETTER_AUTH_SECRET="your-production-secret-key"
BETTER_AUTH_URL="https://yourdomain.com"

# 邮件服务
RESEND_API_KEY="your-resend-api-key"
EMAIL_DEFAULT_FROM="noreply@yourdomain.com"

# 其他服务配置...
```

**环境变量加载机制：**
- **Next.js**: `next.config.ts` 自动加载根目录 `.env` 文件
- **Nuxt.js**: 启动脚本使用 `--env-file=../../.env` 参数
- **TanStack Start**: `vite.config.ts` 通过 `dotenv` 加载根目录 `.env` 文件

### 数据库准备

```bash
# 生成迁移文件
pnpm db:generate

# 执行数据库迁移
pnpm db:migrate

# 检查数据库连接
pnpm db:check
```

## 🚀 Next.js 部署

### 完整部署流程

```bash
# 1. 克隆代码
git clone <your-repo-url> tinyship
cd tinyship

# 2. 配置环境变量
cp env.example .env
# 编辑 .env 文件配置生产环境变量

# 3. 安装依赖
pnpm install

# 4. 数据库迁移
pnpm db:generate
pnpm db:migrate

# 5. 构建应用（如果 VPS 内存不足，添加内存限制）
pnpm build:next
# 或者使用内存限制：NODE_OPTIONS="--max-old-space-size=4096" pnpm build:next

# 6. 启动生产服务器
NODE_ENV=production pnpm start:next

# 7. 使用 PM2 管理进程（推荐）
pm2 start "pnpm start:next" --name "tinyship-next"
pm2 save
pm2 startup
```

### 快速启动（适用于已部署项目）

如果你已经完成了上述完整部署流程，后续重启应用时可以使用以下快速命令：

```bash
# 1. 构建应用
pnpm build:next
# 如果内存不足：NODE_OPTIONS="--max-old-space-size=4096" pnpm build:next

# 2. 启动生产服务器（端口 7001）
pnpm start:next

# 3. 使用 PM2 管理进程（推荐）
pm2 start "pnpm start:next" --name "tinyship-next"
```

**可用的启动命令：**
- `pnpm start:next` - 使用 Turbo 启动（推荐）
- `cd apps/next-app && pnpm start` - 直接启动

## 🎯 Nuxt.js 部署

### 完整部署流程

```bash
# 1. 克隆代码
git clone <your-repo-url> tinyship
cd tinyship

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件配置生产环境变量

# 3. 安装依赖
pnpm install

# 4. 数据库迁移
pnpm db:generate
pnpm db:migrate

# 5. 构建应用（如果 VPS 内存不足，添加内存限制）
pnpm build:nuxt
# 或者使用内存限制：NODE_OPTIONS="--max-old-space-size=4096" pnpm build:nuxt

# 6. 启动服务器（自动加载环境变量）
NODE_ENV=production pnpm start:nuxt

# 7. 或者直接启动构建输出
NODE_ENV=production node --env-file=.env apps/nuxt-app/.output/server/index.mjs

# 8. 使用 PM2 管理（推荐）
pm2 start "pnpm start:nuxt" --name "tinyship-nuxt"
pm2 save
pm2 startup
```

### 快速启动（适用于已部署项目）

如果你已经完成了上述完整部署流程，后续重启应用时可以使用以下快速命令：

```bash
# 1. 构建应用
pnpm build:nuxt
# 如果内存不足：NODE_OPTIONS="--max-old-space-size=4096" pnpm build:nuxt

# 2. 启动生产服务器（端口 7001）
pnpm start:nuxt

# 3. 使用 PM2 管理（推荐）
pm2 start "pnpm start:nuxt" --name "tinyship-nuxt"
```

**可用的启动命令：**
- `pnpm start:nuxt` - 使用 Turbo 启动（推荐）
- `cd apps/nuxt-app && pnpm start` - 直接启动

## ⚡ TanStack Start 部署

TanStack Start 的传统部署方式与 Next.js 类似，构建后产出 `.output/server/index.mjs`，通过 Node.js 启动。

> **提示**：TanStack Start 还支持 Cloudflare Workers 边缘部署，详见 [Cloudflare Workers 部署指南](./cloudflare-workers.md)。

### 完整部署流程

```bash
# 1. 克隆代码
git clone <your-repo-url> tinyship
cd tinyship

# 2. 配置环境变量
cp env.example .env
# 编辑 .env 文件配置生产环境变量

# 3. 安装依赖
pnpm install

# 4. 数据库迁移
pnpm db:generate
pnpm db:migrate

# 5. 构建应用（如果 VPS 内存不足，添加内存限制）
pnpm build:tanstack
# 或者使用内存限制：NODE_OPTIONS="--max-old-space-size=4096" pnpm build:tanstack

# 6. 启动生产服务器
NODE_ENV=production pnpm start:tanstack

# 7. 使用 PM2 管理进程（推荐）
pm2 start "pnpm start:tanstack" --name "tinyship-tanstack"
pm2 save
pm2 startup
```

### 快速启动（适用于已部署项目）

如果你已经完成了上述完整部署流程，后续重启应用时可以使用以下快速命令：

```bash
# 1. 构建应用
pnpm build:tanstack
# 如果内存不足：NODE_OPTIONS="--max-old-space-size=4096" pnpm build:tanstack

# 2. 启动生产服务器（端口 7001）
pnpm start:tanstack

# 3. 使用 PM2 管理进程（推荐）
pm2 start "pnpm start:tanstack" --name "tinyship-tanstack"
```

**可用的启动命令：**
- `pnpm start:tanstack` - 使用 Turbo 启动（推荐）
- `cd apps/tanstack-app && pnpm start` - 直接启动

## 🔧 进程管理

### PM2 常用命令

```bash
# 查看进程状态
pm2 status

# 查看日志
pm2 logs
pm2 logs tinyship-next
pm2 logs tinyship-nuxt
pm2 logs tinyship-tanstack

# 重启应用
pm2 restart tinyship-next
pm2 restart tinyship-nuxt
pm2 restart tinyship-tanstack

# 停止应用
pm2 stop tinyship-next
pm2 delete tinyship-next

# 保存进程列表
pm2 save

# 设置开机自启
pm2 startup
```

### 端口配置说明

- **开发环境端口**: 7001
- **生产环境端口**: 7001
- **注意**: Next.js、Nuxt.js 和 TanStack Start 都默认使用 7001 端口，不能同时启动

## 🔍 健康检查

### 应用监控

项目已内置健康检查端点：

- **Next.js**: `http://localhost:7001/api/health`
- **Nuxt.js**: `http://localhost:7001/api/health`
- **TanStack Start**: `http://localhost:7001/api/health`

**服务检查命令：**

```bash
# 检查数据库连接
pnpm db:check

# 检查应用健康状态
curl http://localhost:7001/api/health
```

## 🚨 故障排除

### 常见问题

| 问题 | 解决方案 |
|------|----------|
| 构建失败 | 检查环境变量和依赖版本 |
| 数据库连接错误 | 验证 DATABASE_URL 和网络配置 |
| 静态资源 404 | 检查静态文件路径和 CDN 配置 |
| 权限错误 | 确认认证服务配置正确 |
| 端口占用 | 检查是否有其他服务占用 7001 端口 |
| 环境变量缺失 | 确认 .env 文件存在且格式正确 |
| Turbo 缓存问题 | 运行 `pnpm clean` 清理缓存 |
| **内存不足错误** | **增加 Node.js 内存限制（见下方详细说明）** |

### 内存不足问题解决方案

**问题现象：**
```bash
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

**解决方案：**

1. **临时解决**（单次构建）：
   ```bash
   # 增加内存限制到 4GB
   NODE_OPTIONS="--max-old-space-size=4096" pnpm build:next
   NODE_OPTIONS="--max-old-space-size=4096" pnpm build:nuxt
   NODE_OPTIONS="--max-old-space-size=4096" pnpm build:tanstack
   ```

2. **永久配置**（推荐）：
   在 `.bashrc` 或 `.profile` 中添加：
   ```bash
   # 编辑配置文件
   nano ~/.bashrc
   
   # 添加以下行
   export NODE_OPTIONS="--max-old-space-size=4096"
   
   # 重新加载配置
   source ~/.bashrc
   ```

3. **PM2 配置**：
   ```bash
   # 创建 PM2 配置文件
   cat > ecosystem.config.js << 'EOF'
   module.exports = {
     apps: [{
       name: 'tinyship-next',
       script: 'pnpm',
       args: 'start:next',
       node_args: '--max-old-space-size=4096',
       env: {
         NODE_ENV: 'production'
       }
     }]
   }
   EOF
   
   # 使用配置文件启动
   pm2 start ecosystem.config.js
   ```

**内存配置建议：**
- **1GB VPS**: `--max-old-space-size=1024`
- **2GB VPS**: `--max-old-space-size=2048` 
- **4GB+ VPS**: `--max-old-space-size=4096`

**注意事项：**
- 内存设置不要超过服务器物理内存的 80%
- 构建过程是临时的，构建完成后内存占用会大幅下降
- 如果仍然内存不足，考虑在本地构建后上传构建产物

### 日志查看

```bash
# PM2 日志
pm2 logs

# 查看特定应用日志
pm2 logs tinyship-next
pm2 logs tinyship-nuxt
pm2 logs tinyship-tanstack

# Turbo 日志
turbo run build --verbosity=2

# 系统日志
tail -f /var/log/nginx/error.log
```

---

传统部署简单直接，适合开发和测试环境。对于生产环境，建议考虑 Docker 部署或云平台部署。 