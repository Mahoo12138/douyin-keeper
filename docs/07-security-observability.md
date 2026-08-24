# 安全、风控与可观测性

## 1. Session 安全

禁止：

- 明文 Session 入库；
- Session 返回前端；
- Cookie 写日志；
- 把 Session 放进 Redis Queue payload；
- 多账号共用 Persistent Browser Profile。

推荐 Session Envelope：

```text
version
key_version
nonce
ciphertext
```

AES-GCM AAD 包含：

- user_id
- account_id
- schema_version

例如逻辑上：

`aad = "user=12;account=34;v=2"`

未来支持 Master Key + per-account DEK。

## 2. Session 执行时传递

优先级：

1. stdin/pipe；
2. Linux memfd / tmpfs；
3. 最后才是 `0600` 临时文件。

如果使用临时文件：

- 随机文件名；
- 目录 0700；
- 文件 0600；
- 任务结束删除；
- 服务启动时清理超过 1 小时的 `session-*.json` 孤儿文件；新文件会被保留，避免多个 Worker 共用目录时误删正在使用的 Session。

## 3. Sidecar 沙箱

Playwright / Protocol Sidecar：

- 不配置数据库账号；
- 不配置 Redis；
- 不持有产品管理员 Secret；
- Protocol Sidecar 不持有 Session Master Key；
- 只接收本次执行所需的临时 Session；
- 限制 CPU/内存/运行时长；
- 容器只读根文件系统；
- 限制出站域名。

## 4. 风险处理

不要把“所有失败”都累计为一个失败计数。

### AUTH

- expired → 标记 expired，停任务，通知重新登录。
- challenge_required → pause，等待用户处理。

### PLATFORM

- rate_limited → cooldown。

### PROTOCOL

- incompatible → 关闭 Protocol Adapter，全局熔断。

### BROWSER

- selector_changed → 标记 Browser capability degraded，报警给管理员。

### NETWORK

- timeout → 有界重试。

### DATA

- friend_ambiguous → 禁止发送，要求重新同步/确认。

当前 Go `risk.Service` 会在同一 PostgreSQL 事务内记录 `risk_events` 并执行动作：
`SESSION_EXPIRED` / `CHALLENGE_REQUIRED` 只更新 Session 状态，
`PLATFORM_RATE_LIMITED` 设置账号 10 分钟 cooldown，协议/浏览器兼容性错误交给
Adapter circuit breaker，网络错误只保留有界重试语义。Scheduler 每 60 秒清理已过期
cooldown；风险事件不会携带 Session、Cookie 或消息正文。

## 5. 日志

所有日志结构化：

- trace_id
- job_id
- user_public_id（必要时）
- account_public_id
- adapter
- operation
- error_code
- duration_ms

不写：

- Cookie
- Authorization
- storage_state
- 手机验证码
- 完整卡密
- Session 密文全文

## 6. 指标

Prometheus/OpenTelemetry 指标：

- `job_duration_seconds`
- `job_total{type,status}`
- `send_total{adapter,status}`
- `adapter_health`
- `browser_slots_in_use`
- `queue_latency_seconds`
- `session_expired_total`
- `risk_event_total{category,code}`
- `wechat_notification_delivery_total{status}`

当前实现由 `backend/internal/infra/telemetry` 提供进程级 Prometheus 文本注册器：API
通过 `GET /metrics` 暴露，Scheduler/Worker 通过内部 `METRICS_ADDR`（默认
`:9090`）暴露。标签只使用受控的任务类型、Adapter、状态和风险分类/代码，禁止把
用户 ID、账号 ID、URL 参数或任何凭据写入时间序列。HTTP 请求使用 chi 路由模板，避免
动态 ID 造成高基数；队列延迟从 Outbox 的 `available_at` 到发布时刻观测。风险事务通过
`ApplyInTx` 接入 Worker 终态时，`risk_event_total` 与 `session_expired_total` 只在外层
事务成功提交后计数，避免回滚的风险事件污染指标。

核心 SLO：

- API 可用性；
- Send Job 成功率；
- Queue latency；
- 浏览器任务 p95；
- Adapter degraded 时间。

## 7. 审计日志

必须记录：

- 用户绑定/解绑抖音账号；
- 管理员禁用用户；
- 管理员修改权益方案；
- 管理员生成/停用卡密批次；
- 卡密兑换成功；
- 管理员人工 Grant/Revoke 权益；
- 修改站点级发送上限；
- 开关 Protocol Adapter；
- 管理员主动暂停/恢复账号；
- 登录身份绑定（微信 ↔ 产品账号）。

微信通知只读取 `wechat_mini.provider_subject` 作为发送目标；不记录微信
`session_key`、AppSecret、access token 或完整通知请求。投递记录只保存状态、尝试次数
和有限错误码，正文继续留在用户可见的站内通知表中。

管理员不能通过普通后台读取 Session。


## 8. 卡密安全

卡密使用至少 120 bit 随机熵，数据库只保存：

```text
HMAC-SHA-256(CARD_CODE_PEPPER_V{code_version}, normalized_code)
```

`CARD_CODE_PEPPER_Vn` 必须与 Session/JWT/Auth Secret 分离；新版本卡密使用新 Pepper，旧 Pepper 保留到旧版本卡密兑换截止。完整卡密只在管理员生成后一次性导出，后续无法从数据库找回。

兑换接口必须登录并做用户/IP 限流；日志、APM、Sentry 类错误追踪、Audit detail 都应对 `code` 字段做 redact。卡密撤销和权益撤销是两个不同动作：已兑换卡保持 `redeemed`，如需收回权限则 revoke 对应 Grant。

当前实现中兑换和 Link Code 路由使用用户/IP 双维度 fixed-window limiter；公开认证路由
分别使用独立的 IP limiter，避免注册、登录、刷新和微信入口共享同一个计数窗口。
