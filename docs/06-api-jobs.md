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

### Accounts

- `GET /api/accounts`
- `POST /api/accounts/bindings`
- `POST /api/accounts/:id/session-check`
- `POST /api/accounts/:id/friends-sync`
- `POST /api/accounts/:id/pause`
- `POST /api/accounts/:id/resume`
- `DELETE /api/accounts/:id`

### Friends

- `GET /api/accounts/:id/friends`
- `GET /api/friends/:id`
- `PATCH /api/friends/:id`

### Tasks

- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `POST /api/tasks/:id/run-now`

### History

- `GET /api/send-intents`
- `GET /api/send-jobs/:id`

### Jobs

- `GET /api/jobs/:id`
- `GET /api/jobs/:id/events`
- `POST /api/jobs/:id/cancel`

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
- `ACCOUNT_BUSY`
- `ENTITLEMENT_REQUIRED`
- `ENTITLEMENT_EXPIRED`
- `ACCOUNT_QUOTA_EXCEEDED`
- `TASK_QUOTA_EXCEEDED`
- `FEATURE_NOT_ENTITLED`

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
