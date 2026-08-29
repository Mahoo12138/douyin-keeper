# Sidecar Protocol v1

> Go 是控制面和唯一业务真源。Playwright / Protocol Sidecar 只实现平台 Adapter，不拥有用户、任务、数据库或调度逻辑。

## 1. 传输

MVP 推荐：**stdin/stdout NDJSON**。

每行一条完整 JSON：

```text
Go Worker --stdin--> Sidecar
Go Worker <--stdout-- Sidecar
```

约束：

- stdout 只允许 Protocol 消息；
- 普通日志输出 stderr；
- 每个请求包含 `request_id`；
- 一次启动可处理多条请求，但每条请求都必须独立完成；
- Sidecar 不连接 PostgreSQL / Redis；
- 不允许响应 Cookie、storage state、验证码、Authorization header 等 Secret。

Request 必须符合 v1 schema：`protocol_version=1`、`input` 为对象，`deadline_ms` 为
1000–300000 的整数；Go Client 对未填写的 deadline 使用 30000ms 默认值。Sidecar
拒绝未知字段，避免业务层悄悄依赖未冻结的协议扩展。Go Client 的 deadline 覆盖排队、
写入和等待响应的完整调用生命周期；如果串行 Sidecar 仍在处理上一请求，已过期请求不会
再启动进程或写入协议流。

后续需要高并发时可迁移 Unix Domain Socket，但消息 Envelope 保持不变。

## 2. Envelope

### Request

```json
{
  "protocol_version": 1,
  "request_id": "0191b8a6-6f5f-7e42-8f57-2b4537c24401",
  "op": "session.validate",
  "deadline_ms": 30000,
  "input": {}
}
```

### Success

```json
{
  "protocol_version": 1,
  "request_id": "0191b8a6-6f5f-7e42-8f57-2b4537c24401",
  "ok": true,
  "result": {},
  "meta": {
    "adapter": "browser.consumer",
    "adapter_version": "1.0.0",
    "duration_ms": 842
  }
}
```

### Failure

```json
{
  "protocol_version": 1,
  "request_id": "0191b8a6-6f5f-7e42-8f57-2b4537c24401",
  "ok": false,
  "error": {
    "code": "SESSION_EXPIRED",
    "retryable": false,
    "message": "session is no longer valid",
    "detail": {}
  },
  "meta": {
    "adapter": "browser.consumer",
    "adapter_version": "1.0.0",
    "duration_ms": 517
  }
}
```

`message/detail` 只用于内部诊断，API 对外只暴露稳定 `code` 和经过整理的用户文案。
`error.detail` 必须保持为对象并透传 Adapter 提供的结果证据；尤其是发送失败时的
`outcome=not_sent|unknown`，Go 才能决定是否允许 fallback 或重试，不能由 Worker 猜测。

Go ProcessClient 对响应 envelope 采用严格解码：拒绝未知顶层字段、缺失必填的 `meta`/`result`/
`error` 字段、负数 `duration_ms` 和非对象 `error.detail`，并在协议校验失败后销毁当前
Sidecar 进程，不复用可能已失步的 NDJSON 流。
Python Sidecar 即使在请求校验失败时也返回完整 failure envelope；若能提取请求 ID 则原样
回传，并保持真实 Adapter 身份，不使用缺少必填字段的 `nop` 响应。

## 3. Secret 传递

不要把完整 Session JSON 放在命令行参数、环境变量或 stdout。

MVP：

1. Worker 解密 Session；
2. 写入权限 `0600` 的临时文件；
3. Request 只传 `session_file`；
4. Sidecar 读取；
5. Worker 在请求结束后删除文件；
6. Worker 启动时清理超过 1 小时的 `session-*.json` 孤儿文件；
7. Sidecar 不回传其内容。

```json
{
  "session": {
    "kind": "playwright_storage_state_file",
    "path": "/run/douyin-keeper/session/abc.json",
    "profile_dir": "/var/lib/douyin-keeper/profiles/account-<account-public-id>"
  }
}
```

`profile_dir` 是账号隔离边界，不是 API 用户输入。Go Worker 只使用账号公共 UUID
生成目录名，并确保目录权限为 `0700`；Node.js Playwright Sidecar 以 persistent context
打开该目录。若 Profile 已有有效 session cookie，Sidecar 直接复用；若为空，则从本次
`storage_state` 临时文件补种 Cookie。任务完成后关闭 context，但不删除账号 Profile。

Profile 中可能包含平台登录态，部署必须使用专用运行用户、受限挂载目录和备份排除规则；
数据库中的加密 `account_sessions` 仍是恢复与审计真源，Profile 不是业务数据库。长期可
换成匿名 pipe / memfd，而不改变业务协议。

## 4. Operation 命名

统一使用：

```text
<domain>.<verb>
```

v1：

```text
health.check
login.qr.start
login.qr.poll
login.sms.start        # V1.1
login.sms.verify       # V1.1
session.validate
friends.list
conversations.list
conversations.archive   # platform-side archive; requires a verified selector and receipt
message.send_text
message.send_sticker   # V1.1
message.send_first     # V1.2
```

用户侧归档仍只更新产品侧 `conversations.archived_at` 索引字段；平台侧归档现在冻结为
独立的 `conversations.archive` 操作，不得复用本地归档 API 假装平台操作成功。该操作要求：

```json
{
  "session": {"kind": "playwright_storage_state_file", "path": "/run/.../session.json"},
  "target": {"platform_conversation_id": "0:1:..."},
  "archived": true
}
```

当前 Browser adapter 已接入目标会话菜单、可选对端身份校验和平台状态/成功提示回执；只有同时
确认目标会话 ID、目标归档状态和平台回执才返回成功。真实 selector、菜单结构和平台回执仍需
真实账号环境验证；adapter 未部署时返回 `PLATFORM_ARCHIVE_UNAVAILABLE`，selector 变化时返回
`BROWSER_SELECTOR_CHANGED`，回执未知时返回 `ADAPTER_INCOMPATIBLE` 并携带
`{"outcome":"unknown"}`，不得返回成功 envelope。后续执行仍由 Job/Outbox 和账号锁控制幂等，
本地 `conversations.archived_at` 不会被该操作写入。

Go 不向 Sidecar 传 DOM selector / XPath / webpack module id。

## 5. Health

Request：

```json
{
  "protocol_version": 1,
  "request_id": "...",
  "op": "health.check",
  "deadline_ms": 5000,
  "input": {}
}
```

Result：

```json
{
  "status": "healthy",
  "adapter": "browser.consumer",
  "version": "1.0.0",
  "capabilities": [
    "login.qr",
    "session.validate",
    "friends.sync",
    "conversations.sync",
    "message.send.text.existing",
    "message.send.sticker.existing"
  ]
}
```

Protocol Adapter 额外返回 bundle/SDK compatibility 状态，但不返回下载路径或任何账号数据。

## 6. QR Login

QR 登录是交互式长任务，Sidecar 只负责页面会话，Go Job 负责 SSE。

### `login.qr.start`

Input：

```json
{
  "profile_dir": "/run/douyin-keeper/login/job-public-id",
  "locale": "zh-CN"
}
```

Result：

```json
{
  "login_handle": "qr_0191...",
  "qr": {
    "format": "data_url",
    "value": "data:image/png;base64,...",
    "expires_at": "2026-08-23T17:00:00+08:00"
  }
}
```

`login_handle` 只在该 Sidecar 实例和本次登录 context 生命周期内有效。Sidecar 会周期清理
已过期且未再次 poll/verify 的 handle 并关闭对应 Playwright context；绑定成功后账号 Profile
保留，供后续 session-check、好友同步和发送任务复用。临时 session 导出文件仍由 Worker
在 Job 完成、取消或 lease 回收时删除。

### `login.qr.poll`

Input：

```json
{
  "login_handle": "qr_0191...",
  "export_session_file": "/run/douyin-keeper/session-export/job.json"
}
```

可能结果：

```json
{"state":"waiting"}
```

```json
{"state":"scanned"}
```

```json
{
  "state":"authenticated",
  "identity": {
    "platform_user_id":"123456789",
    "nickname":"Miles",
    "avatar_url":"https://..."
  },
  "session_exported": true
}
```

遇到平台安全验证：

```json
{
  "state":"challenge_required"
}
```

此时必须停止自动流程，交由用户处理；Sidecar 不提供验证规避逻辑。

## 6.1 SMS Login

`login.sms.start` 使用独立临时 `profile_dir` 启动手机号登录并触发平台发送
验证码：

```json
{
  "profile_dir": "/run/douyin-keeper/login/job-public-id",
  "phone": "+86 13800138000",
  "locale": "zh-CN"
}
```

Result 只返回短生命周期的 `login_handle` 和过期时间：

```json
{
  "login_handle": "sms_0191...",
  "expires_at": "2026-08-23T17:05:00+08:00"
}
```

验证码由 Go API 通过 `POST /api/v1/jobs/{jobId}/sms-verify` 接收后写入带 TTL 的
Redis 临时键，worker 取出即删除，再调用 `login.sms.verify`：

```json
{
  "login_handle": "sms_0191...",
  "code": "123456",
  "export_session_file": "/run/douyin-keeper/session-export/job.json"
}
```

验证码不会写入数据库、Job Event、日志或 Sidecar 返回消息。验证码错误返回
`SMS_CODE_INVALID` 并允许用户重新提交；过期返回 `SMS_CODE_EXPIRED`；安全验证返回
`challenge_required` 并终止流程。

## 7. Session Validate

`session.validate`：

```json
{
  "session": {
    "kind": "playwright_storage_state_file",
    "path": "/run/.../session.json"
  },
  "validation_level": "basic"
}
```

Result：

```json
{
  "valid": true,
  "identity": {
    "platform_user_id": "123456789",
    "nickname": "Miles",
    "avatar_url": "https://..."
  },
  "capability_hints": [
    "friends.sync",
    "message.send.text.existing"
  ]
}
```

`valid=false` 应通过标准错误码区分：

- `SESSION_EXPIRED`
- `CHALLENGE_REQUIRED`
- `PLATFORM_RATE_LIMITED`

## 8. Friends List

Request：

```json
{
  "protocol_version": 1,
  "request_id": "...",
  "op": "friends.list",
  "deadline_ms": 60000,
  "input": {
    "session": {
      "kind": "playwright_storage_state_file",
      "path": "/run/.../session.json"
    }
  }
}
```

Result：

```json
{
  "friends": [
    {
      "platform_user_id": "987654321",
      "display_name": "Jasmine",
      "nickname": "Jasmine",
      "short_id": "douyin_xxx",
      "avatar_url": "https://...",
      "streak_days": 128,
      "conversation": {
        "platform_conversation_id": "0:1:..."
      }
    }
  ],
  "complete": true
}
```

如果无法稳定解析 `platform_user_id`：

```json
{
  "platform_user_id": null,
  "identity_status": "pending",
  "display_name": "..."
}
```

Go 可以展示该好友，但禁止自动发送。

## 9. Conversations List

用于 Protocol Adapter / 身份补全：

```json
{
  "session": {...},
  "cursor": null,
  "limit": 100
}
```

Result：

```json
{
  "items": [
    {
      "platform_conversation_id": "0:1:...",
      "peer_platform_user_id": "987654321",
      "peer_display_name": "Jasmine",
      "last_message_at": "2026-08-23T08:30:00Z"
    }
  ],
  "next_cursor": null
}
```

`peer_display_name` 只能辅助展示/诊断，禁止作为消息目标唯一条件。

`conversations.list` 的输入校验和消费者会话页分页 selector 已由 Sidecar v1 实现。adapter 使用
稳定的 `platform_conversation_id` 作为 `next_cursor`，并要求每条结果同时具备
`platform_conversation_id` 与 `peer_platform_user_id`；缺少稳定身份时不得使用昵称补全，也不得返回
成功的可发送会话。真实抖音账号环境仍需验证页面结构与平台数据；Playwright/adapter 未部署时仍返回
`ADAPTER_UNAVAILABLE`，selector 变化或分页无法稳定时返回对应的 fail-closed 错误，不得返回空的
成功列表伪装同步完成。

## 10. Send Text

Request：

```json
{
  "protocol_version": 1,
  "request_id": "...",
  "op": "message.send_text",
  "deadline_ms": 30000,
  "input": {
    "session": {...},
    "target": {
      "platform_user_id": "987654321",
      "platform_conversation_id": "0:1:..."
    },
    "message": {
      "text": "今天也记得续火花"
    }
  }
}
```

目标规则：

1. 已存在会话时优先使用 `platform_conversation_id`；
2. 同时校验会话 peer 与 `platform_user_id` 一致；
3. 不允许只有 nickname/display_name；
4. 目标不一致返回 `TARGET_IDENTITY_MISMATCH`，不得尝试猜测。

Success：

```json
{
  "confirmed": true,
  "platform_message_id": "739...",
  "sent_at": "2026-08-23T08:31:10Z"
}
```

只有平台明确确认后 `confirmed=true`。不能用固定 sleep 后假定成功。Browser Adapter
应记录发送前已有消息 ID，只接受发送后出现的新增 `platform_message_id`；“最后一条
相同文本”可能是历史消息，不能单独作为成功证据。

## 10.1 Send Sticker（V1.1）

请求与文字发送使用相同的 `session`、`target` 和确认结果结构，`op` 改为
`message.send_sticker`：

```json
{
  "protocol_version": 1,
  "request_id": "...",
  "op": "message.send_sticker",
  "deadline_ms": 30000,
  "input": {
    "session": {...},
    "target": {
      "platform_user_id": "987654321",
      "platform_conversation_id": "0:1:..."
    },
    "message": {
      "sticker_id": "sticker_001"
    }
  }
}
```

`sticker_id` 必须是当前账号/Sidecar 能识别的稳定平台资源标识。任务中的
`message.body` 只保存这个 ID，不保存图片 URL、展示名称或 Cookie。成功时仍必须
返回 `confirmed=true` 和 `platform_message_id`；贴纸能力不可用时返回稳定错误码，
Go worker 会 fail-closed。

当前 Sidecar 已完成 `session`、双重目标 ID、表情面板 selector 和 `sticker_id` 的输入校验；
只有精确匹配稳定资源 ID 并观察到发送前不存在、发送后新增的 `platform_message_id` 才返回成功。
selector 变化或 Playwright/adapter 未部署时返回 `ADAPTER_UNAVAILABLE` 或
`BROWSER_SELECTOR_CHANGED`，回执未知时返回 `ADAPTER_INCOMPATIBLE` 并携带
`{"outcome":"unknown"}`，不得返回成功 envelope。`packages/contracts/sidecar/v1.schema.json` 同时为
`conversations.list`、`conversations.archive`、`message.send_text`、`message.send_sticker`、
`message.send_first`、QR/SMS 登录、`session.validate` 和 `friends.list` 提供 operation-specific
input 定义，`contracts:check` 会覆盖合法请求及未知嵌套字段。

## 10.2 Send First Message（V1.2）

`message.send_first` 只允许使用稳定的 `platform_user_id`，因为此时可能还没有会话 ID：

```json
{
  "protocol_version": 1,
  "request_id": "...",
  "op": "message.send_first",
  "deadline_ms": 30000,
  "input": {
    "session": {...},
    "target": {
      "platform_user_id": "987654321"
    },
    "message": {
      "text": "今天也记得续火花"
    }
  }
}
```

Sidecar 必须通过平台明确的 Creator 首聊结果确认发送；不能因为页面打开或输入框写入
成功就返回 `confirmed=true`。未实现或未通过能力探测时返回
`UNSUPPORTED_OPERATION`/`ADAPTER_UNAVAILABLE`，Go worker 不得降级为已有会话发送。

当前 Go `ProcessClient` 已在传输边界冻结该输入边界：顶层只允许 `session`、`target`、`message`，
target 只允许 `platform_user_id`，message 只允许非空 `text`；真实 Creator/Protocol adapter
尚未部署时，协议 lane 使用带 `protocol.im` 身份的 unavailable client fail-closed。Playwright
Browser Sidecar 不接收该协议任务，仍返回 `UNSUPPORTED_OPERATION`，避免把首聊误当作已有会话发送。
同一输入边界已同步到 `packages/contracts/sidecar/v1.schema.json`，契约检查会验证合法请求和
带会话 ID 的非法请求，避免 JSON Schema 与 Go 运行时校验分叉。

## 11. 错误码

Sidecar 至少支持：

```text
INVALID_REQUEST
UNSUPPORTED_PROTOCOL_VERSION
UNSUPPORTED_OPERATION
DEADLINE_EXCEEDED
SIDECAR_INTERNAL_ERROR

SESSION_EXPIRED
QR_EXPIRED
SMS_CODE_INVALID
SMS_CODE_EXPIRED
LOGIN_HANDLE_NOT_FOUND
CHALLENGE_REQUIRED
PLATFORM_RATE_LIMITED

FRIEND_NOT_FOUND
FRIEND_AMBIGUOUS
CONVERSATION_NOT_FOUND
PLATFORM_ARCHIVE_UNAVAILABLE
TARGET_IDENTITY_MISMATCH

BROWSER_NAVIGATION_FAILED
BROWSER_SELECTOR_CHANGED
BROWSER_CONTEXT_FAILED

ADAPTER_UNAVAILABLE
ADAPTER_INCOMPATIBLE
NETWORK_TIMEOUT
NETWORK_ERROR
```

Sidecar 决定 `retryable`，Go 再结合业务规则决定是否真的重试。

涉及 Adapter fallback 的错误必须在 `error.detail` 中提供明确结果证据：
`{"outcome":"not_sent"}` 或等价的 `{"platform_write_accepted":false}`。
缺少证据、两项证据互相冲突、`outcome=unknown` 或任何超时/读写中断都表示平台结果未知，Go
不得回落到另一个 Adapter 重发。

## 12. Capability 映射

Sidecar operation 与领域 capability 分离：

| Operation | Capability |
|---|---|
| `session.validate` | `session.validate` |
| `friends.list` | `friends.sync` |
| `conversations.list` | `conversations.sync` |
| `conversations.archive` | `conversations.archive` |
| `message.send_text` | `message.send.text.existing` |
| `message.send_sticker` | `message.send.sticker.existing` |
| `message.send_first` | `message.send.text.first` |

这样未来一个 capability 可以由不同 Adapter 实现。

账号能力快照按 `(account_id, capability, adapter)` 保存。一个账号可以同时存在
`browser.consumer` 与 `protocol.im` 的同名能力；Worker 读取快照时必须带目标 Adapter，不能用
另一个 Adapter 的 unavailable/degraded 结果覆盖或放行当前发送路径。周期性 capability probe
可以在同一事务内刷新多个已注册 Adapter，并分别更新各自的全局 `adapter_health`。

## 13. Protocol Sidecar 额外约束

Protocol Sidecar 属于可选实验性能力：

- 远端 Bundle 必须包含固定文件 `manifest.json`，Worker 只接受以下字段，未知字段直接拒绝：

  ```json
  {
    "protocol_version": 1,
    "adapter": "protocol.im",
    "adapter_version": "2026.08.25",
    "entrypoint": "index.mjs",
    "entrypoint_sha256": "<64 位小写十六进制 SHA-256>"
  }
  ```

  `entrypoint` 必须是 Bundle 内的相对路径，不能是绝对路径、路径穿越或符号链接；Worker
  在启动进程前重新计算入口文件 SHA-256，并要求 `protocol_version`、`adapter` 与当前
  控制面完全匹配。校验通过后才允许以 Bundle 目录作为工作目录启动入口文件。
- `worker-light` 通过 `PROTOCOL_SIDECAR_BUNDLE_DIR` 启用校验后的 Bundle，使用
  `PROTOCOL_SIDECAR_COMMAND`（默认 `node`）启动 manifest 指定的入口；未设置 Bundle
  时不启动 Protocol 进程。
- 未配置 Bundle 时，Protocol lane 使用 `ADAPTER_UNAVAILABLE` 的 unavailable client；
  manifest、入口文件或哈希不兼容时使用 `ADAPTER_INCOMPATIBLE`，两种情况都保持
  fail-closed，不会把任务交给 Browser Sidecar；
- 连续兼容性失败触发 Go 层全局 circuit breaker；
- Sidecar 不得持有数据库、Redis、Session master key；
- Protocol 失败不得直接修改 `DouyinAccount.session_status`；
- 只有独立 `session.validate` 明确确认失效时，才能标记 Session expired。

## 14. Protocol Versioning

`protocol_version` 只在发生破坏性修改时递增。

兼容性规则：

- 增加可选字段：不升 major；
- 增加新 op：不升 major；
- 修改字段语义、删除字段、修改错误语义：升 major；
- Sidecar 不认识请求版本时返回 `UNSUPPORTED_PROTOCOL_VERSION`。
