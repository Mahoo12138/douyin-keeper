# 🔄 动态定价配置指南

动态定价允许你在管理后台实时创建、编辑和管理定价方案，无需修改代码或重新部署。它与现有的静态定价（`config/payment.ts`）并行运行，可随时切换。

> 💡 **默认行为**：项目默认使用静态定价。开启动态定价后，定价页面将从数据库读取方案，而非 `config/payment.ts`。

## 📑 目录

- [🎯 静态定价 vs 动态定价](#-静态定价-vs-动态定价)
- [⚙️ 开启动态定价](#️-开启动态定价)
- [📦 数据库表结构](#-数据库表结构)
- [🖥️ 管理后台操作](#️-管理后台操作)
  - [方案列表](#方案列表)
  - [创建方案](#创建方案)
  - [编辑方案](#编辑方案)
  - [导入静态配置](#导入静态配置)
- [🌍 多币种与区域筛选](#-多币种与区域筛选)
- [🔤 多语言支持](#-多语言支持)
- [💰 划线价格](#-划线价格)
- [📝 Markdown 功能特性](#-markdown-功能特性)
- [🔌 API 端点](#-api-端点)
- [🔄 从静态迁移到动态](#-从静态迁移到动态)
- [⚠️ 注意事项](#️-注意事项)

## 🎯 静态定价 vs 动态定价

| 特性 | 静态定价 | 动态定价 |
|------|---------|---------|
| 数据来源 | `config/payment.ts` | 数据库 `pricing_plan` 表 |
| 修改方式 | 编辑代码 + 重新部署 | 管理后台实时修改 |
| 适用场景 | 方案固定、很少调整 | 需要频繁调价、A/B 测试、多市场运营 |
| 划线价格 | 不支持 | ✅ 支持 `originalPrice` |
| 区域筛选 | 不支持 | ✅ 按 locale 过滤展示 |
| 排序控制 | 按代码顺序 | ✅ 自定义 `sortOrder` |
| Markdown 功能描述 | 不支持 | ✅ 支持 Markdown 格式 |

## ⚙️ 开启动态定价

在项目根目录的 `.env` 文件中设置：

```env
# 定价模式：static（默认）或 dynamic
PRICING_MODE=dynamic
```

确保数据库中已创建 `pricing_plan` 表。如果使用 PostgreSQL：

```bash
pnpm db:push:pg
```

如果使用 SQLite：

```bash
pnpm db:push:sqlite
```

> **重要**：`PRICING_MODE` 仅在服务端生效。前端定价页面通过 `/api/pricing/plans` 接口获取数据，该接口会根据服务端的 `PRICING_MODE` 值决定从 config 还是数据库读取方案。

## 📦 数据库表结构

`pricing_plan` 表存储所有动态定价方案：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 方案唯一标识（自动生成 UUID） |
| `provider` | string | 支付提供商（stripe / wechat / creem / paypal / dodo / alipay） |
| `amount` | decimal | 价格金额 |
| `original_price` | decimal | 划线价格（原价），可为空 |
| `currency` | string | 货币代码（USD / CNY / EUR 等） |
| `duration_type` | string | 方案类型：recurring / one_time / credits |
| `duration_months` | integer | 时长（月），credits 类型为空 |
| `credits` | integer | 积分数量，仅 credits 类型使用 |
| `recommended` | boolean | 是否为推荐方案（显示推荐标签） |
| `sort_order` | integer | 排序权重（数值越小越靠前） |
| `is_active` | boolean | 是否启用（停用后不在定价页显示） |
| `locales` | json | 适用语言列表，`null` 表示全部语言可见 |
| `stripe_price_id` | string | Stripe Price ID |
| `creem_product_id` | string | Creem Product ID |
| `i18n` | json | 多语言内容（名称、描述、功能特性） |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |

## 🖥️ 管理后台操作

动态定价管理页面位于 `/admin/pricing`，三个框架（Next.js、Nuxt、TanStack Start）均有对应实现。

### 方案列表

列表页展示所有定价方案，支持以下操作：

- **查看方案详情**：包含提供商、价格、类型、排序、状态等信息
- **启用/停用方案**：通过开关快速切换方案的可见性
- **删除方案**：软删除（设为停用），可在数据库中硬删除
- **导入静态配置**：一键将 `config/payment.ts` 中的静态方案导入到数据库

### 创建方案

点击"创建方案"进入表单页面（`/admin/pricing/new`），表单分为四个区域：

1. **方案信息** — 在各语言标签下填写名称、描述和功能特性
2. **定价设置** — 支付提供商、金额、货币、方案类型
3. **提供商配置** — 选择对应提供商后显示的 Price/Product ID
4. **展示设置** — 适用语言、排序权重、是否推荐

### 编辑方案

在列表页点击方案进入编辑页面（`/admin/pricing/:id`），所有字段均可修改。

### 导入静态配置

如果你已有静态定价方案，可以一键导入到数据库：

1. 在方案列表页点击"Import from Config"按钮
2. 系统会读取 `config/payment.ts` 中的所有方案
3. 自动创建对应的数据库记录
4. 导入后可在管理后台继续编辑

> **注意**：导入操作会创建新记录，不会覆盖已有的动态方案。重复导入会产生重复记录。

## 🌍 多币种与区域筛选

动态定价支持按区域展示不同的方案。实现方式是为不同市场创建独立的方案：

### 设计思路

- 每个方案绑定一个支付提供商和一种货币
- 通过 `locales` 字段控制方案在哪些语言环境下可见
- `locales` 为 `null` 时，方案对所有语言可见

### 配置示例

```
方案 A：Stripe Pro Monthly
├── provider: stripe
├── amount: 29.00
├── currency: USD
├── locales: null          ← 全部语言可见（国际方案）

方案 B：微信支付月度会员
├── provider: wechat
├── amount: 29.90
├── currency: CNY
├── locales: ["zh-CN"]     ← 仅中文用户可见
```

前端定价页面会自动根据用户的语言环境筛选显示对应的方案。例如，中文用户可以同时看到方案 A（国际方案）和方案 B（中国方案），而英文用户只能看到方案 A。

> **重要**：区域筛选仅控制展示范围，不影响实际支付。如果用户通过直接访问 API 传入不在其 locale 范围内的 planId，支付仍然会正常处理。请在文档和后台说明中告知运营人员这一设计，避免用户发现定价选项突然消失。

## 🔤 多语言支持

每个方案的 `i18n` 字段存储多语言内容。系统支持扩展更多语言：

### 当前支持的语言

| 代码 | 语言 |
|------|------|
| `en` | English |
| `zh-CN` | 简体中文 |

### 扩展新语言

1. 在 `libs/i18n/index.ts` 的 `locales` 数组中添加新的语言代码
2. 在 `localeLabels` 中添加对应的显示名称
3. 管理后台会自动出现新语言的标签页

```typescript
// libs/i18n/index.ts
export const locales = ['en', 'zh-CN', 'ja'] as const;

export const localeLabels: Record<string, string> = {
  'en': 'English',
  'zh-CN': '中文',
  'ja': '日本語',
};
```

### Fallback 机制

如果某个方案未提供特定语言的内容，定价页面会自动 fallback 到默认语言（English）的内容。

## 💰 划线价格

通过 `originalPrice` 字段实现促销折扣展示：

```
方案：终身版
├── amount: 499.00          ← 实际售价
├── originalPrice: 999.00   ← 划线价（原价）
```

定价页面会以删除线显示原价，并计算折扣比例，增强用户购买意愿。

## 📝 Markdown 功能特性

方案的 `features` 字段支持 Markdown 格式，可以编写更丰富的功能描述：

```markdown
- **无限** AI 生成
- 全部高级模板
- 优先支持 24/7
- API 访问 (REST + WebSocket)
- ~~广告~~ 无广告体验
```

在管理后台的编辑表单中，功能特性使用多行文本框输入 Markdown 内容。定价页面会自动解析并渲染。

> **向后兼容**：系统同时支持旧的 `string[]` 格式（每行一条）和新的 Markdown 字符串格式。切换到动态定价后，两种格式均可正常显示。

## 🔌 API 端点

### 公开接口

```typescript
// 获取定价方案列表（根据 PRICING_MODE 自动选择数据源）
GET /api/pricing/plans?locale=en

// 响应
{
  "plans": [...],        // 订阅/单次付费方案
  "creditPlans": [...]   // 积分充值方案
}
```

### 管理接口（需要 admin 权限）

```typescript
// 获取所有动态方案
GET /api/admin/pricing-plans

// 创建方案
POST /api/admin/pricing-plans
{
  "provider": "stripe",
  "amount": 29.00,
  "currency": "USD",
  "durationType": "recurring",
  "durationMonths": 1,
  "stripePriceId": "price_xxx",
  "i18n": {
    "en": { "name": "Pro", "description": "...", "duration": "month", "features": "- Feature 1\n- Feature 2" },
    "zh-CN": { "name": "专业版", "description": "...", "duration": "月", "features": "- 功能 1\n- 功能 2" }
  }
}

// 更新方案
PUT /api/admin/pricing-plans?id=<plan-id>

// 删除方案（软删除，设为停用）
DELETE /api/admin/pricing-plans?id=<plan-id>

// 硬删除（彻底删除记录）
DELETE /api/admin/pricing-plans?id=<plan-id>&hard=true

// 从静态配置导入
POST /api/admin/pricing-plans/import
```

## 🔄 从静态迁移到动态

### 迁移步骤

1. **确保数据库表存在**

   ```bash
   pnpm db:push:pg   # 或 pnpm db:push:sqlite
   ```

2. **导入现有方案**

   在管理后台 `/admin/pricing` 点击"Import from Config"，将静态方案导入数据库。

3. **检查导入结果**

   在管理后台确认所有方案信息正确，特别检查：
   - 支付提供商的 Price/Product ID
   - 多语言内容是否完整
   - 排序和推荐标记

4. **切换定价模式**

   ```env
   PRICING_MODE=dynamic
   ```

5. **重启应用**

   重启后定价页面将从数据库读取方案。

6. **验证支付流程**

   建议使用测试模式完成一次完整的支付流程，确认：
   - 定价页面正常显示
   - 点击购买后正确跳转到支付页面
   - Webhook 回调正常处理

### 回退方案

如需回退到静态定价，只需将 `.env` 中的 `PRICING_MODE` 改回 `static` 并重启应用即可。数据库中的动态方案数据会保留，不受影响。

## ⚠️ 注意事项

### 支付提供商 ID

动态方案**必须**正确填写对应支付提供商的 ID：

| 提供商 | 必填字段 | 获取位置 |
|--------|---------|---------|
| Stripe | `stripePriceId` | Stripe Dashboard → Products → Price ID |
| Creem | `creemProductId` | Creem Dashboard → Products → Product ID |
| Dodo | `dodoProductId` | Dodo Dashboard → Products → Product ID |
| WeChat / Alipay | 无 | 使用金额直接发起支付 |

### 与返利系统的兼容性

动态定价与返利（Affiliate）系统完全兼容。佣金计算基于订单的实际支付金额（`order.amount`），与定价来源（静态或动态）无关。

### 种子数据

项目的种子脚本（`libs/database/seed.ts`）包含 9 个示例定价方案，涵盖 Stripe、微信支付、Creem 三种提供商，以及 USD 和 CNY 两种货币。运行 `pnpm db:seed` 即可创建示例数据。

### 订单记录

无论使用静态还是动态定价，订单记录中的 `planId` 字段存储的都是方案的唯一标识。切换定价模式后，已有的订单记录不受影响。

---

📚 **相关文档**：
- [支付配置概览](./overview.md) — 支付方式和基础配置
- [积分系统指南](../credits.md) — 积分充值和消耗配置
- [支付测试指南](../payment-testing.md) — 本地开发测试和 Webhook 调试
- [返利系统实现](../../implementation/affiliate-system.md) — 返利佣金架构设计
