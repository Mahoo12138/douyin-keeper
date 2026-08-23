# Middleware Directory - 统一认证系统

## 概述

本目录包含Nuxt应用的**客户端页面认证**和**服务端API保护**的完整middleware系统，采用**配置驱动**的方式管理所有路由保护。

## 🎯 设计理念

- **统一处理**: 一个middleware处理所有认证场景
- **配置驱动**: 通过数组配置管理路由保护  
- **简单易用**: 减少认知负担和维护成本
- **易于扩展**: 添加新路由只需修改配置
- **双重保护**: 客户端页面 + 服务端API 全面安全

## 📁 文件结构

### 🌐 客户端Middleware (middleware/)
| 文件 | 类型 | 作用域 | 说明 |
|------|------|--------|------|
| `auth.global.ts` | 全局 | 🔒 **核心** | 统一处理所有页面认证、权限、订阅检查 |
| `auth.ts` | 手动 | 🔐 可选 | 简单认证检查，特殊场景使用 |
| `guest.ts` | 手动 | 👤 登录页面 | 仅允许未认证用户访问 |
| `locale.global.ts` | 全局 | 🌍 国际化 | 语言检测和设置 |

### ⚙️ 服务端Middleware (server/middleware/)
| 文件 | 类型 | 作用域 | 说明 |
|------|------|--------|------|
| `permissions.ts` | 服务端 | 🛡️ **核心** | API权限保护，RBAC权限检查 |
| `auth.ts` | 服务端 | 🔐 基础 | API基础认证检查 |

## 🚀 统一认证系统优势

### ✅ 从6个文件 → 3个核心文件
- ~~`admin.ts`~~ → 合并到 `auth.global.ts`
- ~~`subscription.ts`~~ → 合并到 `auth.global.ts`  
- 保留 `auth.ts` 作为轻量级选项
- 保留 `guest.ts` 用于登录页面

### ✅ 双层保护架构
```typescript
// 客户端页面保护
const protectedRoutes = [
  { pattern: /^\/admin(\/.*)?$/, requiresAuth: true, requiredPermission: {...} }
]

// 服务端API保护  
const protectedApiRoutes = [
  { pattern: /^\/api\/admin(\/.*)?$/, requiredPermission: { action: Action.MANAGE, subject: Subject.ALL } }
]
```

## 📋 添加新路由 - 快速指南

### 🟢 公开路由
```typescript
// 页面: 无需配置，直接创建页面
// API: 无需配置，直接创建API
// 示例: /about, /contact, /api/health
```

### 🔐 需要认证的路由

#### 页面路由
```typescript
// 在 middleware/auth.global.ts 的 protectedRoutes 中添加:
{
  pattern: /^\/profile(\/.*)?$/,
  type: 'page',
  requiresAuth: true
}
```

#### API路由
```typescript
// 在 server/middleware/permissions.ts 的 protectedApiRoutes 中添加:
{
  pattern: /^\/api\/profile(\/.*)?$/,
  // 自动要求认证，无需额外配置
}
```

### 💳 需要订阅的路由

#### 页面路由
```typescript
{
  pattern: /^\/advanced-features(\/.*)?$/,
  type: 'page', 
  requiresAuth: true,
  requiresSubscription: true
}
```

#### API路由
```typescript
{
  pattern: /^\/api\/premium(\/.*)?$/,
  requiresSubscription: true
}
```

### 🛡️ 需要特定权限的路由

#### 页面路由
```typescript
{
  pattern: /^\/admin\/reports(\/.*)?$/,
  type: 'page',
  requiresAuth: true, 
  requiredPermission: { action: Action.READ, subject: Subject.REPORT }
}
```

#### API路由
```typescript
{
  pattern: /^\/api\/admin\/reports(\/.*)?$/,
  requiredPermission: { action: Action.READ, subject: Subject.REPORT }
}
```

### 👤 仅未登录用户页面
```typescript
// 在页面中使用
definePageMeta({
  middleware: 'guest'
})
```

## 🔄 认证流程

### 🌐 客户端页面流程
```
页面访问 → auth.global.ts → 配置匹配 → 认证检查 → 权限检查 → 订阅检查 → 允许/重定向
```

### ⚙️ 服务端API流程
```
API请求 → permissions.ts → 配置匹配 → Session获取 → 权限检查 → 订阅检查 → 200/401/403
```

## 🛡️ API权限保护详解

### 保护的API路由

```typescript
// 管理员API - 需要 MANAGE:ALL 权限
/api/admin/*        // 管理员面板API
/api/users/*        // 用户管理API

// 认证API - 需要登录
/api/chat/*         // 聊天功能
/api/orders         // 订单查询
/api/subscription/* // 订阅管理

// 付费API - 需要有效订阅
/api/premium/*      // 高级功能API
```

### 自动跳过的API路由

```typescript
// 公开API
/api/auth/*         // 认证相关
/api/payment/webhook/* // 支付回调
/api/health         // 健康检查
```

### API认证错误响应

```typescript
// 401 Unauthorized - 未登录
{
  statusCode: 401,
  statusMessage: 'Unauthorized'
}

// 403 Forbidden - 权限不足  
{
  statusCode: 403,
  statusMessage: 'Forbidden'
}

// 402 Payment Required - 需要订阅
{
  statusCode: 402,
  statusMessage: 'Subscription required'
}
```

### API权限检查示例

```typescript
// 在API处理器中访问认证信息
export default defineEventHandler(async (event) => {
  // middleware已经验证了权限，可以安全访问用户信息
  const user = event.context.user
  const session = event.context.session
  
  // 进行业务逻辑处理
  console.log(`API accessed by user: ${user.id}`)
})
```

### 手动权限检查 (特殊场景)

```typescript
// 如果需要额外的实例级权限检查
import { can, createAppUser, Action, Subject } from '@libs/permissions'

export default defineEventHandler(async (event) => {
  const user = event.context.user // 已通过middleware验证
  const resourceId = getRouterParam(event, 'id')
  
  // 获取资源
  const resource = await getResource(resourceId)
  
  // 检查用户是否可以访问特定资源
  const appUser = createAppUser(user)
  if (!can(appUser, Action.READ, Subject.PROJECT, resource)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Access to this resource denied'
    })
  }
  
  // 继续处理...
})
```

## 🔍 故障排除

### 常见问题

❌ **新页面路由没有保护**
```typescript
// 解决: 添加到客户端 protectedRoutes 配置
{
  pattern: /^\/your-route(\/.*)?$/,
  type: 'page',
  requiresAuth: true
}
```

❌ **新API没有保护**
```typescript
// 解决: 添加到服务端 protectedApiRoutes 配置
{
  pattern: /^\/api\/your-endpoint(\/.*)?$/,
  requiredPermission: { action: Action.READ, subject: Subject.DATA }
}
```

❌ **管理员API返回403错误**
```typescript
// 检查用户是否有 admin 角色
console.log('User role:', user?.role)
console.log('Has admin permission:', can(appUser, Action.MANAGE, Subject.ALL))
```

❌ **API返回401错误**
```typescript
// 检查请求是否包含有效的session cookie
// 检查API路由是否在保护列表中
console.log('Session:', session)
console.log('API URL:', event.node.req.url)
```

### 调试日志

#### 客户端页面
```bash
🔒 Protected route accessed: /admin/users (Type: page)
🛡️ Checking permissions for: /admin (MANAGE:ALL)
💳 Checking subscription for: /premium-features, User: 123
✅ Access granted to: /admin for user: 123
```

#### 服务端API
```bash
🔒 API request: GET /api/admin/users
🛡️ Protected API route accessed: /api/admin/users  
🔑 Authentication successful for API: /api/admin/users, User: 123
🎯 Authorization successful (permissions check passed) for user 123 on API /api/admin/users
```

## 💡 最佳实践

### DO ✅
- 为新页面路由添加配置到客户端 `protectedRoutes`
- 为新API添加配置到服务端 `protectedApiRoutes`
- 使用描述性的路由模式和权限配置
- 依赖统一的认证系统，避免手动检查
- 在API处理器中使用 `event.context.user` 获取用户信息

### DON'T ❌  
- ~~不要再使用 `middleware: 'admin'`~~ (已自动处理)
- ~~不要创建新的认证middleware~~ (使用统一系统)
- 不要硬编码权限检查
- 不要在API中重复验证已保护的权限
- 不要忽略API端点的保护配置

## 📊 性能优势

### 客户端
- **单次session获取** - 避免重复调用
- **统一错误处理** - 减少代码重复
- **配置缓存** - 路由匹配优化

### 服务端  
- **并行权限检查** - 高效的RBAC验证
- **智能路由匹配** - 只检查需要保护的API
- **Context传递** - 避免重复session查询

## 🔗 相关文档

- 📖 [完整认证系统文档](../../docs/nuxt-auth-system.md)
- 🔐 [权限系统文档](../../libs/permissions/README.md)
- 🛠️ [Better Auth配置](../../libs/auth/README.md)
- 🗃️ [数据库Schema](../../libs/database/schema/)

---

## 🎯 总结

简化后的统一认证系统：
- 🎯 **双层保护**: 客户端页面 + 服务端API
- 🔧 **配置驱动** 的路由保护
- 📝 **易于维护** 和扩展
- 🚀 **更好的性能** 和开发体验
- 🛡️ **RBAC权限控制** 确保安全

*从复杂到简单 - 统一认证系统让全栈开发更安全、更轻松* 