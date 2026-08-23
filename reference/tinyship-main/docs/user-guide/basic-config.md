# 基础配置

本文档介绍 TinyShip 应用的基础配置选项，包括应用名称、Logo、主题系统和国际化配置。

> 💡 **AI 快速配置：** 已安装 [Agent Skills](https://github.com/TinyshipCN/tinyship-skills) 的用户可以直接对 AI 说「帮我配置品牌信息」，使用 `tinyship-brand` skill 交互式完成配置。

## 📑 目录

- [应用基础配置](#应用基础配置)
  - [应用名称](#应用名称)
  - [Logo 配置](#logo-配置)
- [主题系统配置](#主题系统配置)
  - [可用主题](#可用主题)
  - [在 config.ts 中配置](#在-configts-中配置)
  - [创建自定义主题](#创建自定义主题)
- [国际化配置](#国际化配置)
  - [支持的语言](#支持的语言)
  - [在 config.ts 中配置](#在-configts-中配置-1)
  - [添加新翻译](#添加新翻译)

---

## 应用基础配置

在开始使用 TinyShip 之前，您需要配置一些基础信息，包括应用名称和 Logo。这些配置会影响整个应用的品牌展示。

### 应用名称

应用名称会显示在页面标题、Logo 旁边的文字、邮件模板等位置。

```typescript
// config.ts
export const config = {
  app: {
    name: 'TinyShip',  // 修改为您的应用名称
  }
}
```

### Logo 配置

TinyShip 支持灵活的 Logo 配置，您可以使用图标 + 文字的组合，或者使用完整的 Logo 图片。

```typescript
// config.ts
export const config = {
  app: {
    logo: {
      /**
       * Logo 图标 URL（相对于 public 文件夹的路径或绝对 URL）
       * 推荐尺寸：24x24px 的 SVG 或 PNG
       * @example '/logo.svg' 或 'https://example.com/logo.png'
       */
      iconUrl: '/logo.svg',

      /**
       * 完整 Logo 图片 URL（可选，包含图标和文字）
       * 用于需要展示完整 Logo 图片而非图标 + 文字组合的场景
       * 如果不设置，将使用 iconUrl + app.name 的组合
       * 推荐尺寸：200x40px
       */
      fullLogoUrl: undefined,

      /**
       * 图标容器的自定义 CSS 类
       * 用于添加背景色、边框、圆角、内边距等样式
       * @example 'bg-primary rounded-full p-1' 或 'bg-white shadow-sm rounded-lg'
       */
      iconClassName: 'bg-chart-1 rounded-full p-2',
    },
  }
}
```

**配置选项说明**：

| 选项 | 说明 | 示例 |
|------|------|------|
| `iconUrl` | Logo 图标的路径，支持 SVG、PNG 等格式 | `/logo.svg` |
| `fullLogoUrl` | 完整 Logo 图片路径（可选），设置后会替代图标 + 文字的组合 | `/full-logo.png` |
| `iconClassName` | 图标容器的 Tailwind CSS 类，用于自定义样式 | `bg-chart-1 rounded-full p-2` |

**自定义 Logo 步骤**：

1. **准备 Logo 文件**：
   - 图标文件：推荐 24x24px 的 SVG 格式（白色填充，配合彩色背景使用）
   - 完整 Logo：推荐 200x40px 的 PNG 或 SVG 格式

2. **放置文件**：
   - 将 Logo 文件放入 `apps/next-app/public/` 目录
   - 同时也需要放入 `apps/nuxt-app/public/`、`apps/tanstack-app/public/` 和 `apps/docs-app/public/` 目录

3. **更新配置**：
   ```typescript
   logo: {
     iconUrl: '/my-logo.svg',
     iconClassName: 'bg-blue-500 rounded-full p-1',
   }
   ```


---

## 主题系统配置

TinyShip 内置了强大的多主题系统，基于 shadcn/ui 主题架构，提供 5 种美观的颜色方案和完整的暗黑模式支持。

### 可用主题

1. **Default Theme**: 经典灰度配色，蓝紫色渐变
2. **Claude Theme**: 温暖橙色配色，灵感来自 Claude AI
3. **Cosmic Night Theme**: 神秘紫色配色，宇宙主题
4. **Modern Minimal Theme**: 现代简约紫蓝色配色
5. **Ocean Breeze Theme**: 清新青绿色配色，海洋主题

### 在 config.ts 中配置

主题配置位于 `config.ts` 的 `app` 对象中：

```typescript
// config.ts
export const config = {
  app: {
    theme: {
      defaultTheme: 'light' as const,        // 默认主题模式: 'light' | 'dark'
      defaultColorScheme: 'claude' as const, // 默认颜色方案
      storageKey: 'tinyship-ui-theme'        // 主题持久化存储键
    }
  },
  // 其他配置从 config/ 目录导入...
}
```

**配置选项说明**：
- `defaultTheme`: 应用启动时的默认主题模式
- `defaultColorScheme`: 可选值：`'default' | 'claude' | 'cosmic-night' | 'modern-minimal' | 'ocean-breeze'`
- `storageKey`: 用于在浏览器本地存储中保存用户的主题偏好

### 创建自定义主题

1. 访问 [tweakcn.com](https://tweakcn.com/editor/theme) 主题编辑器
2. 使用可视化编辑器自定义颜色
3. 导出主题 CSS
4. 在 `libs/ui/styles/themes/` 创建新主题文件
5. 添加生成的 CSS 并使用类选择器
6. 更新主题配置

---

## 国际化配置

TinyShip 提供了完整的国际化支持，支持中英文双语，可以轻松扩展到更多语言。

### 支持的语言

- **English (en)** - 英文
- **简体中文 (zh-CN)** - 简体中文，默认语言

### 在 config.ts 中配置

国际化配置位于 `config.ts` 的 `app` 对象中：

```typescript
// config.ts
export const config = {
  app: {
    i18n: {
      defaultLocale: 'zh-CN' as const,  // 默认语言: 'en' | 'zh-CN'
      locales: ['en', 'zh-CN'] as const, // 可用语言列表
      cookieKey: 'NEXT_LOCALE',         // 语言持久化 Cookie 键
      autoDetect: false                 // 是否自动检测浏览器语言
    }
  }
}
```

**配置选项说明**：
- `defaultLocale`: 应用启动时的默认语言
- `locales`: 应用支持的所有语言列表
- `cookieKey`: 用于保存用户语言偏好的 Cookie 名称
- `autoDetect`: 是否自动检测用户浏览器语言设置

### 添加新翻译

如需添加新的翻译内容：

1. 在 `libs/i18n/locales/en.ts` 中添加英文翻译
2. 在 `libs/i18n/locales/zh-CN.ts` 中添加对应的中文翻译
3. 重启开发服务器使更改生效

详细的国际化使用方法请参考：[国际化库文档](../../libs/i18n/README.md)

---

## 总结

这些基础配置让您可以快速自定义 TinyShip 应用的品牌形象和外观：

- **应用基础配置**: 自定义应用名称和 Logo
- **主题系统**: 5 种预设主题 + 自定义主题支持
- **国际化**: 完整的中英文支持 + 易于扩展

配置采用模块化结构：主文件 `config.ts` 保留应用核心配置（name、theme、i18n），其他配置分布在 `config/` 目录下的独立文件中。
