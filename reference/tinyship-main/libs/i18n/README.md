# 国际化 (i18n) 库

**中文** | [English](./README_EN.md)

## 概述

这是整个 monorepo 项目的集中式国际化库，为 Next.js 和 Nuxt.js 应用程序提供共享的翻译数据和工具函数。

## 🏗️ 架构设计

```
libs/i18n/
├── locales/
│   ├── types.ts       # TypeScript 类型定义 (从 en.ts 自动推断)
│   ├── en.ts          # 英文翻译 (类型源真理)
│   ├── zh-CN.ts       # 简体中文翻译
│   └── index.ts       # 导出所有语言模块
├── index.ts           # 主库入口点
├── README.md          # 英文文档
└── README_CN.md       # 中文文档
```

## 🌍 支持的语言

- **English (en)** - 主要语言和类型源
- **简体中文 (zh-CN)** - 简体中文

## ⚙️ 统一配置

所有国际化配置都通过 `@config` 统一管理，确保两个应用使用相同的设置：

```typescript
// config.ts
export const config = {
  app: {
    i18n: {
      defaultLocale: 'zh-CN' as const,      // 默认语言
      locales: ['en', 'zh-CN'] as const,    // 支持的语言列表
      cookieKey: 'NEXT_LOCALE',             // Cookie 存储键
      autoDetect: false                     // 是否自动检测浏览器语言
    }
  }
};
```

**特性：**
- ✅ **统一配置源**: Next.js 和 Nuxt.js 共享配置
- ✅ **类型安全**: TypeScript 类型推断和验证
- ✅ **持久化**: Cookie 自动保存用户语言偏好
- ✅ **灵活控制**: 可选的浏览器语言自动检测

## 🎯 框架集成

本库支持两种不同的框架，采用不同的实现方法：

### 🟢 Nuxt.js 应用 (@nuxtjs/i18n)

使用官方的 `@nuxtjs/i18n` 模块，提供自动路由生成和内置功能。

**配置方式：**
```typescript
// nuxt.config.ts
import { config as appConfig } from '@config'

export default defineNuxtConfig({
  modules: ['@nuxtjs/i18n'],
  
  // 国际化配置（从 @config 动态获取）
  i18n: {
    locales: appConfig.app.i18n.locales.map(code => ({
      code,
      name: code === 'en' ? 'English' : '中文',
    })),
    defaultLocale: appConfig.app.i18n.defaultLocale,
    strategy: 'prefix',
    detectBrowserLanguage: appConfig.app.i18n.autoDetect ? {
      useCookie: true,
      cookieKey: appConfig.app.i18n.cookieKey,
      redirectOn: 'root',
      alwaysRedirect: true,
      fallbackLocale: appConfig.app.i18n.defaultLocale,
    } : false, // 如果 autoDetect 为 false，则禁用浏览器检测
  }
})
```

```typescript
// i18n/i18n.config.ts
import { translations } from '@libs/i18n'

export default defineI18nConfig(() => ({
  messages: translations,
  legacy: false,
  fallbackLocale: 'zh-CN'
}))
```

**在 Vue 组件中使用：**
```vue
<template>
  <div>
    <!-- 基本翻译 -->
    <h1>{{ t('header.navigation.ai') }}</h1>
    
    <!-- 路由链接 -->
    <NuxtLink :to="localePath('/dashboard')">
      {{ t('header.userMenu.personalSettings') }}
    </NuxtLink>
    
    <!-- 语言切换 -->
    <button @click="changeLanguage('en')">English</button>
    <button @click="changeLanguage('zh-CN')">中文</button>
  </div>
</template>

<script setup lang="ts">
// 获取国际化功能
const { t, locale, locales } = useI18n()
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()

// 语言切换
const changeLanguage = (targetLocale: string) => {
  const path = switchLocalePath(targetLocale as any)
  if (path) navigateTo(path)
}
</script>
```

**服务器端 API 路由：**
```typescript
// server/api/example.ts
export default defineEventHandler(async (event) => {
  // 获取请求头中的语言信息（Accept-Language）
  const locale = getHeader(event, 'accept-language')?.split(',')[0] || 'zh-CN'

  // 获取 Nuxt i18n 实例
  const i18n = useNuxtApp().$i18n

  // 设置当前语言
  i18n.locale.value = locale.includes('zh') ? 'zh-CN' : 'en'

  // 使用翻译功能
  return {
    message: i18n.t('header.navigation.ai'),
    currentLocale: i18n.locale.value
  }
})
```

### 🔵 Next.js 应用 (手动实现)

使用基于文件系统路由和中间件的自定义实现，配置从 `@config` 动态获取。

**配置方式：**
```typescript
// app/i18n-config.ts
import { translations, locales } from '@libs/i18n';
import { config } from '@config';

export const i18n = {
  defaultLocale: config.app.i18n.defaultLocale,
  locales: locales as readonly string[],
} as const;
```

**服务器组件：**
```typescript
import { translations } from "@libs/i18n";
import { config } from "@config";

export default async function Page({ params }: { params: { lang: string } }) {
  const { lang } = await params;
  const locale = lang || config.app.i18n.defaultLocale;
  const t = translations[locale];
  
  return (
    <div>
      {/* 基本翻译 */}
      <h1>{t.header.navigation.ai}</h1>
      
      {/* 路由链接 */}
      <Link href={`/${locale}/dashboard`}>
        {t.header.userMenu.personalSettings}
      </Link>
    </div>
  );
}
```

**客户端组件：**
```typescript
'use client';
import { useTranslation } from "@/hooks/use-translation";

export function Component() {
  const { t, locale, locales, changeLocale } = useTranslation();

  return (
    <div>
      {/* 基本翻译 */}
      <h1>{t.header.navigation.ai}</h1>
      
      {/* 路由链接 */}
      <Link href={`/${locale}/dashboard`}>
        {t.header.userMenu.personalSettings}
      </Link>
      
      {/* 语言切换 */}
      <button onClick={() => changeLocale('en')}>English</button>
      <button onClick={() => changeLocale('zh-CN')}>中文</button>
    </div>
  );
}
```

## 📚 API 参考

### 核心导出

```typescript
import { 
  translations,      // 完整的翻译对象
  defaultLocale,     // 默认语言 ('en')
  locales,          // 支持的语言数组
  isValidLocale,    // 语言验证函数
  getTranslation    // 类型安全的翻译获取器
} from '@libs/i18n'
```

### 类型定义

```typescript
import type { 
  SupportedLocale,  // 'en' | 'zh-CN'
  Translations      // 完整的翻译结构类型
} from '@libs/i18n'
```

### 翻译结构

翻译对象采用嵌套结构：

```typescript
{
  common: {
    welcome: string
    buttons: {
      submit: string
      cancel: string
      save: string
    }
    // ...
  },
  navigation: {
    home: string
    dashboard: string
    // ...
  },
  auth: {
    signin: {
      title: string
      email: string
      // ...
    }
    // ...
  }
  // ... 更多命名空间
}
```

## 🔧 添加新翻译

### 步骤 1：添加英文翻译

编辑 `libs/i18n/locales/en.ts`：

```typescript
export const en = {
  // ... 现有翻译
  newFeature: {
    title: "New Feature",
    description: "This is a new feature",
    actions: {
      enable: "Enable",
      disable: "Disable"
    }
  }
} as const;
```

### 步骤 2：添加对应的中文翻译

编辑 `libs/i18n/locales/zh-CN.ts`：

```typescript
export const zhCN = {
  // ... 现有翻译
  newFeature: {
    title: "新功能",
    description: "这是一个新功能",
    actions: {
      enable: "启用",
      disable: "禁用"
    }
  }
} as const;
```

### 步骤 3：在应用中使用

新的翻译将自动在两个框架中可用：

- **Nuxt.js**: `$t('newFeature.title')` 或 `t('newFeature.title')`
- **Next.js 服务器**: `t.newFeature.title`
- **Next.js 客户端**: `t.newFeature.title`

## 🎨 翻译模式

### 表单字段
```typescript
form: {
  labels: {
    name: "姓名",
    email: "邮箱"
  },
  placeholders: {
    name: "请输入您的姓名",
    email: "请输入您的邮箱"
  },
  errors: {
    nameRequired: "请输入姓名",
    emailInvalid: "请输入有效的邮箱地址"
  }
}
```

### 操作状态
```typescript
actions: {
  submit: "提交",
  submitting: "提交中...",
  save: "保存",
  saving: "保存中..."
}
```

### 状态消息
```typescript
status: {
  success: "操作成功完成",
  error: "发生错误",
  loading: "加载中..."
}
```

## 🚀 性能考量

### 包大小优化

**Next.js：**
- 服务器组件对于翻译没有 JavaScript 开销
- 客户端组件只包含活动的语言环境
- Tree-shaking 移除未使用的翻译键

**Nuxt.js：**
- @nuxtjs/i18n 提供自动代码分割
- 支持大型翻译文件的懒加载
- 为 SSR/SSG 提供内置优化

### 内存使用

- 翻译对象是单例（在组件间共享）
- TypeScript 提供编译时类型检查
- 生产环境中没有运行时验证开销

## 🔍 类型安全

本库提供完整的 TypeScript 支持：

```typescript
// 自动补全和类型检查
const message: string = t.common.welcome
const nested: string = t.auth.signin.title

// 无效键的编译时错误
const invalid = t.nonexistent.key // ❌ TypeScript 错误
```

类型自动从英文翻译文件 (`en.ts`) 推断，确保所有语言的一致性。

## 🌐 URL 结构

两个框架都支持一致的 URL 模式：

```
/                    → 默认语言主页
/dashboard           → 默认语言仪表盘
/zh-CN/              → 中文主页  
/zh-CN/dashboard     → 中文仪表盘
/en/                 → 英文主页 (Nuxt.js 前缀策略)
/en/dashboard        → 英文仪表盘 (Nuxt.js 前缀策略)
```

## 🛠️ 开发工具

### 验证

```typescript
import { isValidLocale } from '@libs/i18n'

// 运行时验证
if (isValidLocale(userLocale)) {
  // 安全使用
}
```

### 类型安全获取器

```typescript
import { getTranslation } from '@libs/i18n'

// 获取具有完整类型安全的翻译
const t = getTranslation('en')
const message = t.common.welcome // ✅ 完全类型化
```

## 📖 最佳实践

1. **使用英文作为真理源** 来定义翻译结构
2. **嵌套最多保持 4 层** 以便维护
3. **将相关翻译分组** 在有意义的命名空间下
4. **遵循一致的模式** 处理表单、操作和状态消息
5. **为异步操作提供加载状态**
6. **为所有验证场景包含错误消息**

## 🔧 故障排除

### 缺失翻译键

如果您看到关于缺失键的运行时警告：
1. 检查键是否在 `en.ts` 和 `zh-CN.ts` 中都存在
2. 确保键路径正确（区分大小写）
3. 添加新键后重启开发服务器

### 类型错误

如果 TypeScript 对有效翻译键显示错误：
1. 确保您正确从 `@libs/i18n` 导入
2. 检查两个语言文件是否有相同的结构
3. 英文文件 (`en.ts`) 驱动类型定义

### 框架特定问题

- **Next.js**: 检查 `useTranslation` hook 实现
- **Nuxt.js**: 验证 `@nuxtjs/i18n` 模块配置
- **两者**: 确保 `@libs/i18n` 在 monorepo 中正确链接

## 📝 贡献

添加新翻译时：

1. 始终先添加到英文 (`en.ts`)
2. 确保中文翻译准确且符合上下文
3. 遵循现有的命名约定和结构
4. 在 Next.js 和 Nuxt.js 应用中测试
5. 如果添加新模式或命名空间，请更新文档