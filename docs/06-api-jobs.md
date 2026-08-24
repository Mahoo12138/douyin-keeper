# API、任务与调度设计

## 1. API 分组

### Auth

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `POST /api/v1/auth/link-codes`
- `POST /api/v1/auth/wechat-mini/link`
- `POST /api/v1/auth/wechat-mini/login`

### Entitlement

- `GET /api/me/entitlement`
- `POST /api/entitlements/redeem`
- `GET /api/entitlements/redemptions`

任务请求中的 `allow_first_message=true` 需要当前有效权益包含
`creator_first_message`，否则创建/编辑返回 `403 FEATURE_NOT_ENTITLED`；发送 Worker
在执行前会再次校验该权益。关闭已有首聊配置不要求继续持有该 feature。

### Accounts

- `GET /api/accounts`
- `POST /api/accounts/bindings`（`method=qr|sms`；SMS 额外接收手机号）
- `POST /api/accounts/:id/session-check`
- `POST /api/accounts/:id/friends-sync`
- `POST /api/accounts/:id/pause`
- `POST /api/accounts/:id/resume`
- `DELETE /api/accounts/:id`

### Friends

- `GET /api/accounts/:id/friends`
- `GET /api/friends/:id`
- `PATCH /api/friends/:id`

### Conversations

- `GET /api/accounts/:id/conversations`（默认只返回未归档会话；`include_archived=true` 用于管理查看）
- `PATCH /api/accounts/:id/conversations/:conversationId`（设置用户侧归档标记）

会话归档当前只更新产品侧索引，不调用抖音平台操作。若未来支持平台侧归档，必须新增
版本化 Sidecar 操作、Job/Outbox 事件和账号锁定规则，不能复用此 API 假装平台操作成功。

### Tasks

- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `POST /api/tasks/:id/run-now`

### History

- `GET /api/send-intents`
- `GET /api/send-jobs/:id`

### Notifications

- `GET /api/notifications`
- `GET /api/notifications/preferences`
- `PATCH /api/notifications/preferences`（`{"wechat_enabled":true|false}`）
- `POST /api/notifications/:id/read`
- `POST /api/notifications/read-all`

风险通知在产生站内通知的同一 PostgreSQL 事务内创建 `notification_deliveries` 和
`queue_outbox(notification.wechat.send)`。Outbox Publisher 投递后由 `worker-light`
按 delivery 状态发送微信订阅消息；未授权、未配置模板的消息记录为 skipped，微信
临时错误记录为 failed 并交给 Asynq 重试。

### Jobs

- `GET /api/jobs/:id`
- `GET /api/jobs/:id/events`
- `POST /api/jobs/:id/cancel`
- `POST /api/jobs/:id/sms-verify`（验证码只进入 Redis 短时键，不落库）

### Admin

- `/api/admin/users`
- `/api/admin/accounts`
- `/api/admin/jobs`
- `/api/admin/risks`
- `/api/admin/workers`
- `/api/admin/adapters`
- `/api/admin/entitlement-plans`
- `/api/admin/card-batches`
- `/api/admin/redemptions`
- `/api/admin/entitlement-grants`
- `/api/admin/settings`
- `/api/admin/audit-logs`

## 2. API 权限规则

所有用户侧资源都必须通过 `user_id` 作用域查询。

错误示例：

```sql
SELECT * FROM friends WHERE id = ?
```

推荐：

```sql
SELECT f.*
FROM friends f
JOIN douyin_accounts a ON a.id = f.account_id
WHERE f.id = ? AND a.user_id = ?
```

不要依赖前端传来的 `user_id`。


### Entitlement Gate

所有会产生新平台动作的入口在进入 Queue 前检查 EffectiveEntitlement，包括：

- 创建账号 Binding；
- 创建/启用 SparkTask；
- Run Now；
- Friends Sync；
- Scheduler 创建 SendIntent。

Worker 在真正发送前再次检查，避免“排队时有效、执行时已经过期”的竞态。权益过期不删除已有配置，只停止创建新的自动化动作。

## 3. Task Tick

每分钟执行一次轻量调度：

1. 查询当前时间窗口内应执行的 SparkTask；
2. 在事务中锁定当日权益配额计数；
3. 创建 `SendIntent`，`UNIQUE(task_id, local_date)` 保证只创建一次；
4. 同事务 reserve DailySendQuota；
5. 同事务写 `queue_outbox(send.dispatch)`；
6. Outbox Publisher commit 后投递 Asynq。

不直接做 PostgreSQL + Redis 双写，也不再使用“每分钟都 enqueue，然后发送时再 dedupe”的方式。

## 3.1 登录态主动健康检查

Scheduler 每 60 秒执行一次有界扫描，但同一账号的检查周期为 30 分钟。只扫描已绑定且
Session 状态为 `unknown/valid`、最近一次检查早于周期阈值的账号；已有排队、执行中、
等待用户或周期内新建的 `account.session_check.browser` Job 会被排除。扫描只在事务中
创建通用 Job 和 `queue_outbox(account.session_check.browser)`，不直接调用 Sidecar。

Browser Worker 成功后更新 `last_session_check_at` 和 `session_status=valid`；若返回
`SESSION_EXPIRED` 或 `CHALLENGE_REQUIRED`，沿用 Risk Service 更新 Session 状态并生成
账号所有者的站内通知，后续周期扫描不会重复探测已经确认需要人工处理的账号。

## 4. Run Now

手动执行不应该绕过 Intent 体系。

创建：

- `intent_type = manual`
- 独立 `request_id`

避免用户连续点击导致多个重复发送。

可以配置：同一账号同一好友 30 秒内只允许一个手动 Intent。

## 5. Job 重试

只对可恢复错误自动重试：

可重试：

- 网络超时；
- 临时 5xx；
- Sidecar 进程异常退出。

不自动重试：

- 登录失效；
- 安全验证；
- 限流；
- 好友身份不明确；
- 首聊未授权；
- Adapter SDK 不兼容。

## 6. Error Code

对外稳定错误码，不直接暴露底层异常文本。

示例：

- `SESSION_EXPIRED`
- `QR_EXPIRED`
- `ACCOUNT_IDENTITY_UNRESOLVED`
- `CHALLENGE_REQUIRED`
- `PLATFORM_RATE_LIMITED`
- `FRIEND_NOT_FOUND`
- `FRIEND_AMBIGUOUS`
- `CONVERSATION_NOT_FOUND`
- `ADAPTER_UNAVAILABLE`
- `ADAPTER_INCOMPATIBLE`
- `BROWSER_SELECTOR_CHANGED`
- `NETWORK_TIMEOUT`
- `OUTCOME_UNKNOWN`（Worker lease 过期，平台结果无法确认；不自动重发）
- `ACCOUNT_BUSY`
- `ENTITLEMENT_REQUIRED`
- `ENTITLEMENT_EXPIRED`
- `ACCOUNT_QUOTA_EXCEEDED`
- `TASK_QUOTA_EXCEEDED`
- `FEATURE_NOT_ENTITLED`
- `ENTITLEMENT_PLAN_CONFLICT`

底层错误文本写入受限的内部 log/detail。

## 7. 事件时间线

一个 Send Job：

```text
created
  ↓
outbox_published
  ↓
lock_wait
  ↓
started
  ↓
session_loaded
  ↓
adapter_selected
  ↓
sending
  ↓
confirmed
  ↓
succeeded
```

失败则：

```text
sending
  ↓
failed(error_code)
  ↓
risk_evaluated
  ↓
retry / pause / notify
```


## 8. 状态机权威文档

`SendIntent / SendJob / Generic Job / Retry / Cancellation / Worker Lease / Account Lock / Transactional Outbox` 的完整状态机以 `15-scheduler-worker-state-machine.md` 为准。
