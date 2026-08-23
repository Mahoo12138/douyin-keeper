# Worker 与 sidecar JSON 契约

Go Worker 用参数数组启动 sidecar（禁止 `sh -c` 拼用户输入）。stdin 一次一个 JSON 作业。Python stdout 打 NDJSON 事件；Node stdout 一个 JSON。Cookie / `storage_state` / `session_blob` **不得**出现在 stdout。

会话明文只写到 Worker 指定的临时文件；Worker 读入后 AES-256-GCM 入库并立刻删除。

`HUOHUA_ADAPTER` 默认 `live`：走 Playwright 真扫码/真短信与协议发送。禁止写入假好友、假消息、假 nickname、假会话。禁止复制 `开源项目/` 源码。

## Python（`spark/worker-py/adapters/douyin_web/`）

| op | 说明 |
|---|---|
| `login_qr_loop` | 打开登录页，SSE 推真二维码，轮询 `sessionid` 后写 `state_out` |
| `login_sms_start` / `login_sms_verify` | 同一 persistent context：填手机 → 用户自看短信 → 回填验证码 |
| `session_check` | 用 `state_in` 打开私信页，回 `session_status` |
| `list_friends` | 消费者站会话列表，空则 `friends[]`，不得编造 |
| `harvest_creator_map` | 创作者中心好友列表 |
| `archive_messages` | 当前会话 DOM 抽消息 |
| `list_stickers` / `send_sticker` / `send_text` / `send_first_message_creator` | 浏览器通道；成功必须 `ok` + `confirmed` 或 `platform_msg_id` |

发送成功看输入框清空 / IM 回执，禁止只 sleep。

## Node（`spark/protocol-node`）

- `protocol_send_text` / `protocol_list_conversations`：用 Cookie 拉创作者 IM。失败回 `protocol_unavailable`，Worker 回落 Playwright。
- SDK URL/哈希会过期，见 `im_client.mjs` 注释。
