# 动态定价实现文档

本文档描述动态定价功能的架构设计和实现细节。用户指南请参阅 [动态定价配置指南](../user-guide/payment/dynamic-pricing.md)。

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend (3 Apps)                           │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────────┐   │
│  │   Next.js    │ │   Nuxt.js    │ │   TanStack Start       │   │
│  │              │ │              │ │                        │   │
│  │ /pricing     │ │ /pricing     │ │ /pricing               │   │
│  │ /admin/      │ │ /admin/      │ │ /admin/                │   │
│  │   pricing/   │ │   pricing/   │ │   pricing/             │   │
│  └──────┬───────┘ └──────┬───────┘ └───────────┬────────────┘   │
│         │                │                     │                │
│         └────────────────┼─────────────────────┘                │
│                          ▼                                       │
│              ┌───────────────────────┐                           │
│              │  /api/pricing/plans   │  ← 公开接口               │
│              │  /api/admin/pricing-  │  ← 管理接口               │
│              │    plans              │                           │
│              └───────────┬───────────┘                           │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Shared Libraries                               │
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐                      │
│  │  libs/pricing/   │  │  libs/payment/   │                      │
│  │                  │  │                  │                      │
│  │  getPlanById()   │  │  PaymentParams   │                      │
│  │  getPlans()      │  │    .plan         │                      │
│  │  createPlan()    │  │                  │                      │
│  │  updatePlan()    │  │  Providers use   │                      │
│  │  deletePlan()    │  │  params.plan     │                      │
│  └────────┬─────────┘  └──────────────────┘                      │
│           │                                                       │
│           ▼                                                       │
│  ┌──────────────────────────────────────┐                         │
│  │  config/payment.ts                   │                         │
│  │  pricingMode: 'static' | 'dynamic'  │                         │
│  │  plans: { ... }  ← 静态方案          │                         │
│  └──────────────────────────────────────┘                         │
│                                                                   │
│  ┌──────────────────────────────────────┐                         │
│  │  libs/database/                      │                         │
│  │  schema/pricing-plan.ts              │                         │
│  │  pricing_plan 表                     │                         │
│  └──────────────────────────────────────┘                         │
└───────────────────────────────────────────────────────────────────┘
```

## 核心模块

### libs/pricing/

定价方案的统一访问层，抽象了静态和动态两种数据源。

| 文件 | 职责 |
|------|------|
| `index.ts` | 导出 `getPlanById()`、`getPlans()` 等核心函数 |
| `types.ts` | `PlanWithMeta` 类型定义、`normalizeFeatures()`、`featuresToMarkdown()` 工具函数 |
| `admin.ts` | CRUD 操作：`createPlan()`、`updatePlan()`、`deletePlan()` |

#### getPlanById() 流程

```
getPlanById(planId)
  ├── pricingMode === 'static'
  │     └── 从 config.payment.plans[planId] 读取
  │         └── 转换为 PlanWithMeta 返回
  │
  └── pricingMode === 'dynamic'
        └── 从 pricing_plan 表 WHERE id = planId 查询
            └── dbPlanToPlanWithMeta() 转换后返回
```

#### getPlans() 流程

```
getPlans(locale?)
  ├── pricingMode === 'static'
  │     └── 遍历 config.payment.plans
  │         └── 每个 plan 转换为 PlanWithMeta
  │
  └── pricingMode === 'dynamic'
        └── SELECT * FROM pricing_plan WHERE is_active = true
            ├── 如果指定 locale → 过滤 locales 包含该 locale 或 locales 为 null 的记录
            └── 按 sort_order 排序
```

### 类型体系

```typescript
// config/types.ts — 静态方案类型
type Plan = RecurringPlan | OneTimePlan | CreditPlan;

// libs/pricing/types.ts — 扩展类型（兼容静态和动态）
type PlanWithMeta = Plan & {
  originalPrice?: number | null;  // 划线价格
  locales?: string[] | null;      // 区域筛选
  sortOrder?: number;             // 排序权重
};

// libs/payment/types.ts — 支付参数
interface PaymentParams {
  planId: string;
  userId: string;
  orderId: string;
  amount?: number;
  currency?: string;
  plan?: PaymentPlan;  // 动态定价传入解析后的 plan
  metadata?: Record<string, any>;
};
```

## 支付 Provider 兼容

所有 6 个支付 Provider 的 `createPayment()` 方法支持两种 plan 来源：

```typescript
async createPayment(params: PaymentParams) {
  // 优先使用传入的 plan（动态定价），fallback 到静态 config
  const plan = params.plan
    || config.payment.plans[params.planId] as PaymentPlan;
  // ...
}
```

Webhook handler 中的 plan 查找也做了相同处理：

```typescript
// 优先从数据库查找（动态方案），fallback 到静态 config
const plan = await getPlanById(planId)
  || config.payment.plans[planId] as PaymentPlan;
```

## i18n 扩展机制

语言列表在 `libs/i18n/index.ts` 中集中管理：

```typescript
export const locales = ['en', 'zh-CN'] as const;
export const localeLabels: Record<string, string> = {
  'en': 'English',
  'zh-CN': '中文',
};
```

管理后台的表单动态渲染语言标签页，添加新语言只需修改上述两处即可。

## Features 字段格式

`i18n.features` 支持两种格式：

| 格式 | 示例 | 使用场景 |
|------|------|---------|
| `string[]` | `["Feature A", "Feature B"]` | 旧版静态配置 |
| `string` (Markdown) | `"- Feature A\n- Feature B"` | 新版动态定价 |

`normalizeFeatures()` 函数统一将两种格式转为 `string[]` 用于定价页面展示。`featuresToMarkdown()` 将 `string[]` 转回 Markdown 字符串用于编辑表单。

## PRICING_MODE 生效机制

`PRICING_MODE` 环境变量仅在服务端可用（非 `NEXT_PUBLIC_` 前缀）。前端组件通过以下方式间接获取：

1. 定价页面调用 `/api/pricing/plans` 接口
2. 接口在服务端读取 `config.payment.pricingMode`
3. 根据模式选择数据源（config 或数据库）
4. 管理后台通过 `/api/admin/pricing-plans` 接口返回 `pricingMode` 字段

## 数据库 Schema

支持 PostgreSQL 和 SQLite 两种方言，通过 proxy module 动态选择：

- `libs/database/schema/pg/pricing-plan.ts` — PostgreSQL 版本
- `libs/database/schema/sqlite/pricing-plan.ts` — SQLite 版本
- `libs/database/schema/pricing-plan.ts` — Proxy 模块

---

📚 **相关文档**：
- [动态定价用户指南](../user-guide/payment/dynamic-pricing.md)
- [配置系统文档](./configuration-system.md)
- [返利系统实现](./affiliate-system.md)
