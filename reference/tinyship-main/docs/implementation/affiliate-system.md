# 返利系统实现文档

本文档详细介绍 TinyShip 项目中返利（Affiliate）系统的架构设计和实现细节，包括推荐归因、佣金处理、提现管理以及三个框架的适配方案。

## 📋 目录

1. [系统架构](#系统架构)
2. [数据库设计](#数据库设计)
3. [核心模块](#核心模块)
4. [推荐归因流程](#推荐归因流程)
5. [佣金处理流程](#佣金处理流程)
6. [提现管理流程](#提现管理流程)
7. [框架适配](#框架适配)
8. [API 路由一览](#api-路由一览)
9. [功能开关设计](#功能开关设计)
10. [数据库兼容性](#数据库兼容性)
11. [测试覆盖](#测试覆盖)

## 系统架构

### 整体架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                        Frontend (3 Apps)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │   Next.js    │  │   Nuxt.js    │  │    TanStack Start      │ │
│  │ Dashboard:   │  │ Dashboard:   │  │ Dashboard:             │ │
│  │ - Affiliate  │  │ - Affiliate  │  │ - Affiliate            │ │
│  │ - Withdrawal │  │ - Withdrawal │  │ - Withdrawal           │ │
│  │ Admin:       │  │ Admin:       │  │ Admin:                 │ │
│  │ - Commissions│  │ - Commissions│  │ - Commissions          │ │
│  │ - Withdrawals│  │ - Withdrawals│  │ - Withdrawals          │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬────────────┘ │
│         │                 │                       │              │
└─────────┼─────────────────┼───────────────────────┼──────────────┘
          │                 │                       │
          └────────────┬────┘───────────────────────┘
                       │
                 ┌─────▼─────┐
                 │ API Routes │ (framework-specific thin adapters)
                 └─────┬─────┘
                       │
          ┌────────────▼────────────┐
          │     libs/affiliate      │  (shared business logic)
          │ ┌────────────────────┐  │
          │ │   referral.ts      │  │ → code generation, cookie parsing, claim
          │ │   commission.ts    │  │ → commission calculation + crediting
          │ │   withdrawal.ts   │  │ → request + admin processing
          │ │   types.ts        │  │ → shared TypeScript interfaces
          │ └────────────────────┘  │
          └────────────┬────────────┘
                       │
     ┌─────────────────┼──────────────────┐
     │                 │                  │
┌────▼────┐    ┌───────▼──────┐    ┌──────▼──────┐
│ @config │    │ @libs/credits │    │@libs/database│
│affiliate│    │ signup bonus  │    │ drizzle ORM  │
└─────────┘    └──────────────┘    └─────────────┘
```

### 设计原则

1. **共享逻辑优先** — 核心业务逻辑全部在 `libs/affiliate/` 中实现，三个框架的 API 路由只做请求解析和响应格式化
2. **幂等操作** — 佣金处理支持幂等调用，重复的 webhook 不会重复计算佣金
3. **立即扣减** — 提现请求立即扣减余额，拒绝时退还，防止超额提现
4. **功能开关** — 通过 `AFFILIATE_ENABLED` 环境变量统一控制 UI / claim / webhook 等关键路径
5. **数据库无关** — 所有 SQL 使用标准 `CAST()` 语法，同时兼容 PostgreSQL 和 SQLite

## 数据库设计

### Schema 变更

#### user 表扩展

```typescript
// libs/database/schema/pg/user.ts (同时有 sqlite 版本)
referralCode:      text('referral_code').unique(),    // 用户自己的推荐码
referredByCode:    text('referred_by_code'),          // 推荐人的推荐码
commissionBalance: text('commission_balance').default('0'), // 佣金余额
kycVerified:       boolean('kyc_verified').default(true),   // KYC 状态 (当前默认已开启)
```

#### commission 表

```typescript
// libs/database/schema/pg/commission.ts
{
  id:               text('id').primaryKey(),
  referrerId:       text('referrer_id').notNull().references(() => user.id),
  orderId:          text('order_id').notNull().references(() => order.id),
  buyerId:          text('buyer_id').notNull(),
  orderAmount:      text('order_amount').notNull(),
  currency:         text('currency').notNull(),
  commissionRate:   text('commission_rate').notNull(),
  commissionAmount: text('commission_amount').notNull(),
  status:           text('status').notNull().default('credited'),
  createdAt:        timestamp('created_at').defaultNow(),
  updatedAt:        timestamp('updated_at').defaultNow(),
}
```

#### withdrawal 表

```typescript
// libs/database/schema/pg/withdrawal.ts
{
  id:             text('id').primaryKey(),
  userId:         text('user_id').notNull().references(() => user.id),
  amount:         text('amount').notNull(),
  currency:       text('currency').notNull().default('USD'),
  paymentMethod:  text('payment_method').notNull(),
  paymentAccount: text('payment_account').notNull(),
  status:         text('status').notNull().default('pending'),
  adminNote:      text('admin_note'),
  processedBy:    text('processed_by'),
  processedAt:    timestamp('processed_at'),
  createdAt:      timestamp('created_at').defaultNow(),
  updatedAt:      timestamp('updated_at').defaultNow(),
}
```

### 状态枚举

```typescript
// Commission Status
commissionStatus = { CREDITED: 'credited', WITHDRAWN: 'withdrawn', CANCELLED: 'cancelled' }

// Withdrawal Status
withdrawalStatus = { PENDING: 'pending', PROCESSING: 'processing', COMPLETED: 'completed', REJECTED: 'rejected' }
```

## 核心模块

### referral.ts — 推荐归因

| 函数 | 职责 |
|------|------|
| `getReferralCodeFromCookieHeader(cookieHeader, cookieName)` | 从原始 Cookie 头解析推荐码 |
| `generateReferralCode(userId)` | 延迟生成 8 位唯一推荐码（使用 nanoid） |
| `applyReferralCodeToUser({ userId, referralCode })` | 验证并绑定推荐关系，发放双向注册奖励 |

**安全校验链**（在 `applyReferralCodeToUser` 中）：

```
referralCode 为空? → no_referral_code
affiliate 已禁用? → affiliate_disabled
用户不存在?     → user_not_found
已有推荐记录?   → already_claimed
推荐码无效?     → invalid_referrer
自我推荐?       → self_referral
全部通过        → 记录推荐关系 + 发放奖励
奖励失败        → `applied=true`，同时返回 bonus 失败信息供调用方感知
```

### commission.ts — 佣金处理

`processReferralCommission(orderId)` 的完整流程：

```
1. 检查 affiliate 是否启用
2. 查询订单信息
3. 从订单 metadata 提取 referrerId
4. 幂等检查：该订单是否已有佣金记录
5. 计算佣金金额：
   - fixedCommissionAmount > 0 → 使用固定金额
   - 否则 → orderAmount × commissionRate
6. 校验订单币种是否等于 `AFFILIATE_CURRENCY`
7. 在同一事务中插入 commission 记录（状态 = credited）
8. 在同一事务中累加 commissionBalance 到推荐人 user 记录
```

关键 SQL（跨数据库兼容）：

```sql
SET commissionBalance = CAST(COALESCE(commissionBalance, '0') AS REAL) + commissionAmount
```

### withdrawal.ts — 提现管理

**用户提现请求** `requestWithdrawal(params)`：

```
1. 验证金额 > 0
2. 验证金额 ≥ minWithdrawalAmount
3. 查询用户余额和 KYC 状态
4. 验证余额 ≥ 提现金额
5. 验证 KYC 已通过
6. 事务：原子扣减余额 + 创建提现记录（状态 = pending）
7. 扣减 SQL 自带余额条件，避免并发提现导致透支
```

**管理员处理** `processWithdrawal(params)`：

```
1. 查询提现记录
2. 检查状态是否已终结（completed/rejected 不可重复处理）
3. 事务：更新状态 + (如果 rejected) 退还余额
```

## 推荐归因流程

### Cookie 设置（中间件层）

三个框架各自实现了 URL 参数到 Cookie 的转换：

| 框架 | 实现位置 | 触发条件 |
|------|---------|---------|
| Next.js | `apps/next-app/middleware.ts` | 请求 URL 包含 `?ref=XXX` |
| Nuxt.js | `apps/nuxt-app/middleware/referral.global.ts` | 请求 URL 包含 `?ref=XXX` |
| TanStack | `apps/tanstack-app/src/routes/__root.tsx` | 请求 URL 包含 `?ref=XXX` |

Cookie 设置参数：
- Name: `referral_code`
- Max-Age: `config.affiliate.cookie.expiryDays × 86400` 秒
- Path: `/`
- HttpOnly: `false`（需要前端 JS 读取）
- SameSite: `Lax`

### Claim 流程（首次访问仪表盘）

```
用户登录 → 访问 Dashboard → 前端组件 mount →
检测 referral_code Cookie → POST /api/affiliate/claim →
后端调用 applyReferralCodeToUser() →
若 bonus 发放失败则前端给出提示 →
成功后清除 Cookie
```

## 佣金处理流程

### 支付 Webhook 集成

在每个支付提供商的 Webhook 处理器中，订单标记为 `PAID` 之后统一调用：

```typescript
// libs/payment/providers/*.ts (或各 app 的 webhook route)
import { processReferralCommission } from '@libs/affiliate';

// 在订单状态更新为 PAID 之后
await processReferralCommission(orderId);
```

已集成的支付提供商：
- Stripe (`checkout.session.completed`)
- WeChat Pay
- Alipay
- Creem
- PayPal

### 订单 Metadata 注入

在支付发起路由中，仅使用用户已持久化的 `referredByCode` 将推荐信息写入订单 metadata：

```typescript
const currentUser = await db.select().from(user).where(eq(user.id, userId));
if (currentUser[0].referredByCode) {
  const referrer = await db.select().from(user)
    .where(eq(user.referralCode, currentUser[0].referredByCode));
  if (referrer.length) {
    orderMetadata.referralCode = currentUser[0].referredByCode;
    orderMetadata.referrerId = referrer[0].id;
  }
}
```

## 提现管理流程

### 用户端 API

```
POST /api/withdrawal/request
├── Body: { amount, paymentMethod, paymentAccount }
├── 验证用户身份
├── 调用 requestWithdrawal()
└── 返回 { success, withdrawalId }

GET /api/withdrawal/history
├── Query: limit, offset
├── 验证用户身份
└── 返回用户的提现记录列表
```

### 管理端 API

```
GET /api/admin/withdrawals
├── 验证管理员权限
├── 支持 search（按邮箱）、limit、offset
└── 返回所有提现记录（JOIN user 获取邮箱）

PATCH /api/admin/withdrawals/[id]
├── 验证管理员权限
├── Body: { status: 'completed' | 'rejected', adminNote? }
├── 调用 processWithdrawal()
└── rejected → 自动退还余额
```

## 框架适配

### 路由文件对照表

| 功能 | Next.js | Nuxt.js | TanStack Start |
|------|---------|---------|----------------|
| Affiliate Stats | `app/api/affiliate/stats/route.ts` | `server/api/affiliate/stats.get.ts` | `routes/api/affiliate/stats.ts` |
| Claim | `app/api/affiliate/claim/route.ts` | `server/api/affiliate/claim.post.ts` | `routes/api/affiliate/claim.ts` |
| Referrals | `app/api/affiliate/referrals/route.ts` | `server/api/affiliate/referrals.get.ts` | `routes/api/affiliate/referrals.ts` |
| Commissions | `app/api/affiliate/commissions/route.ts` | `server/api/affiliate/commissions.get.ts` | `routes/api/affiliate/commissions.ts` |
| Withdrawal Request | `app/api/withdrawal/request/route.ts` | `server/api/withdrawal/request.post.ts` | `routes/api/withdrawal/request.ts` |
| Withdrawal History | `app/api/withdrawal/history/route.ts` | `server/api/withdrawal/history.get.ts` | `routes/api/withdrawal/history.ts` |
| Admin Commissions | `app/api/admin/commissions/route.ts` | `server/api/admin/commissions.get.ts` | `routes/api/admin/commissions.ts` |
| Admin Withdrawals | `app/api/admin/withdrawals/route.ts` | `server/api/admin/withdrawals/index.ts` | `routes/api/admin/withdrawals/index.ts` |
| Admin Withdrawal Action | `app/api/admin/withdrawals/[id]/route.ts` | `server/api/admin/withdrawals/[id].patch.ts` | `routes/api/admin/withdrawals/$id.ts` |

### UI 组件对照表

| 功能 | Next.js / TanStack (React) | Nuxt.js (Vue) |
|------|---------------------------|---------------|
| Dashboard Affiliate Tab | `libs/react-shared/ui/dashboard-affiliate-tab.tsx` | `apps/nuxt-app/components/dashboard/DashboardAffiliateTab.vue` |
| Dashboard Withdrawal Tab | `libs/react-shared/ui/dashboard-withdrawal-tab.tsx` | `apps/nuxt-app/components/dashboard/DashboardWithdrawalTab.vue` |
| Admin Commissions Page | `apps/next-app/app/[lang]/admin/commissions/page.tsx` | `apps/nuxt-app/pages/admin/commissions/index.vue` |
| Admin Withdrawals Page | shared via existing admin layout | `apps/nuxt-app/pages/admin/withdrawals/index.vue` |

## 功能开关设计

### 三层控制

```
AFFILIATE_ENABLED=true  # 默认关闭；显式开启返利功能
    │
    ├── UI 层：仪表盘隐藏 Affiliate / Withdrawal 标签
    │          管理后台隐藏 Commissions / Withdrawals 导航
    │
    ├── API 层：stats 接口返回 { enabled: false }
    │           claim / withdrawal 接口返回错误
    │
    └── Webhook 层：processReferralCommission() 直接跳过
                    日志记录 "Skipped: affiliate disabled"
```

### UI 侧实现

```typescript
// React (Next.js / TanStack)
const { data } = useAffiliateStats();
if (!data?.enabled) return null;  // 不渲染标签页

// Vue (Nuxt.js)
const affiliateEnabled = ref(false);
const { data } = await useFetch('/api/affiliate/stats');
affiliateEnabled.value = data.value?.enabled ?? false;
```

## 数据库兼容性

### 关键原则

所有涉及数值计算的 SQL 使用标准 `CAST()` 语法，不使用任何数据库特有的类型转换：

```typescript
// ✅ 正确 — 兼容 PostgreSQL 和 SQLite
commissionBalance: sql`CAST(COALESCE(${user.commissionBalance}, '0') AS REAL) + ${amount}`
totalCommission: sql`COALESCE(SUM(CAST(${commission.commissionAmount} AS REAL)), 0)`
totalReferrals: sql`CAST(COUNT(*) AS INTEGER)`

// ❌ 错误 — 仅 PostgreSQL 支持
commissionBalance: sql`${user.commissionBalance}::numeric + ${amount}`
count: sql`COUNT(*)::int`
```

### 验证矩阵

| 框架 | PostgreSQL | SQLite | 通过 |
|------|-----------|--------|------|
| Next.js | ✅ | ✅ | 13/13 E2E |
| Nuxt.js | ✅ | ✅ | 13/13 E2E |
| TanStack Start | ✅ | ✅ | 13/13 E2E |

## 测试覆盖

### E2E 测试文件

- `tests/e2e/specs/affiliate.spec.ts` — 8 个用户端测试
- `tests/e2e/specs/admin-affiliate.spec.ts` — 5 个管理端测试

### 测试场景

| 测试 | 覆盖内容 |
|------|---------|
| Affiliate stats API | 返回推荐码、佣金余额、配置信息 |
| Referral link copy | 仪表盘推荐链接展示和复制 |
| Claim flow | Cookie → API → 推荐关系建立 |
| Commission history | 佣金记录列表展示 |
| Withdrawal request | 提现申请表单和余额验证 |
| Dashboard tabs | Affiliate / Withdrawal 标签页切换 |
| Admin commissions | 管理员佣金记录查看和搜索 |
| Admin withdrawals | 管理员提现审批（批准/拒绝） |

### 运行测试

```bash
# 运行 affiliate 相关测试
npx playwright test --config=tests/e2e/playwright.config.ts --grep "Affiliate"

# 跨数据库测试（切换后需重启 dev server）
DB_DIALECT=pg npx playwright test --grep "Affiliate"
DB_DIALECT=sqlite npx playwright test --grep "Affiliate"
```
