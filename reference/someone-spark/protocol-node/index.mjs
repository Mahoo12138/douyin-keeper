#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { listConversations, sendText } from "./im_client.mjs";

function out(obj) {
  const clean = { ...obj };
  delete clean.cookies;
  delete clean.cookie;
  delete clean.storage_state;
  delete clean.session_blob;
  process.stdout.write(JSON.stringify(clean));
}

function adapter() {
  return process.env.HUOHUA_ADAPTER || "live";
}

const arg = process.argv[2] || "version";
if (arg === "version" || arg === "ping") {
  out({ ok: true, name: "huohua-protocol", version: "0.2.0", adapter: adapter() });
  process.exit(0);
}

let req = {};
try {
  const raw = readFileSync(0, "utf8");
  if (raw.trim()) req = JSON.parse(raw);
} catch {
  out({ ok: false, error: "bad_json", code: "bad_json" });
  process.exit(0);
}

const op = req.op || "";
try {
  if (op === "protocol_send_text") {
    const r = await sendText(req.state_in, req.friend_display_name, req.body, Boolean(req.dry_run));
    out(r);
    process.exit(0);
  }
  if (op === "protocol_list_conversations") {
    const list = await listConversations(req.state_in);
    out({ ok: true, conversations: list });
    process.exit(0);
  }
  out({ ok: false, error: "not_implemented", code: "not_implemented", op });
} catch (err) {
  out({
    ok: false,
    error: err.code || "protocol_unavailable",
    code: err.code || "protocol_unavailable",
    message: String(err.message || err),
  });
}
