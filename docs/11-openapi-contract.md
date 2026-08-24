# OpenAPI Contract v1

> API 是 PC C 端、微信小程序与 PC Admin 的唯一公开业务入口。OpenAPI 文件作为跨语言契约源，Go handler 与 TypeScript SDK 都应围绕它生成/校验。

## 1. 基础规范

Base path：

```text
/api/v1
```

Content-Type：

```text
application/json
```

时间：RFC 3339。

对外所有资源 ID 使用 `public_id` 字符串，不暴露数据库 BIGINT。

建议认证：

- Web/Admin：HttpOnly Secure Session Cookie；
- 小程序：微信登录换取本系统 Session/Access Token；
- Admin 通过 `role=admin` + 独立 policy 检查。

## 2. 通用 Response

成功直接返回资源，不额外套 `data`：

```json
{
  "id": "0191b8...",
  "nickname": "Miles"
}
```

错误统一：

```json
{
  "error": {
    "code": "SESSION_EXPIRED",
    "message": "抖音登录状态已失效，请重新绑定账号",
    "request_id": "0191b8...",
    "details": {}
  }
}
```

HTTP 状态与业务错误分离：

- `400` 参数/状态不合法；
- `401` 未登录；
- `403` 无权限；
- `404` 资源不存在或不属于当前用户；
- `409` 幂等/资源状态冲突；
- `429` 本系统限流；
- `502/503` Adapter/平台依赖暂不可用；
- `500` 未分类内部错误。

## 3. Pagination

列表统一 cursor pagination：

Request：

```text
?limit=50&cursor=...
```

Response：

```json
{
  "items": [],
  "next_cursor": null
}
```

`limit` 默认 50，最大 100。

## 4. Auth

Auth 工程约束以 `13-auth-entitlement-engineering.md` 为准。MVP 的 PC 身份使用 `local` 用户名 + 密码；微信小程序首次使用一次性 Link Code 绑定已有 User，不自动创建第二个 User。

### `POST /auth/register`

```json
{
  "username": "miles",
  "password": "..."
}
```

成功创建 `User + local AuthIdentity + AuthSession`。

### `POST /auth/login`

```json
{
  "username": "miles",
  "password": "..."
}
```

返回短生命周期 Access Token。Web 的 Refresh Token 使用 HttpOnly Cookie；Mini 的 Refresh Token 可在响应体返回。

### `POST /auth/refresh`

执行 Refresh Token rotation。旧 Refresh Token 在成功轮换后立即失效。

### `POST /auth/logout`

撤销当前 AuthSession。

### `POST /auth/logout-all`

撤销当前 User 的全部 AuthSession。

### `POST /auth/link-codes`

PC 已登录用户创建一次性小程序绑定码：

```json
{
  "code": "7K9M2QPX",
  "expires_at": "2026-08-23T10:05:00Z"
}
```

Link Code 短 TTL、单次使用，服务端只保存 keyed hash。

### `POST /auth/wechat-mini/link`

```json
{
  "wechat_code": "wx.login code",
  "link_code": "7K9M2QPX"
}
```

后端服务端调用微信 `jscode2session` 交换主体标识，把 OpenID 作为 `wechat_mini` 的
`provider_subject` 绑定到 Link Code 对应的现有 User，并创建 Mini AuthSession。微信
`session_key` 只在微信交换响应中短暂存在，不写入数据库、不返回给客户端；Link Code
在同一事务中完成归属/有效期校验、Identity 创建和一次性消费。

### `POST /auth/wechat-mini/login`

```json
{
  "wechat_code": "wx.login code"
}
```

未绑定时返回：

```text
WECHAT_IDENTITY_NOT_LINKED
```

不自动创建新 User。

### `GET /notifications`

返回当前用户未过期的站内通知，支持 `unread_only=true` 和统一游标分页。`limit` 默认 50、最大 100，后续请求把响应中的 `next_cursor` 作为 `cursor` 传回。响应包含当前未读总数；通知只返回面向用户的标题、正文、优先级和可选资源引用，不返回风险 `detail_json`、Session 或 Cookie。

### `POST /notifications/{notification_id}/read`

将当前用户拥有的单条通知标记为已读；通知不存在或不属于当前用户时返回 `404`。

### `POST /notifications/read-all`

将当前用户的全部未读通知标记为已读，并返回 `marked_count`。

### `GET /notifications/preferences`

返回当前用户的通知偏好。首次读取且没有设置记录时返回 `wechat_enabled=false`。

### `PATCH /notifications/preferences`

请求体：`{"wechat_enabled":true|false}`。小程序只有在微信端订阅授权成功后才提交
`true`；关闭通知只关闭后续投递偏好，不删除已有站内通知。风险通知产生时，服务端
在同一事务内创建站内通知、微信 delivery 和 `notification.wechat.send` outbox；
`worker-light` 负责调用微信订阅消息接口并记录 `sent/skipped/failed` 状态。

## 4.1 Entitlement / 卡密兑换

系统内部没有订单/支付 API。C 端只有授权查询与卡密兑换。

### `GET /me/entitlement`

返回当前生效权益、下一段已排队权益以及配额使用情况：

```json
{
  "status": "active",
  "plan": {
    "code": "standard",
    "name": "标准权益"
  },
  "starts_at": "2026-08-01T00:00:00Z",
  "expires_at": "2026-09-01T00:00:00Z",
  "quota": {
    "accounts": {"used": 2, "limit": 3},
    "tasks": {"used": 18, "limit": 50},
    "daily_sends": {"used": 18, "limit": 100}
  },
  "features": {
    "browser_text_send": true,
    "sticker_send": false,
    "protocol_sender": false
  }
}
```

无有效权益时：

```json
{
  "status": "inactive",
  "plan": null,
  "starts_at": null,
  "expires_at": null
}
```

### `POST /entitlements/redeem`

```json
{
  "code": "DK1-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
}
```

成功后返回新 Grant 和兑换后的 EffectiveEntitlement。完整卡密不得出现在响应日志、审计详情或错误追踪中。

常见错误：

```text
INVALID_CARD_CODE
CARD_NOT_ACTIVE
CARD_NOT_YET_REDEEMABLE
CARD_REDEEM_EXPIRED
CODE_ALREADY_REDEEMED
ENTITLEMENT_PLAN_CONFLICT
```

### `GET /entitlements/redemptions`

只返回用户自己的授权历史，不返回完整卡密；每项返回 `id/plan_code/source_type/starts_at/`
`expires_at/revoked_at`，由前端根据时间和撤销字段展示授权状态。

卡密兑换天然单次，用户重复提交自己已成功兑换的同一张卡时，可返回原 Grant 作为幂等成功。详见 `12-card-code-entitlement.md`。

## 5. Accounts

### `GET /accounts`

默认返回 50 条、最多 100 条，按账号内部 ID 降序排列；通过 `cursor` 继续读取后续账号。
账号归属和运营摘要与原列表保持一致。

Account summary：

```json
{
  "id": "...",
  "nickname": "Miles",
  "avatar_url": "https://...",
  "binding_status": "bound",
  "session_status": "valid",
  "risk_status": "normal",
  "last_session_check_at": "2026-08-23T08:00:00Z",
  "last_friend_sync_at": "2026-08-23T08:05:00Z"
}
```

### `POST /accounts/bindings`

MVP：

```json
{
  "method": "qr"
}
```

Response：

```json
{
  "job_id": "..."
}
```

客户端立即订阅：

```text
GET /jobs/{job_id}/events
```

### `POST /accounts/{account_id}/session-check`

返回 Job：

```json
{"job_id":"..."}
```

### `POST /accounts/{account_id}/friends-sync`

返回 Job。

### `POST /accounts/{account_id}/pause`

可选 body：

```json
{"reason":"user_requested"}
```

### `POST /accounts/{account_id}/resume`

如果仍处于强制 cooldown，返回 `409 ACCOUNT_COOLDOWN_ACTIVE`。

### `DELETE /accounts/{account_id}`

执行解绑/软删除；需要先取消后续未执行 Intent。Session 应进入 revoked/删除流程。

## 6. Capability

### `GET /accounts/{account_id}/capabilities`

```json
{
  "items": [
    {
      "capability": "message.send.text.existing",
      "status": "available",
      "adapter": "browser.consumer",
      "checked_at": "2026-08-23T08:00:00Z",
      "error_code": null
    }
  ]
}
```

前端不要仅根据 `session_status=valid` 推断所有能力可用。

## 7. Friends

### `GET /accounts/{account_id}/friends`

Query：

```text
?spark_enabled=true&q=Jasmine&limit=50&cursor=...
```

Item：

```json
{
  "id": "...",
  "platform_identity_status": "resolved",
  "display_name": "Jasmine",
  "nickname": "Jasmine",
  "short_id": "douyin_xxx",
  "avatar_url": "https://...",
  "streak_days": 128,
  "has_conversation": true,
  "spark_enabled": true,
  "last_sent_at": "2026-08-22T10:20:00Z"
}
```

API 不返回平台内部 ID 给普通 C 端，除非 UI 确有诊断需要。

### `PATCH /friends/{friend_id}`

MVP 允许：

```json
{
  "spark_enabled": true
}
```

如果身份未解析，打开时返回：

```text
409 FRIEND_IDENTITY_UNRESOLVED
```

## 7.1 Conversations

### `GET /accounts/{account_id}/conversations`

默认只返回未归档会话；传入 `include_archived=true` 返回当前账号下的全部会话。列表使用统一
游标分页：`limit` 默认 50、最大 100，后续请求把响应中的 `next_cursor` 作为 `cursor` 传回。响应
包含 `archived` 与 `archived_at`，但不返回平台会话 ID。

### `PATCH /accounts/{account_id}/conversations/{conversation_id}`

请求体：

```json
{"archived": true}
```

该操作只更新产品侧会话索引的归档状态，支持通过 `{"archived":false}` 恢复；不会
伪造抖音平台侧归档结果。若未来接入平台归档，必须通过 Job/Outbox 和账号锁完成。

## 7.2 Message Templates

### `GET /message-templates`

可选按 `kind=text|sticker` 筛选，返回当前用户自己的模板。

列表默认返回 50 条，最多 100 条，可通过 `cursor` 按 `updated_at DESC, id DESC`
继续读取；Web `/templates` 和任务编辑器使用“加载更多模板”读取后续页面。

### `POST /message-templates`

```json
{
  "name": "晚安问候",
  "kind": "text",
  "body": "今天也记得续火花"
}
```

### `PATCH /message-templates/{template_id}` / `DELETE /message-templates/{template_id}`

模板更新和删除都必须经过当前用户归属校验。任务编辑器套用模板时复制当前
`kind/body`，模板资源不作为任务的隐式运行时依赖。

## 8. Spark Tasks

建议 UI 中“好友火花开关”和 SparkTask 保持一一对应，但 API 仍保留显式 Task 资源。

### `GET /tasks`

任务列表使用统一游标分页：`limit` 默认 50、最大 100，后续请求把响应中的 `next_cursor`
作为 `cursor` 传回。任务结果只返回当前用户拥有且未删除的任务。

### `POST /tasks`

```json
{
  "account_id": "...",
  "friend_id": "...",
  "enabled": true,
  "timezone": "Asia/Shanghai",
  "window_start": "09:00:00",
  "window_end": "22:00:00",
  "message": {
    "kind": "text",
    "body": "今天也记得续火花"
  },
  "allow_first_message": false
}
```

`allow_first_message=true` 是高风险可选能力，要求当前有效权益的 `features` 包含
`creator_first_message`；不满足时返回 `403 FEATURE_NOT_ENTITLED`。`PATCH` 开启该字段
遵循相同规则，关闭已有配置不需要该 feature；发送执行侧仍会再次校验。

### `PATCH /tasks/{task_id}`

PATCH 语义，只更新出现的字段。

### `POST /tasks/{task_id}/run-now`

必须带幂等键：

Header：

```text
Idempotency-Key: <UUID>
```

Response：

```json
{
  "intent_id": "...",
  "job_id": "...",
  "status": "queued"
}
```

同一个 Idempotency-Key 重试应返回同一个 Intent，不重复发送。

## 9. History

### `GET /send-intents`

Query：

```text
?account_id=...&friend_id=...&status=succeeded&from=...&to=...
```

列表默认返回 50 条，最多 100 条；通过 `cursor` 按 `id DESC` 继续读取。分页请求会继续应用账号、好友、状态和时间范围筛选。

Item：

```json
{
  "id": "...",
  "intent_type": "scheduled",
  "account": {"id":"...","nickname":"Miles"},
  "friend": {"id":"...","display_name":"Jasmine"},
  "task_id": "...",
  "task": {"id":"...","message_kind":"text","body":"晚间火花问候"},
  "scheduled_at": "...",
  "status": "succeeded",
  "latest_job": {
    "id": "...",
    "adapter": "browser.consumer",
    "attempt": 1,
    "status": "succeeded",
    "error_code": null
  }
}
```

### `GET /send-jobs/{job_id}`

详细执行信息只暴露非敏感诊断字段。

## 10. Generic Jobs

### `GET /jobs/{job_id}`

```json
{
  "id": "...",
  "type": "account.bind.qr",
  "status": "running",
  "cancelable": true,
  "error_code": null,
  "created_at": "...",
  "started_at": "...",
  "finished_at": null
}
```

### `GET /jobs/{job_id}/events`

`text/event-stream`：

```text
event: qr_ready
id: 3
data: {"format":"data_url","value":"...","expires_at":"..."}

```

建议事件：

```text
started
qr_ready
scanned
confirming
challenge_required
progress
success
error
cancelled
```

SSE 支持 `Last-Event-ID`：服务端只重放序号更大的已持久化事件，随后继续轮询新事件。
`packages/sdk-ts` 的 `streamJobEvents` 在连接正常结束、网络读失败或 408/425/429/5xx
响应后自动按指数退避重连，并把最近收到的事件序号作为 `Last-Event-ID` 发送；401/403
等不可重试错误直接返回。调用方仍通过原有第四参数 `AbortSignal` 取消，也可以传入
`maxReconnectAttempts`、退避参数和 `onReconnect`。

### `POST /jobs/{job_id}/cancel`

只有 `cancelable=true` 且状态允许时成功，否则 `409 JOB_NOT_CANCELABLE`。

## 11. Admin API

Admin 固定使用 `/admin/*`：

```text
GET  /admin/overview
GET  /admin/users
GET  /admin/users/{id}
PATCH /admin/users/{id}
GET  /admin/accounts
POST /admin/accounts/{id}/pause
POST /admin/accounts/{id}/resume
GET  /admin/jobs
GET  /admin/risks
GET  /admin/workers
GET  /admin/adapters
PATCH /admin/adapters/{adapter}
GET  /admin/settings
PATCH /admin/settings/{key}
GET  /admin/audit-logs
GET  /admin/entitlement-plans
POST /admin/entitlement-plans
POST /admin/entitlement-plans/{id}/disable
GET  /admin/card-batches
POST /admin/card-batches
GET  /admin/card-batches/{id}
POST /admin/card-batches/{id}/disable
GET  /admin/redemptions
GET  /admin/users/{id}/entitlements
POST /admin/users/{id}/entitlement-grants

`GET /admin/users` 默认返回 50 条、最多 100 条，按 `created_at DESC, id DESC`
排序；通过 `cursor` 继续读取用户列表。
`GET /admin/accounts` 默认返回 50 条、最多 100 条，按 `created_at DESC, id DESC`
排序；通过 `cursor` 继续读取账号列表。
`GET /admin/risks` 默认返回 50 条、最多 100 条，按 `created_at DESC, id DESC`
排序；`category`、`severity`、`code` 筛选条件随 `cursor` 继续读取风险列表。
`GET /admin/audit-logs` 默认返回 50 条、最多 100 条，按 `created_at DESC, id DESC`
排序；`action`、`resource_type`、`actor` 筛选条件随 `cursor` 继续读取审计列表。
POST /admin/entitlement-grants/{id}/revoke
GET  /admin/card-batches/{id}/codes
POST /admin/card-batches/{id}/codes/{code_id}/revoke
```

所有会改变用户/账号/全局配置的 Admin 操作必须写 `audit_logs`。

## 12. Admin Overview

当前首页由 `GET /admin/overview` 一次返回运营概览，统计日边界统一使用 `Asia/Shanghai`：

```json
{
  "observed_at": "2026-08-24T09:00:00Z",
  "active_users": 120,
  "dau": 48,
  "active_accounts": 165,
  "today_send_succeeded": 93,
  "today_send_failed": 7,
  "today_send_success_rate": 0.93,
  "risk_accounts": 6,
  "queue_pending": 3,
  "queue_active": 2,
  "queue_retry": 1,
  "queue_latency_seconds": 12,
  "workers_online": 2,
  "workers_total": 3,
  "failure_codes": [{"code": "RATE_LIMITED", "count": 4}],
  "adapter_success_rates": [
    {"name": "browser", "succeeded": 80, "failed": 5, "success_rate": 0.9412},
    {"name": "protocol", "succeeded": 13, "failed": 2, "success_rate": 0.8667}
  ]
}
```

`active_accounts` 表示 `binding_status=bound` 且 `session_status=valid` 的未删除账号；`risk_accounts` 表示 `risk_status != normal` 的未删除账号；失败码返回当日失败任务的 Top 5，通道成功率按 `selected_adapter` 归一为 Browser/Protocol 后统计。

## 13. 稳定 Error Code

第一版冻结：

### Auth / Permission

```text
UNAUTHENTICATED
INVALID_CREDENTIALS
WECHAT_IDENTITY_NOT_LINKED
LINK_CODE_INVALID
LINK_CODE_EXPIRED
FORBIDDEN
USER_DISABLED
```

### Resource / State

```text
NOT_FOUND
CONFLICT
ACCOUNT_BUSY
ACCOUNT_PAUSED
ACCOUNT_COOLDOWN_ACTIVE
JOB_NOT_CANCELABLE
```

### Douyin Session

```text
SESSION_EXPIRED
QR_EXPIRED
ACCOUNT_IDENTITY_UNRESOLVED
CHALLENGE_REQUIRED
PLATFORM_RATE_LIMITED
```

### Friend / Conversation

```text
FRIEND_NOT_FOUND
FRIEND_IDENTITY_UNRESOLVED
FRIEND_AMBIGUOUS
CONVERSATION_NOT_FOUND
TARGET_IDENTITY_MISMATCH
```

### Adapter / Runtime

```text
ADAPTER_UNAVAILABLE
ADAPTER_INCOMPATIBLE
BROWSER_SELECTOR_CHANGED
NETWORK_TIMEOUT
OUTCOME_UNKNOWN
INTERNAL_ERROR
```

错误码是前后端契约，不能把 Python/Node 原始异常类名当成公开 API 错误码。

## 14. API 与 Queue 边界

API Handler 不直接调用 Playwright / Protocol：

```text
HTTP
 -> validate auth/policy
 -> transaction / create domain object
 -> create generic Job when needed
 -> enqueue
 -> return 202/job_id
```

短 CRUD 返回 `200/201`；平台 I/O、登录、同步、发送一律异步 Job 化。

## 15. OpenAPI 生成流程

推荐仓库：

```text
packages/contracts/openapi.yaml
```

CI：

```text
openapi lint
  -> generate TS SDK
  -> go contract test
  -> frontend typecheck
```

不要由前端手写第二套 DTO。

## 16. MVP Endpoint Freeze

MVP 首先冻结并实现：

```text
POST /auth/login
POST /auth/logout
GET  /me

GET  /accounts
POST /accounts/bindings
POST /accounts/{id}/session-check
POST /accounts/{id}/friends-sync
POST /accounts/{id}/pause
POST /accounts/{id}/resume
DELETE /accounts/{id}
GET  /accounts/{id}/capabilities

GET   /accounts/{id}/friends
PATCH /friends/{id}

GET    /tasks
POST   /tasks
PATCH  /tasks/{id}
DELETE /tasks/{id}
POST   /tasks/{id}/run-now

GET /send-intents
GET /send-jobs/{id}

GET  /jobs/{id}
GET  /jobs/{id}/events
POST /jobs/{id}/cancel
```

小程序微信登录、通知偏好与 Admin API 已按上述命名空间接入；真实微信身份交换依赖
运行时配置 `WECHAT_APP_ID` 与 `WECHAT_APP_SECRET`，微信通知还需要
`WECHAT_NOTIFICATION_TEMPLATE_ID` 及模板字段配置。
