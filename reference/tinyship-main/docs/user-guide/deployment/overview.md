# TinyShip 部署指南总览

本指南介绍 TinyShip 项目的各种部署方式，帮助你选择最适合的部署方案。

> 💡 **AI 快速部署：** 已安装 [Agent Skills](https://github.com/TinyshipCN/tinyship-skills) 的用户可以直接对 AI 说「帮我部署」，使用 `tinyship-deploy` skill 交互式完成部署配置。

## 📑 目录

- [🎯 部署方式选择](#-部署方式选择)
  - [方式对比](#方式对比)
  - [推荐方案](#推荐方案)
- [📚 部署文档](#-部署文档)
- [🚀 快速开始](#-快速开始)
- [🔧 快速命令对比](#-快速命令对比)
- [🌟 特性支持](#-特性支持)
- [📋 部署检查清单](#-部署检查清单)
- [🆘 获取帮助](#-获取帮助)

## 🎯 部署方式选择

### 方式对比

| 部署方式 | 适用场景 | 优点 | 缺点 |
|---------|---------|------|------|
| **传统部署** | 开发/测试环境 | 简单直接、版本控制方便 | 服务器需要开发环境、构建慢 |
| **Docker 部署** | 容器化环境 | 环境一致、易扩展 | 需要 Docker 知识 |
| **云平台部署** | 生产环境 | 自动扩展、免运维 | 可能有供应商锁定 |
| **Cloudflare Workers** | TanStack Start 边缘部署 | 全球加速、冷启动极快、免运维 | 仅限 TanStack，数据库需 Hyperdrive 或 D1 |

### 推荐方案

- **🥇 生产环境推荐**: [云平台部署](./cloud.md) 或 [Docker 部署](./docker.md)
- **🥈 全球边缘加速**: [Cloudflare Workers](./cloudflare-workers.md)（仅限 TanStack Start）
- **🥉 开发/测试环境**: [传统部署](./traditional.md)

## 📚 部署文档

### 1. [传统部署指南](./traditional.md)
- **适合**: 开发、测试环境
- **内容**: 
  - 环境准备和依赖安装
  - Next.js 和 Nuxt.js 传统部署
  - PM2 进程管理
  - 健康检查和故障排除

### 2. [Docker 部署指南](./docker.md)  
- **适合**: 容器化环境、生产环境
- **内容**:
  - Docker Compose 快速部署
  - 手动 Docker 部署
  - 数据库连接配置
  - 容器管理和调试

### 3. [云平台部署与通用配置](./cloud.md)
- **适合**: 云环境、高可用生产环境
- **内容**:
  - Vercel、Netlify、Railway 部署
  - Nginx 反向代理配置
  - SSL 证书和安全配置
  - 性能优化和监控

### 4. [Cloudflare Workers 部署](./cloudflare-workers.md)
- **适合**: TanStack Start 应用的全球边缘部署
- **内容**:
  - 自动/手动 Cloudflare Workers 配置
  - 数据库连接方案（Hyperdrive / D1 / Neon）
  - Cloudflare D1 完整配置和迁移流程
  - 环境变量与 Secrets 管理
  - CI/CD 自动部署与故障排除

## 🚀 快速开始

### 选择你的部署方式

**如果你想要...**

- ✅ **最简单的开始**: → [传统部署](./traditional.md#快速启动)
- ✅ **容器化部署**: → [Docker 部署](./docker.md#推荐方式docker-compose)
- ✅ **零运维部署**: → [云平台部署](./cloud.md#vercel-部署)
- ✅ **全球边缘加速（TanStack）**: → [Cloudflare Workers](./cloudflare-workers.md#-快速部署自动配置)

### 通用准备工作

无论选择哪种部署方式，都需要：

1. **环境变量配置**
   ```bash
   # 复制环境变量模板
   cp .env.example .env
   # 编辑配置实际的生产环境变量
   ```

2. **数据库准备**
   ```bash
   # PostgreSQL（默认）
   pnpm db:generate
   pnpm db:migrate
   pnpm db:check

   # 如果使用 Cloudflare D1，请参阅 Cloudflare Workers 部署指南中的 D1 配置步骤
   ```

3. **健康检查**
   - Next.js: `http://your-domain/api/health`
   - Nuxt.js: `http://your-domain/api/health`
   - TanStack Start: `http://your-domain/api/health`

## 🔧 快速命令对比

| 操作 | 传统部署 | Docker 部署 | 云平台部署 | Cloudflare Workers |
|------|----------|-------------|------------|-------------------|
| **构建** | `pnpm build:next` | `docker build -t tinyship-next .` | 自动构建 | `vite build` |
| **启动** | `pnpm start:next` | `docker compose --profile next up -d` | 自动部署 | `wrangler deploy` |
| **查看日志** | `pm2 logs tinyship-next` | `docker compose logs -f` | 平台控制台 | `wrangler tail` |
| **重启** | `pm2 restart tinyship-next` | `docker compose restart` | 平台控制台 | `wrangler deploy` |

## 🌟 特性支持

| 特性 | 传统部署 | Docker 部署 | 云平台部署 | Cloudflare Workers |
|------|----------|-------------|------------|-------------------|
| **环境隔离** | ❌ | ✅ | ✅ | ✅ |
| **自动重启** | ✅ (PM2) | ✅ | ✅ | ✅ |
| **水平扩展** | ❌ | 🔄 | ✅ | ✅ (自动) |
| **零停机部署** | ❌ | 🔄 | ✅ | ✅ |
| **自动备份** | ❌ | ❌ | ✅ | ❌ |
| **监控告警** | 🔄 | 🔄 | ✅ | ✅ |
| **全球边缘** | ❌ | ❌ | 🔄 | ✅ |

## 📋 部署检查清单

### 部署前检查

- [ ] 环境变量已配置 (`.env`)
- [ ] 数据库连接正常 (`pnpm db:check`)
- [ ] 所有依赖已安装 (`pnpm install`)
- [ ] 应用能正常构建 (`pnpm build:next` 或 `pnpm build:nuxt`)

### 部署后验证

- [ ] 应用能正常访问
- [ ] 健康检查端点正常 (`/api/health`)
- [ ] 数据库操作正常
- [ ] 静态资源加载正常
- [ ] 认证功能正常

### 生产环境额外检查

- [ ] HTTPS 证书有效
- [ ] 日志记录正常
- [ ] 监控和告警配置
- [ ] 备份策略实施
- [ ] 性能优化完成

## 🆘 获取帮助

遇到问题？查看对应部署方式的故障排除章节：

- [传统部署故障排除](./traditional.md#故障排除)
- [Docker 部署故障排除](./docker.md#故障排除)
- [云平台部署故障排除](./cloud.md#故障排除)
- [Cloudflare Workers 故障排除](./cloudflare-workers.md#-故障排除)

---

选择适合你需求的部署方式，按照对应的详细指南进行部署。每种方式都有其优势，关键是找到最适合你项目需求的方案。
