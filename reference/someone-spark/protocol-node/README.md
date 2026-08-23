# 创作者 IM 协议 sidecar

对照 sparkflow 的机制原写：用 `storage_state` 拼 Cookie → 拉 `user_token` → 在 Node VM 里跑创作者中心 IM SDK → `createMessage` / `sendMessage`。成功看 IM `statusCode === 0` 或回执 id，不 sleep。

- 不要把 `protocol_sender.mjs` 整文件拷进本目录。
- `im_client.mjs` 里的 SDK URL/哈希会过期；失败时 Go 回落 Playwright。
- stdout 只回 `ok/confirmed/platform_msg_id` 或错误码，禁止回传 cookie。
