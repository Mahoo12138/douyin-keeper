# TinyShip

**中文** | [English](./README_EN.md)

![Build Status](https://github.com/vikingmute/tinyship/actions/workflows/ci.yml/badge.svg)

🚀 一个现代化、功能齐全的 Monorepo 启动模板，专为构建支持国内和国际市场的 SaaS 应用而设计。

## 📑 目录

- [🚀 快速开始](#-快速开始)
- [✨ 核心特性](#-核心特性)
  - [🏗️ 现代化架构](#️-现代化架构)
  - [🔐 完善的身份认证](#-完善的身份认证)
  - [🌐 全球化支持](#-全球化支持)
  - [📱 通讯服务](#-通讯服务)
  - [🎨 现代化 UI/UX](#-现代化-uiux)
  - [💪 核心功能](#-核心功能)
  - [🤖 AI 集成](#-ai-集成)
  - [🧠 AI 开发就绪](#-ai-开发就绪)
- [📦 技术栈](#-技术栈)
- [🌟 为什么选择 TinyShip？](#-为什么选择-tinyship)

## 🚀 快速开始

详细的安装说明和配置指南，请参阅我们的[开始指南](./docs/user-guide/overview.md)。
更推荐直接阅读我们的在线文档 [https://docs.tinyship.cn/](https://docs.tinyship.cn/)

## ✨ 核心特性

### 🏗️ 现代化架构
- **灵活的 Monorepo 结构**：使用 `libs` 共享代码的简化架构，而非复杂的 packages 结构
- **三框架支持**： 
  - Next.js 适合 React 爱好者
  - Nuxt.js 适合 Vue 爱好者
  - TanStack Start 适合追求轻量级 React 方案的开发者
  - 选择你喜欢的框架，同时保持强大的后端功能
- **文档站点 (docs-app)**：
  - 基于 [Fumadocs](https://fumadocs.dev) 构建的静态文档站点
  - 支持文档、博客和静态页面
  - 内置多语言支持和全文搜索
  - 静态导出，可部署到任何 CDN

### 🔐 完善的身份认证
- **[Better-Auth](https://www.better-auth.com/) 集成**：
  - 邮箱/密码认证
  - 手机号验证和 OTP
  - 多因素认证（2FA）
  - 会话管理
  - 账号关联
- **多种 OAuth 提供商**：
  - Google
  - GitHub
  - 微信登录
  - 易于扩展更多提供商

### 🌐 全球化支持
- **国际化支持**：
  - 内置 i18n 支持
  - 多语言 UI 和邮件模板
  - 特定区域集成
- **支付解决方案**：
  - Stripe 用于全球支付
  - PayPal 用于全球支付与订阅
  - 微信支付用于中国市场
  - 支付宝用于中国市场
  - Creem 支付集成
  - **双重付费模式**：传统订阅 + AI 时代积分系统
  - 完整的积分消耗追踪和交易记录

### 📱 通讯服务
- **邮件服务**：
  - 支持多个提供商（Resend、SendGrid、SMTP）
  - 模板化邮件
  - 本地化内容
- **短信集成**：
  - 全球提供商（Twilio）
  - 中国特定提供商（阿里云）
  - OTP 和通知支持

### 📦 存储服务
- **统一存储接口**：
  - 阿里云 OSS
  - AWS S3
  - Cloudflare R2
  - 轻松切换不同服务商
- **完整功能支持**：
  - 文件上传/下载
  - 签名 URL 生成
  - 元数据管理
  - 目录列表

### 🎨 现代化 UI/UX
- **丰富的组件库**：
  - [shadcn/ui](https://ui.shadcn.com/) 用于 Next.js 和 TanStack Start
  - [Magic UI](https://www.magicui.design/) 用于 Nuxt.js
- **样式系统**：
  - Tailwind CSS 实用优先的样式
  - 一致的设计系统
- **内置管理面板**：
  - 用户管理
  - 内容管理
  - 分析仪表板

### 💪 核心功能
- **Zod 类型安全验证**：
  - 应用程序全面的基于模式验证
  - TypeScript 集成的运行时类型检查
  - API 请求/响应验证
  - 详细错误消息的表单验证
  - 自定义验证规则
  - 自动 TypeScript 类型推断
- **高级授权**：
  - 基于角色的访问控制（RBAC）
  - 细粒度权限
  - 动态策略管理
  - 资源级访问控制
  - 使用 CASL 的灵活权限规则

### 🤖 AI 集成
- **AI 服务**：
  - Vercel AI SDK 集成
  - 支持多个 AI 提供商
  - 易于扩展自定义 AI 功能

### 🧠 AI 开发就绪
- **Agent Skills 支持**：
  - 7 个专属 Agent Skills，支持 67+ AI 编辑器（Cursor、Claude Code、Codex、OpenCode 等）
  - 一键安装：`npx skills add TinyshipCN/tinyship-skills`
  - AI 引导式项目设置、品牌定制、支付配置、部署等
- **Cursor 集成**：
  - 内置 Cursor 规则支持 AI 辅助开发
  - 智能代码导航和补全
  - 上下文感知的 AI 建议
- **AI 优先开发**：
  - 结构化代码库便于 AI 理解
  - 为 AI 工具提供全面文档
  - 现成的提示和模板
- **增强的开发体验**：
  - 借助 AI 快速理解项目
  - 更快的功能开发
  - 智能代码重构

## 📦 技术栈

### 前端
- Next.js / Nuxt.js / TanStack Start
- TypeScript
- Tailwind CSS
- shadcn/ui & Magic UI
- [Zod](https://zod.dev/) 端到端类型安全

### 文档
- [Fumadocs](https://fumadocs.dev) 文档框架
- MDX 内容编写
- Orama 静态搜索

### 后端
- Better-Auth
- CASL 权限管理
- PostgreSQL
- Drizzle ORM

### 服务
- 邮件（Resend/SendGrid/SMTP）
- 短信（阿里云/Twilio）
- 支付（Stripe/PayPal/微信支付/支付宝/Creem）
- 积分系统（支持固定/动态消耗模式）
- 存储（阿里云 OSS/AWS S3/Cloudflare R2）
- AI 集成

## 🌟 为什么选择 TinyShip？

1. **快速启动**：几分钟而非几天内启动并运行你的 SaaS
2. **最佳实践**：使用现代工具和模式构建
3. **全球化 + 本地化**：同时支持国际和中国市场需求
4. **框架自由**：在 React (Next.js / TanStack Start) 和 Vue (Nuxt.js) 之间选择，同时保留所有强大功能
5. **生产就绪**：内置企业级安全性和可扩展性
6. **AI 驱动开发**：借助 Cursor 和 AI 工具增强开发体验
