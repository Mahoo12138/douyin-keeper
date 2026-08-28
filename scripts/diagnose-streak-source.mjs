#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { createDecipheriv } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const sidecarRoot = join(root, "sidecars", "playwright-node");
const profileDir = String(process.env.STREAK_PROFILE_DIR || "").trim();
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  || "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";

if (!profileDir.startsWith("/")) {
  console.error("STREAK_PROFILE_DIR must be an absolute persistent profile path");
  process.exit(64);
}
const accountPublicID = profileDir.split("/").at(-1)?.replace(/^account-/, "") || "";
if (!/^[0-9a-f-]{36}$/i.test(accountPublicID)) {
  console.error("STREAK_PROFILE_DIR must end in account-<uuid>");
  process.exit(64);
}

const apiPID = String(process.env.API_PID || "").trim();
if (!/^\d+$/.test(apiPID)) {
  console.error("API_PID is required so the probe can inherit the running test environment");
  process.exit(64);
}
const apiCommand = execFileSync("/bin/ps", ["eww", "-p", apiPID, "-o", "command="], { encoding: "utf8" });
const apiEnvironment = {};
for (const match of apiCommand.matchAll(/(?:^|\s)([A-Z][A-Z0-9_]*)=([^\s]*)/g)) apiEnvironment[match[1]] = match[2];
const masterKey = String(apiEnvironment.SESSION_MASTER_KEY || "");
if (!/^[0-9a-f]{64}$/i.test(masterKey)) {
  console.error("the running API does not expose a valid session encryption key");
  process.exit(78);
}

const temporaryDir = await mkdtemp(join(tmpdir(), "dk-streak-source-"));
await chmod(temporaryDir, 0o700);
const statePath = join(temporaryDir, "state.json");
const logPath = join(temporaryDir, "probe.log");

try {
  const sql = `SELECT json_build_object(
    'ciphertext', encode(s.ciphertext, 'base64'),
    'user_public_id', u.public_id,
    'account_public_id', a.public_id,
    'key_version', s.key_version
  )::text
  FROM account_sessions s
  JOIN douyin_accounts a ON a.id=s.account_id
  JOIN users u ON u.id=a.user_id
  WHERE a.public_id='${accountPublicID}'::uuid AND s.revoked_at IS NULL
  ORDER BY s.version DESC LIMIT 1`;
  const envelopeText = execFileSync("docker", [
    "exec", "-i", "douyin-keeper-dev-postgres-1",
    "sh", "-lc", "psql -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -At",
  ], { input: `${sql};\n`, encoding: "utf8" }).trim();
  const envelope = JSON.parse(envelopeText);
  const sealed = Buffer.from(envelope.ciphertext, "base64");
  const nonce = sealed.subarray(0, 12);
  const ciphertextAndTag = sealed.subarray(12);
  const ciphertext = ciphertextAndTag.subarray(0, -16);
  const authTag = ciphertextAndTag.subarray(-16);
  const aad = `session:v1:user/${envelope.user_public_id}:account/${envelope.account_public_id}:key/${envelope.key_version}`;
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(masterKey, "hex"), nonce);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  await writeFile(statePath, plaintext, { mode: 0o600 });

  const response = await new Promise((resolveResponse, reject) => {
    const child = spawn(process.execPath, ["sidecar.mjs"], {
      cwd: sidecarRoot,
      env: {
        ...process.env,
        PLAYWRIGHT_EXECUTABLE_PATH: executablePath,
        PLAYWRIGHT_HEADLESS: process.env.PROBE_HEADLESS || "1",
        PLAYWRIGHT_SIDECAR_DEBUG: "1",
        PLAYWRIGHT_SIDECAR_LOG_FILE: logPath,
        PLAYWRIGHT_STREAK_SOURCE_PROBE: "1",
      },
      stdio: ["pipe", "pipe", "ignore"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.once("error", reject);
    child.once("close", () => {
      try { resolveResponse(JSON.parse(output.trim())); }
      catch (error) { reject(error); }
    });
    child.stdin.end(`${JSON.stringify({
      protocol_version: 1,
      request_id: "streak-source-probe",
      op: "conversations.list",
      deadline_ms: 240000,
      input: {
        session: {
          kind: "playwright_storage_state_file",
          path: statePath,
          profile_dir: profileDir,
        },
        limit: 100,
      },
    })}\n`);
  });

  const items = response?.result?.items || [];
  const nonzero = items.filter((item) => Number.isInteger(item.streak_days) && item.streak_days > 0).length;
  const events = (await readFile(logPath, "utf8"))
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } })
    .filter((entry) => entry.event === "DEBUG-streak-source-match");
  const endpointFields = new Map();
  for (const event of events) {
    for (const match of event.matches || []) {
      for (const fieldPath of match.candidate_paths || []) {
        const key = `${match.endpoint}#${fieldPath}`;
        endpointFields.set(key, (endpointFields.get(key) || 0) + 1);
      }
    }
  }
  const candidates = [...endpointFields.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 20)
    .map(([endpointField, matches]) => ({ endpoint_field: endpointField, matches }));
  const matchedRows = events.filter((event) => event.match_count > 0).length;
  console.log(JSON.stringify({
    ok: response?.ok === true,
    conversation_count: items.length,
    dom_nonzero_rows: nonzero,
    probed_nonzero_rows: events.length,
    rows_with_interface_candidate: matchedRows,
    candidates,
    error_code: response?.error?.code || null,
  }));
  if (!response?.ok || nonzero === 0) process.exitCode = 2;
  else if (matchedRows === 0) process.exitCode = 1;
} finally {
  await rm(temporaryDir, { recursive: true, force: true });
}
