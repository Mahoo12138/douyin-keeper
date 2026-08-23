# 🤝 返利系统配置指南

返利系统允许用户通过推荐链接邀请新用户注册，在被推荐用户的每笔消费中获得现金佣金。系统同时支持双向注册奖励（推荐人和被推荐人各获得积分奖励）。

> 💡 **前置条件**：返利系统依赖支付系统和积分系统。请先完成 [支付配置](./payment-testing.md) 和 [积分配置](./credits.md)。

## 🔗 相关页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 用户仪表盘 - Affiliate | `/dashboard` (Affiliate 标签) | 查看推荐链接、佣金余额、推荐记录 |
| 用户仪表盘 - Withdrawal | `/dashboard` (Withdrawal 标签) | 申请提现、查看提现记录 |
| 管理后台 - 佣金 | `/admin/commissions` | 管理员查看所有佣金记录 |
| 管理后台 - 提现 | `/admin/withdrawals` | 管理员审批提现请求 |

## 📑 目录

- [💡 系统概述](#-系统概述)
- [⚡ 快速启用](#-快速启用)
- [📦 环境变量配置](#-环境变量配置)
- [🔄 工作流程](#-工作流程)
- [🔌 API 端点](#-api-端点)
- [🛠️ 管理员操作](#️-管理员操作)
- [🎯 常见问题](#-常见问题)

## 💡 系统概述

| 特性 | 说明 |
|------|------|
| **佣金模式** | 百分比佣金（默认 20%）或固定金额 |
| **佣金触发** | 被推荐用户的每笔成功付款 |
| **注册奖励** | 推荐人和被推荐人各获得积分奖励（默认各 10 积分） |
| **提现方式** | 用户申请 → 管理员手动审批处理 |
| **支持的支付** | Stripe、WeChat Pay、Alipay、Creem、PayPal |
| **开关控制** | 默认关闭；设置 `AFFILIATE_ENABLED=true` 后启用 |

## ⚡ 快速启用

返利系统**默认关闭**。完成支付、风控、提现和客服流程配置后，设置 `AFFILIATE_ENABLED=true` 才会启用。

启用后，用户仪表盘会自动出现 **Affiliate** 和 **Withdrawal** 两个标签页，管理后台侧边栏出现 **Commissions** 和 **Withdrawals** 导航。

### 最小配置

必须显式开启；其余参数均可使用默认值：

```env
# 必填：默认关闭
AFFILIATE_ENABLED=true
# 可选：其余值均有合理默认值
# AFFILIATE_COMMISSION_RATE=0.20      # 默认 20% 佣金
# AFFILIATE_REFERRER_SIGNUP_BONUS=10  # 推荐人注册奖励 10 积分
# AFFILIATE_REFEREE_SIGNUP_BONUS=10   # 被推荐人注册奖励 10 积分
# AFFILIATE_MIN_WITHDRAWAL=100        # 最低提现金额 100
# AFFILIATE_COOKIE_EXPIRY_DAYS=30     # 推荐链接 Cookie 有效期 30 天
```

### 禁用返利系统

```env
AFFILIATE_ENABLED=false
```

设置后：
- 用户仪表盘不显示 Affiliate / Withdrawal 标签
- 管理后台不显示佣金/提现导航
- API 返回 `enabled: false`
- 支付 Webhook 跳过佣金处理

## 📦 环境变量配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AFFILIATE_ENABLED` | `false` | 系统总开关；设为 `true` 后启用 |
| `AFFILIATE_COMMISSION_RATE` | `0.20` | 佣金比例（0.20 = 20%） |
| `AFFILIATE_FIXED_COMMISSION_AMOUNT` | `0` | 固定佣金金额（>0 时覆盖百分比模式） |
| `AFFILIATE_CURRENCY` | `USD` | 佣金结算币种（ISO 4217），详见下方币种说明 |
| `AFFILIATE_COOKIE_EXPIRY_DAYS` | `30` | 推荐 Cookie 有效天数 |
| `AFFILIATE_MIN_WITHDRAWAL` | `100` | 最低提现金额（单位与 `AFFILIATE_CURRENCY` 一致） |
| `AFFILIATE_REFERRER_SIGNUP_BONUS` | `10` | 推荐人获得的注册积分奖励 |
| `AFFILIATE_REFEREE_SIGNUP_BONUS` | `10` | 被推荐人获得的注册积分奖励 |

### ⚠️ 币种限制（重要）

当前返利系统**仅支持单一币种**。佣金余额 `commissionBalance` 是一个简单数值累加字段，不区分币种。

**如果你的 `config/payment.ts` 中有多个币种的 plan（如 USD 和 CNY），你必须确保参与返利的 plan 都使用同一币种。** 混合不同币种的佣金会导致余额数字无实际意义。

推荐做法：

1. 将 `AFFILIATE_CURRENCY` 设为你主要的计费币种（默认 `USD`）
2. 确保 `config/payment.ts` 中所有参与返利的 plan 的 `currency` 与 `AFFILIATE_CURRENCY` 一致
3. 如果你同时有 CNY 和 USD 的 plan，考虑仅对其中一种币种的 plan 启用佣金（需自行在 Webhook 处理逻辑中过滤）

> 💡 未来版本可能会支持按币种分桶存储佣金余额，但当前请严格保持币种一致。

### 配置示例

```env
# 高佣金模式（适合高客单价产品）
AFFILIATE_COMMISSION_RATE=0.30
AFFILIATE_MIN_WITHDRAWAL=50

# 固定佣金模式（每单固定 5 元）
AFFILIATE_FIXED_COMMISSION_AMOUNT=5

# 大额注册奖励（促进推荐）
AFFILIATE_REFERRER_SIGNUP_BONUS=50
AFFILIATE_REFEREE_SIGNUP_BONUS=20
```

## 🔄 工作流程

### 推荐注册流程

```
1. 用户 A 在仪表盘获取推荐链接：https://yourapp.com?ref=NjMDryrv
2. 用户 B 点击链接访问网站
3. 中间件自动将 ref 参数存为 Cookie（30 天有效）
4. 用户 B 注册并登录
5. 首次访问仪表盘时自动触发 claim
6. 系统将推荐关系记录到数据库
7. 双方各获得积分奖励（如果配置了奖励金额 > 0）
```

### 佣金产生流程

```
1. 用户 B（被推荐人）购买任何付费计划或积分包
2. 支付成功 → 支付 Webhook 触发
3. Webhook 处理完订单后调用 processReferralCommission(orderId)
4. 系统检查订单元数据中的推荐人信息
5. 按配置的佣金比例计算佣金金额
6. 创建佣金记录，累加到推荐人的 commissionBalance
```

### 提现流程

```
1. 用户 A 在仪表盘 Withdrawal 标签申请提现
2. 填写金额、支付方式（支付宝/银行转账等）、收款账号
3. 系统验证余额 ≥ 提现金额 ≥ 最低提现金额
4. 余额立即扣减（防止重复提现）
5. 管理员在后台审批：
   - 批准（completed）：管理员手动转账
   - 拒绝（rejected）：余额自动退还
```

## 🔌 API 端点

### 用户端

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/affiliate/stats` | 获取推荐统计（佣金余额、推荐码、佣金率等） |
| `GET` | `/api/affiliate/referrals?limit=10` | 获取推荐的用户列表 |
| `GET` | `/api/affiliate/commissions?limit=10` | 获取佣金记录 |
| `POST` | `/api/affiliate/claim` | 认领推荐码（从 Cookie 读取） |
| `POST` | `/api/withdrawal/request` | 申请提现 |
| `GET` | `/api/withdrawal/history?limit=10` | 获取提现记录 |

### 管理端

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/admin/commissions?limit=20&offset=0&search=` | 查看所有佣金记录 |
| `GET` | `/api/admin/withdrawals?limit=20&offset=0&search=` | 查看所有提现请求 |
| `PATCH` | `/api/admin/withdrawals/[id]` | 审批提现（status: completed/rejected） |

### 响应示例

#### GET /api/affiliate/stats

```json
{
  "referralCode": "NjMDryrv",
  "referralLink": "https://yourapp.com?ref=NjMDryrv",
  "commissionBalance": 45.60,
  "commissionRate": 0.20,
  "totalCommission": 120.00,
  "totalPaidReferrals": 8,
  "totalRegisteredReferrals": 15,
  "currency": "USD",
  "referrerSignupBonus": 10,
  "refereeSignupBonus": 10,
  "minWithdrawalAmount": 100,
  "enabled": true
}
```

#### POST /api/withdrawal/request

```json
// 请求
{
  "amount": 100,
  "paymentMethod": "alipay",
  "paymentAccount": "user@email.com"
}

// 成功响应
{
  "success": true,
  "withdrawalId": "abc123"
}

// 余额不足
{
  "success": false,
  "error": "Insufficient commission balance"
}
```

## 🛠️ 管理员操作

### 查看佣金记录

访问 `/admin/commissions`，可以：
- 查看所有用户的佣金记录
- 按邮箱搜索
- 查看佣金金额、订单金额、佣金率、状态

### 审批提现

访问 `/admin/withdrawals`，可以：
- 查看所有提现申请
- 按邮箱搜索
- 点击 **Approve** 批准提现（需手动转账）
- 点击 **Reject** 拒绝提现（余额自动退还用户）

## 🎯 常见问题

### 用户看不到 Affiliate 标签？

检查 `AFFILIATE_ENABLED=true` 已配置。重启开发服务器使配置生效。

### 佣金没有产生？

1. 确认被推荐用户的订单 metadata 中包含 `referralCode` 和 `referrerId`
2. 查看支付 Webhook 日志中是否有 `[Affiliate][Commission]` 相关输出
3. 确认 `processReferralCommission(orderId)` 已在对应支付方式的 Webhook 中调用

### 推荐链接不生效？

1. 确认链接包含 `?ref=CODE` 参数
2. 检查浏览器是否设置了 `referral_code` Cookie
3. 用户必须注册并登录后才能 claim
4. 每个用户只能被推荐一次

### 数据库 SQLite 兼容性？

系统同时支持 PostgreSQL 和 SQLite。所有 SQL 使用标准 `CAST()` 语法，已在两种数据库上通过完整 E2E 测试。

---

📚 **相关文档**：
- [积分系统配置](./credits.md) — 注册奖励通过积分系统发放
- [支付测试指南](./payment-testing.md) — 测试支付 Webhook 触发佣金
- [数据库配置](./database.md) — PostgreSQL / SQLite 切换
