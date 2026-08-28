#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const logPath = process.argv[2] || "logs/worker-interactive.log";
const rows = (await readFile(logPath, "utf8"))
  .split("\n")
  .filter(Boolean)
  .flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
const validationIndex = rows.findLastIndex((row) => row.event === "session_validate_success");
if (validationIndex < 0) {
  console.log(JSON.stringify({ verdict: "NO_REPRO", reason: "no successful browser session validation" }));
  process.exit(2);
}
const window = rows.slice(validationIndex, validationIndex + 24);
const pollSucceeded = window.some((row) => row.event === "request_succeeded" && row.op === "login.qr.poll");
const transportFailed = window.some((row) => row.msg === "qr_bind_poll_transport_failed");
const terminalCode = window.find((row) => row.msg === "qr_bind_terminal_failure")?.error_code || null;
const summary = {
  browser_session_validated: true,
  qr_poll_returned: pollSucceeded,
  transport_failed: transportFailed,
  terminal_code: terminalCode,
};
if (!pollSucceeded && transportFailed) {
  console.log(JSON.stringify({ verdict: "RED", ...summary }));
  process.exit(1);
}
console.log(JSON.stringify({ verdict: "GREEN", ...summary }));
