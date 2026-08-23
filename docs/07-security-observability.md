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
- 服务启动时清理孤儿文件。

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

管理员不能通过普通后台读取 Session。


## 8. 卡密安全

卡密使用至少 120 bit 随机熵，数据库只保存：

```text
HMAC-SHA-256(CARD_CODE_PEPPER_V{code_version}, normalized_code)
```

`CARD_CODE_PEPPER_Vn` 必须与 Session/JWT/Auth Secret 分离；新版本卡密使用新 Pepper，旧 Pepper 保留到旧版本卡密兑换截止。完整卡密只在管理员生成后一次性导出，后续无法从数据库找回。

兑换接口必须登录并做用户/IP 限流；日志、APM、Sentry 类错误追踪、Audit detail 都应对 `code` 字段做 redact。卡密撤销和权益撤销是两个不同动作：已兑换卡保持 `redeemed`，如需收回权限则 revoke 对应 Grant。
