# Playwright sidecar

选择器与作业都在 `adapters/douyin_web/`。Go 只传 `op` / 临时 `storage_state` 路径，不写 XPath。

## 依赖（本机 Windows）

```
cd spark/worker-py
pip install -r requirements.txt
playwright install chromium
```

未装 Chromium 时扫码/短信会返回真实错误 `playwright_missing`，不会假装成功。

## 作业

| op | 行为 |
|---|---|
| `login_qr_loop` | 打开抖音登录页，取出真二维码（data URL）推给 Worker，轮询 `sessionid` 后导出 `state_out` |
| `login_sms_start` / `login_sms_verify` | 同一 `user_data_dir` 填手机号、点获取、回填验证码。不代收短信 |
| `session_check` | 用已有 state 打开私信页，判断 valid/expired |
| `list_friends` / `harvest_creator_map` | 消费者站会话列表 / 创作者中心好友列表 |
| `archive_messages` | 打开会话后用 DOM 抽消息 |
| `send_text` / `send_sticker` | 消费者站发送；成功看输入框清空或回执 |
| `send_first_message_creator` | 创作者中心无会话首聊 |

stdout 只打 NDJSON 事件。禁止回传 cookie / `storage_state`。

默认 `HUOHUA_ADAPTER=live`。调试可设 `HUOHUA_PW_HEADLESS=0` 看浏览器窗口。
