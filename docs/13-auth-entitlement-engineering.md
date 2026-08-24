# Auth + Entitlement 工程设计

> 本文冻结用户认证、PC/微信小程序身份绑定、Session 管理、卡密兑换、权益检查和配额控制的后端实现边界。前端表现不在本文范围内。

## 1. 目标与边界

Auth 与 Entitlement 是两个独立上下文：

```text
Auth
├─ 谁是当前用户
├─ 当前客户端是否已登录
├─ 身份如何绑定/注销
└─ 用户是否为管理员

Entitlement
├─ 当前用户是否有有效授权
├─ 当前授权允许哪些 Feature
├─ 当前配额是多少
└─ 某个动作是否还能占用配额
```

必须避免：

- 把会员到期时间直接写进 `users`；
- 把账号配额直接写进 `users`；
- 用登录状态代表权益状态；
- 用权益状态代表抖音 Session/Capability 状态；
- 在 Sidecar 中处理用户授权；
- 在卡密系统中出现订单、价格、支付状态。

最终动作 Gate：

```text
Authenticated
AND User active
AND Entitlement active
AND Feature entitled
AND Quota available
AND Account belongs to user
AND Account/Session/Capability/Risk allows
```

## 2. Auth 身份模型

### 2.1 User

`users` 是内部主体，不保存密码和微信 OpenID。

建议字段：

```text
id
public_id
role                user | admin
status              active | disabled
display_name
timezone            default Asia/Shanghai
created_at
updated_at
deleted_at
```

`disabled` 后所有现存 AuthSession 都视为无效。

Admin 禁用用户时必须在同一事务中更新 `users.status`、撤销该用户全部 `auth_sessions` 和未使用
Refresh Token，并写入 `user.disable` 审计日志；恢复用户只更新状态，不恢复旧会话，避免撤销后的
凭据重新获得访问权。请求鉴权阶段仍需重新加载用户并拒绝 `status != active` 的访问令牌。

### 2.2 AuthIdentity

MVP 建议只保留两种 Provider：

```text
local
wechat_mini
```

`local`：

- `provider_subject` = 规范化后的用户名；
- `credential_hash` = Argon2id 密码哈希。

`wechat_mini`：

- `provider_subject` = 后端规范化的微信主体标识；
- `credential_hash = NULL`；
- `openid/unionid` 不下发给其他业务模块。

数据库约束：

```text
UNIQUE(provider, provider_subject)
```

业务代码不得根据 display_name / nickname 判断身份。

## 3. PC 登录策略

MVP 推荐用户名 + 密码，避免为了首版额外引入邮件验证、短信登录和找回密码系统。

接口：

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
POST /api/v1/auth/logout-all
GET  /api/v1/me
```

如果后续增加邮箱，只新增 Identity Provider，不修改 User 主体模型。

### 3.1 密码

要求：

- 使用 Argon2id；
- 参数通过配置管理并可升级；
- 成功登录后如果旧参数弱于当前策略，可透明 rehash；
- 日志不得记录密码、哈希、Authorization header；
- 登录失败返回统一错误，不区分“用户名不存在”和“密码错误”。

## 4. Access Token + Refresh Session

推荐：短生命周期 Access Token + 服务器可撤销 Refresh Session。

### Access Token

建议 10~20 分钟，例如 15 分钟。

Claims 只保留：

```text
sub     user_public_id
sid     auth_session_public_id
role
client  web | mini | admin
iat
exp
```

不要把 entitlement、account_quota 等易变化授权信息写进长生命周期 Token。

### Refresh Token

Refresh Token 使用至少 256 bit CSPRNG 随机值。

数据库仅保存：

```text
HMAC-SHA-256(AUTH_REFRESH_PEPPER, refresh_token)
```

不保存明文 Refresh Token。

### auth_sessions + auth_refresh_tokens

`auth_sessions` 表示一个可整体撤销的登录会话：

```text
id
public_id
user_id
client_type          web | mini | admin
expires_at
last_seen_at
revoked_at
revoke_reason
created_at
```

Refresh Token 单独保存在 `auth_refresh_tokens`：

```text
id
session_id
token_hash
expires_at
used_at
revoked_at
replaced_by_id
created_at
```

每次 Refresh：

1. 用 keyed hash 找到 `auth_refresh_tokens` 并 `FOR UPDATE`；
2. 加载并锁定 AuthSession；
3. 如果 Token 已 `used_at != NULL`，视为重放，撤销整个 AuthSession；
4. 如果有效，生成新 Refresh Token 行；
5. 标记旧 Token `used_at` 并写 `replaced_by_id`；
6. 返回新 Access Token / Refresh Token；
7. 旧 Refresh Token 立即失效，但 hash 记录保留用于 reuse detection。

这样 Refresh Token rotation 与重放检测都可以在数据库层可靠实现。

### PC Token 保存

PC Web 推荐：

- Access Token 仅保存在内存；
- Refresh Token 使用 `HttpOnly + Secure + SameSite=Strict/Lax` Cookie；
- 服务端根据直连 TLS 或来自 `TRUSTED_PROXY_CIDRS` 中受信任反向代理的 `X-Forwarded-Proto=https` 设置 `Secure`；反向代理必须覆盖而不是追加该 Header，未配置可信代理时所有转发 Header 都会被忽略，避免客户端伪造协议判断；本地 HTTP 开发环境可不设置 `Secure`；
- Refresh/Logout 检查 Origin：如果请求带有 Origin，必须与当前 Host 同源；小程序或非浏览器
  客户端不带 Origin 时可以使用请求体中的 Refresh Token；
- 不把 Refresh Token 放入 localStorage。

### Mini Token 保存

微信小程序无法复用浏览器 HttpOnly Cookie 模型，API 可以把 Mini Refresh Token 作为响应体返回给小程序客户端保存。

因此 `client_type` 必须进入 Session，并允许后台按客户端撤销。

## 5. 微信小程序绑定模型

MVP 推荐“小程序是已有账号的移动入口”，避免自动创建重复 User。

### 5.1 首次绑定

PC 已登录用户创建一次性 Link Code：

```text
POST /api/v1/auth/link-codes
```

返回：

```text
code
expires_at
```

建议：

- 8 位无歧义随机字符（展示为 `xxxx-xxxx`）；
- 有效期 5 分钟；
- 单次使用；
- 数据库只保存 keyed hash；
- 同一用户同时最多 3 个有效 Link Code。

小程序调用 `wx.login()` 后提交：

```text
POST /api/v1/auth/wechat-mini/link
wechat_code
link_code
```

后端：

1. 服务端向微信交换主体标识；
2. 锁定 Link Code；
3. 检查未过期、未消费；
4. 确认该微信 Identity 未绑定其他 User；
5. 创建 `wechat_mini` AuthIdentity；
6. 消费 Link Code；
7. 创建 Mini AuthSession；
8. 返回 Access/Refresh Token。

整个“绑定 Identity + 消费 Link Code”必须在同一数据库事务完成。创建 Link Code
前锁定 User 行并统计未过期、未消费的记录，超过 3 个立即拒绝，避免并发创建突破上限。

当前实现通过 `infra/wechat` 调用微信 `jscode2session`，只将 OpenID 作为
`wechat_mini.provider_subject` 交给 Auth；微信 `session_key` 不进入领域模型、不落库。
未配置完整 AppID/Secret 时保留明确的 `WECHAT_IDENTITY_NOT_LINKED` 失败语义。

### 5.2 后续登录

```text
POST /api/v1/auth/wechat-mini/login
wechat_code
```

后端交换主体标识并查找已有 Identity。

未绑定时返回稳定业务码：

```text
WECHAT_IDENTITY_NOT_LINKED
```

而不是自动创建第二个 User。

## 6. Admin 鉴权

Admin 不单独建立另一套用户表。

```text
users.role = admin
```

Admin API 必须经过：

```text
Authenticate
  ↓
RequireRole(admin)
  ↓
Admin Handler
```

建议 Admin Session：

- `client_type = admin`；
- 生命周期短于普通 Web；
- 与普通 Web Session 可独立撤销；
- 高风险动作写 AuditLog。

不要在 Repository 中通过 `isAdmin bool` 偷偷关闭 user scope。Admin 使用独立 Query/Service。

## 7. Auth Middleware 顺序

HTTP 中间件建议：

```text
RequestID
→ Recover
→ SecurityHeaders
→ AccessLog(redacted)
→ RateLimit
→ Authenticate(optional/required)
→ RequireActiveUser
→ Route Handler
```

业务 Route 再组合：

```text
RequireRole
RequireEntitlement
RequireFeature
ResourceOwnership
```

Auth middleware 只产生：

```go
Principal{
    UserID,
    UserPublicID,
    SessionID,
    Role,
    ClientType,
}
```

不在 Context 塞完整 User ORM 对象。

## 8. EntitlementService

推荐接口：

```go
type Service interface {
    GetEffective(ctx context.Context, userID int64, now time.Time) (EffectiveEntitlement, error)
    Redeem(ctx context.Context, userID int64, rawCode string) (Grant, error)
    GrantByAdmin(ctx context.Context, adminID, userID, planID int64, period Period) (Grant, error)
    RevokeGrant(ctx context.Context, adminID, grantID int64, reason string) error
    Authorize(ctx context.Context, req AuthorizationRequest) (AuthorizationDecision, error)
}
```

`GetEffective` MVP 直接查 PostgreSQL，不先做 Redis 缓存。该查询非常轻，优先保证撤销和续期立即生效。确有性能问题后再增加带版本号的缓存。

### EffectiveEntitlement

```text
GrantPublicID
PlanCode
StartsAt
ExpiresAt
AccountQuota
TaskQuota
DailySendQuota
Features
```

没有有效 Grant 时返回明确的 `None`，不是系统错误。

只要存在有效 Grant，账号/任务占用计数和每日使用量都属于授权 Gate 的输入；任一计数
读取失败必须返回错误并停止本次授权，不能用 `0` 或旧快照继续放行。`Authorize` 应复用
同一次 `GetEffective` 读取出的 usage，资源服务在自己的事务中再做最终精确计数。

## 9. Entitlement Gate

禁止 Handler 自己散落写：

```go
if entitlement.PlanCode == "standard" { ... }
```

统一使用请求对象：

```go
AuthorizationRequest{
    UserID,
    Action,             // account.bind, friends.sync, task.create, send.execute...
    RequiredFeature,
    ResourceID,
    Now,
}
```

返回：

```text
Allowed
ReasonCode
EffectiveEntitlement
```

稳定拒绝码：

```text
ENTITLEMENT_REQUIRED
ENTITLEMENT_EXPIRED
FEATURE_NOT_ENTITLED
ACCOUNT_QUOTA_EXCEEDED
TASK_QUOTA_EXCEEDED
DAILY_SEND_QUOTA_EXCEEDED
```

## 10. 配额定义

### 10.1 Account Quota

计数：

```text
binding_status IN (binding, bound)
AND deleted_at IS NULL
```

开始扫码 Binding 时先创建 `binding` Account，因此绑定过程本身占槽位；失败/取消后释放该 Account。

校验和创建 Account 必须在同一事务中锁定 User，避免并发开两个 Binding 超额。

### 10.2 Task Quota

MVP 计数所有未删除 SparkTask：

```text
deleted_at IS NULL
```

禁用任务不释放配额，只有删除才释放，规则最明确。

### 10.3 Daily Send Quota

Daily Send Quota 是产品级硬限额，MVP 按站点配置的统一时区计算，建议 `Asia/Shanghai`。

不要通过 `COUNT(send_jobs)` 临时计算并发配额。

新增日计数器：

```text
entitlement_daily_usage
├─ user_id
├─ local_date
├─ reserved_send_count
├─ succeeded_send_count
├─ failed_send_count
└─ updated_at

PRIMARY KEY(user_id, local_date)
```

创建 SendIntent 时原子 Reserve：

```sql
UPDATE entitlement_daily_usage
SET reserved_send_count = reserved_send_count + 1
WHERE user_id = $1
  AND local_date = $2
  AND reserved_send_count < $daily_limit
RETURNING ...;
```

首次不存在则 `INSERT ... ON CONFLICT` 后重试一次事务逻辑。

含义：

- `reserved_send_count`：当前这一天已经占用的 Intent 数；
- 成功后 `succeeded_send_count + 1`；
- 永久失败/取消/skip 后释放 reservation，并更新 failed（若确实执行失败）；
- 同一个 Intent 重试不重复占用 quota。

## 11. 卡密兑换事务

统一归一化：

```text
trim
uppercase
remove allowed separators
validate prefix/version
reformat canonical value
```

事务：

```text
BEGIN
  SELECT users ... FOR UPDATE
  SELECT card_codes + batch + plan ... FOR UPDATE

  validate user/card/batch/plan
  find last non-revoked grant

  anchor = max(now, lastGrant.expires_at)
  create EntitlementGrant
  mark CardCode redeemed
  write AuditLog
COMMIT
```

注意：卡密 HMAC 在进入数据库查询前计算；日志只记录 fingerprint。

## 12. 权益过期行为

到期后：

允许：

- 登录；
- 查看账号/好友/历史；
- 解绑账号；
- 删除任务；
- 兑换卡密；
- 查看权益。

禁止产生新的平台动作：

- 新账号 Binding；
- Friends Sync；
- 新建任务；
- Run Now；
- Scheduler 创建新的 SendIntent；
- Worker 真正执行尚未发送的 Intent。

Worker 最后一道检查失败时：

```text
SendIntent -> skipped
error_code = ENTITLEMENT_EXPIRED
```

并释放对应 Daily Send reservation。

已有账号、Session、好友、任务不物理删除，续期后可恢复。

解绑账号取消 `pending/queued/retry_wait` 的 SendIntent 时，必须在同一事务按
`local_date` 释放对应 Daily Send reservation；已进入平台执行的 Attempt 不以解绑操作
覆盖其未知/成功结果。

## 13. Auth 与 Entitlement 的事务边界

必须同事务：

- Register：User + local AuthIdentity；
- Mini Link：Wechat Identity + consume LinkCode + AuthSession；
- Refresh rotation：lock AuthSession + replace token hash；
- Redeem：CardCode + Grant + Audit；
- Create Account：quota check + Account(binding)；
- Create Task：quota check + Task；
- Create SendIntent：entitlement check + daily quota reserve + Intent + Outbox。

不应跨事务强绑定：

- AuthSession 与 EntitlementGrant；
- EntitlementGrant 与 Douyin Account Session；
- 卡密兑换与任何抖音平台请求。

## 14. 建议新增表

```text
auth_sessions
auth_link_codes
entitlement_daily_usage
```

配合已有：

```text
users
auth_identities
entitlement_plans
card_batches
card_codes
entitlement_grants
```

## 15. 安全与滥用控制

至少实现：

- Register/Login/Refresh/Link/Redeem 独立速率限制；
- Login 失败不枚举用户；
- Link Code / Card Code / Refresh Token 全部 keyed hash 存储；
- Access Log 自动 redact Authorization/Cookie/card code；
- Admin grant/revoke/batch generation 写 AuditLog；
- User disabled 后 Token 即使尚未 exp 也在请求阶段拒绝；
- Logout All 一次撤销全部 AuthSession；
- 微信 code 只由后端和微信服务端交换，不信任客户端直接传 OpenID。

当前 HTTP Router 已将 Register/Login/Refresh/微信 Link/微信 Login 分别放入独立的
IP fixed-window limiter；需要身份的 Link Code 与 Card Redeem 同时按 `user_id` 和客户端
IP 限制，两个维度任一达到上限都会拒绝请求，避免只轮换 IP 或只切换账号绕过限制。

当前认证响应按客户端区分 Refresh Token 传输边界：Web Register/Login/Refresh 只通过
HttpOnly Cookie 交付或轮换 Refresh Token，不把明文 Refresh Token 放进 JSON；微信小程序
Link/Login 与 body token Refresh 使用 `client_type=mini`，在响应体返回 Refresh Token。小程序
客户端同时保存 Access/Refresh Token，并在业务请求收到 401 时只执行一次 rotation 与原请求重试，
rotation 失败则清理本机两类 Token。

## 16. 测试冻结项

必须有以下集成测试：

1. 两个并发 Binding 不能突破 AccountQuota；
2. 两个并发 Task Create 不能突破 TaskQuota；
3. 同一卡密并发 Redeem 只能成功一次；
4. 同一用户两张卡并发兑换后 Grant 时间段不重叠；
5. Refresh Token 轮换后旧 Token 不可再次使用；
6. Link Code 单次消费；
7. 一个微信 Identity 不能绑定两个 User；
8. Entitlement 过期后 Worker 不得执行平台动作；
9. 同一 SendIntent 重试不重复扣 DailySendQuota；
10. Admin revoke 后下一次 Gate 立即拒绝，不依赖长 TTL 缓存。

当前已增加微信绑定集成覆盖：Link Code 单次消费、同一微信 Identity 不能绑定两个
User，以及同一 User 最多 3 个有效 Link Code；`infra/wechat` 客户端测试覆盖请求参数、
OpenID 提取、`session_key` 不外泄和微信服务暂时不可用的重试错误。

当前已增加真实 PostgreSQL 并发配额覆盖：两个并发 Binding 只能占用一个
`AccountQuota`，两个并发 Task Create 只能占用一个 `TaskQuota`；测试验证服务事务内的
User 行锁、配额拒绝码和最终资源数量。

管理员 Grant 撤销后会立即通过下一次 `Gate` 拒绝平台动作；权益过期时 Scheduler 只落下
`ENTITLEMENT_EXPIRED` 的 `skipped Intent`，不创建 SendJob 或发送 Outbox。上述行为已由
Admin Entitlement 与 Scheduler 集成测试覆盖。
