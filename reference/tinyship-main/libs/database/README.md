# TinyShip 数据库模块

这个模块使用 Drizzle ORM 管理与 PostgreSQL 数据库的交互，提供了简单易用的数据访问接口。

## 使用方法

### 前提条件

确保你的 `.env` 文件中设置了数据库连接信息:

```env
# 数据库配置
DATABASE_URL="postgresql://username:password@localhost:5432/tinyship"
```

### 在应用中使用

```typescript
// 导入数据库客户端和模型
import { db, user, account, session, verification, subscription, order } from "@libs/database";
import { eq } from "drizzle-orm";

// 查询用户
const userResult = await db.select().from(user).where(eq(user.email, "user@example.com"));

// 查询用户的认证账户
const userAccounts = await db.select().from(account).where(eq(account.userId, userResult[0].id));

// 创建订阅
await db.insert(subscription).values({
  id: "sub_" + crypto.randomUUID(),
  userId: userResult[0].id,
  planId: "monthly", // 对应 config.payment.plans 中的计划 ID
  status: "active",
  paymentType: "one_time",
  periodStart: new Date(),
  periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天后
});

// 创建支付订单
await db.insert(order).values({
  id: "ord_" + crypto.randomUUID(),
  userId: userResult[0].id,
  amount: "100", // 使用字符串类型，因为 numeric 字段
  currency: "CNY",
  planId: "monthly", // 对应 config.payment.plans 中的计划 ID
  provider: "wechat",
  status: "pending"
});
```

## 数据模型

### 用户 (Users)

用户表管理应用中的用户账户信息，字段包括:
- **基本信息**: `id`, `name`, `email`, `image`
- **身份验证**: `emailVerified` 邮箱验证状态
- **用户角色**: `role` (admin/user)
- **手机相关**: `phoneNumber`, `phoneNumberVerified`
- **支付客户ID**: `stripeCustomerId`, `creemCustomerId`
- **管理功能**: `banned`, `banReason`, `banExpires` (Better-Auth 管理员功能)
- **时间戳**: `createdAt`, `updatedAt`

### 账户 (Account)

账户表存储用户的认证信息，支持多种认证方式:
- **OAuth 认证**: 存储访问令牌、刷新令牌等
- **Credential 认证**: 存储用户密码 (经过加密)
- **提供商信息**: `providerId` (Google, GitHub, 微信等)
- **令牌管理**: `accessToken`, `refreshToken`, `idToken`
- **过期时间**: `accessTokenExpiresAt`, `refreshTokenExpiresAt`
- **授权范围**: `scope` OAuth 权限范围

### 验证 (Verification)

验证表管理各种验证请求:
- **邮箱验证**: 新用户注册邮箱验证
- **密码重置**: 忘记密码重置令牌
- **手机验证**: 短信验证码
- **过期管理**: `expiresAt` 自动清理过期验证请求

### 会话 (Sessions)

会话表管理用户登录会话，跟踪:
- **会话标识**: `id`, `token` 唯一会话令牌
- **过期时间**: `expiresAt`
- **用户设备**: `ipAddress`, `userAgent`
- **身份模拟**: `impersonatedBy` (Better-Auth 功能)
- **时间戳**: `createdAt`, `updatedAt`

### 订阅 (Subscriptions)

订阅表跟踪用户的付款和订阅信息:
- **计划信息**: `planId` 对应 `config.payment.plans` 中的 ID
- **订阅状态**: `status` (active, canceled, past_due, unpaid, trialing, inactive)
- **付款类型**: `paymentType` (one_time, recurring)
- **支付平台**: `stripeCustomerId`, `stripeSubscriptionId`, `creemCustomerId`, `creemSubscriptionId`
- **订阅周期**: `periodStart`, `periodEnd`, `cancelAtPeriodEnd`
- **元数据**: `metadata` 存储额外信息

### 订单 (Orders)

订单表管理所有支付交易记录:
- **基本信息**: `amount` (numeric), `currency`, `planId`
- **支付状态**: `status` (pending, paid, failed, refunded, canceled)
- **支付提供商**: `provider` (wechat, stripe, creem)
- **平台订单ID**: `providerOrderId` 支付平台的订单ID
- **元数据**: `metadata` (JSON) 支付平台返回的额外信息
- **时间戳**: `createdAt`, `updatedAt`

## 数据库管理命令

通过根目录的命令可以管理数据库：

```bash
# 检查数据库连接
pnpm db:check

# 生成数据库迁移文件 (使用 drizzle-kit)
pnpm db:generate

# 推送数据库架构到数据库 (使用 drizzle-kit)
pnpm db:push

# 应用数据库迁移
pnpm db:migrate

# 启动 Drizzle Studio 可视化界面
pnpm db:studio

# 填充测试数据
pnpm db:seed
```

### Drizzle Studio

Drizzle Studio 提供了一个可视化界面来查看和修改数据库内容。使用 `pnpm db:studio` 命令启动，
然后在浏览器中访问提供的URL（通常是 https://local.drizzle.studio）。

通过 Studio 你可以：
- 浏览数据库表和记录
- 添加、编辑和删除记录
- 查看表关系
- 执行基本查询

## 注意事项

### 字段类型说明

- **`amount` 字段**: 使用 `numeric` 类型，插入时需要传字符串 (如 `"100"`)
- **`id` 字段**: 所有表都使用 `text` 类型的主键，建议使用 UUID 格式
- **`planId` 字段**: 必须对应 `config.payment.plans` 中定义的计划 ID
- **时间戳**: 大多数表自动设置 `createdAt` 和 `updatedAt`

### 数据一致性

- 订阅和订单必须关联有效的用户 ID
- 支付平台的客户 ID 和订阅 ID 应保持一致
- 订阅状态变更需要同时更新相关订单状态

### 最佳实践

1. 使用事务处理复杂的数据操作
2. 定期清理过期的验证记录
3. 为重要查询添加适当的数据库索引
4. 在生产环境中定期备份数据库

## 参考文档

- [Drizzle ORM 官方文档](https://orm.drizzle.team/) - 查询构建、关系定义、迁移等
- [Drizzle Kit 文档](https://orm.drizzle.team/kit-docs/overview) - 数据库迁移和管理工具
- [PostgreSQL 文档](https://www.postgresql.org/docs/) - PostgreSQL 数据库参考
- [数据库配置指南](../../docs/user-guide/database.md) - 项目特定的配置说明