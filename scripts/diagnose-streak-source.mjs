#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { createDecipheriv, createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

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
const configuredLogPath = String(process.env.STREAK_PROBE_LOG_FILE || "").trim();
if (configuredLogPath && !isAbsolute(configuredLogPath)) {
  console.error("STREAK_PROBE_LOG_FILE must be an absolute path");
  process.exit(64);
}
const logPath = configuredLogPath || join(temporaryDir, "probe.log");
if (configuredLogPath) {
  await mkdir(dirname(logPath), { recursive: true, mode: 0o700 });
  await chmod(dirname(logPath), 0o700).catch(() => {});
}

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
  const databaseRowsText = execFileSync("docker", [
    "exec", "-i", "douyin-keeper-dev-postgres-1",
    "sh", "-lc", "psql -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -At",
  ], {
    input: `SELECT COALESCE(json_agg(json_build_object(
      'platform_conversation_id', c.platform_conversation_id,
      'streak_days', COALESCE(f.streak_days, 0)
    )), '[]'::json)::text
    FROM conversations c
    JOIN douyin_accounts a ON a.id=c.account_id
    LEFT JOIN friends f ON f.id=c.friend_id AND f.deleted_at IS NULL
    WHERE a.public_id='${accountPublicID}'::uuid AND c.archived_at IS NULL;\n`,
    encoding: "utf8",
  }).trim();
  const databaseRows = JSON.parse(databaseRowsText || "[]");
  const databaseStreaks = new Map(databaseRows.map((row) => [
    String(row.platform_conversation_id || ""),
    Number(row.streak_days || 0),
  ]));
  const probeStreaks = new Map(items.map((row) => [
    String(row.platform_conversation_id || ""),
    Number(row.streak_days || 0),
  ]));
  const mismatchIDs = new Set([...databaseStreaks.keys(), ...probeStreaks.keys()]);
  const streakMismatches = [...mismatchIDs]
    .filter((id) => id && databaseStreaks.get(id) !== probeStreaks.get(id))
    .map((id) => ({
      conversation_id_hash: createHash("sha256").update(id).digest("hex").slice(0, 12),
      database_streak_days: databaseStreaks.get(id) ?? null,
      probe_streak_days: probeStreaks.get(id) ?? null,
    }))
    .sort((left, right) => left.conversation_id_hash.localeCompare(right.conversation_id_hash));
  const allEvents = (await readFile(logPath, "utf8"))
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  const events = allEvents.filter((entry) => entry.event === "conversation_streak_source_probe");
  const hydrationEvents = allEvents.filter((entry) => entry.event === "conversation_row_hydrated");
  const rejectedEvents = allEvents
    .filter((entry) => [
      "conversation_row_click_rejected",
      "conversation_clicked_identity_rejected",
      "conversation_row_hydration_rejected",
    ].includes(entry.event))
    .map((entry) => ({
      event: entry.event,
      data_index: entry.data_index ?? null,
      reason: entry.reason || null,
      expected_title_hash: entry.expected_title_hash || null,
      actual_title_hash: entry.actual_title_hash || null,
      response_matches_title: entry.response_matches_title ?? null,
      response_matches_peer: entry.response_matches_peer ?? null,
      response_is_clicked_group: entry.response_is_clicked_group ?? null,
      conversation_id_present: entry.conversation_id_present ?? null,
      peer_id_present: entry.peer_id_present ?? null,
      conversation_type: entry.conversation_type || null,
    }));
  const failedInventoryEvents = allEvents
    .filter((entry) => String(entry.event || "").startsWith("conversations_scan_failed_"))
    .map((entry) => ({
      event: entry.event,
      observed_index_count: entry.observed_index_count ?? null,
      highest_data_index: entry.highest_data_index ?? null,
      hydrated_index_count: entry.hydrated_index_count ?? null,
      missing_indexes: entry.missing_indexes || [],
      missing_index_states: entry.missing_index_states || [],
      duplicate_conversation_id_count: entry.duplicate_conversation_id_count ?? null,
      duplicate_direct_peer_count: entry.duplicate_direct_peer_count ?? null,
      duplicate_rows: entry.duplicate_rows || [],
    }));
  const failedClickEvents = allEvents
    .filter((entry) => entry.event === "conversation_row_click_result" && entry.clicked === false)
    .map((entry) => ({
      data_index: entry.data_index ?? null,
      conversation_id_hash: entry.conversation_id_hash || null,
      dom_streak_days: entry.dom_streak_days ?? null,
    }));
  const interfaceOnlyRows = hydrationEvents
    .filter((entry) => entry.streak_source === "interface"
      && !Number.isInteger(entry.dom_streak_days)
      && Number(entry.streak_days) > 0)
    .map((entry) => ({
      conversation_id_hash: entry.conversation_id_hash,
      streak_days: entry.streak_days,
      interface_streak_candidates: entry.interface_streak_candidates,
      interface_streak_paths: entry.interface_streak_paths,
    }));
  const domInterfaceMismatches = hydrationEvents
    .filter((entry) => Number.isInteger(entry.dom_streak_days)
      && Number.isInteger(entry.streak_days)
      && entry.dom_streak_days !== entry.streak_days)
    .map((entry) => ({
      conversation_id_hash: entry.conversation_id_hash,
      dom_streak_days: entry.dom_streak_days,
      selected_streak_days: entry.streak_days,
      streak_source: entry.streak_source,
    }));
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
    database_conversation_count: databaseRows.length,
    database_nonzero_rows: databaseRows.filter((row) => Number(row.streak_days) > 0).length,
    streak_mismatch_count: streakMismatches.length,
    streak_mismatches: streakMismatches,
    interface_only_nonzero_count: interfaceOnlyRows.length,
    interface_only_nonzero_rows: interfaceOnlyRows,
    dom_interface_mismatch_count: domInterfaceMismatches.length,
    dom_interface_mismatches: domInterfaceMismatches,
    probed_nonzero_rows: events.length,
    rows_with_interface_candidate: matchedRows,
    candidates,
    error_code: response?.error?.code || null,
    error_details: response?.error?.details || null,
    rejected_event_count: rejectedEvents.length,
    rejected_events: rejectedEvents.slice(-80),
    failed_inventory_events: failedInventoryEvents.slice(-10),
    failed_click_events: failedClickEvents.slice(-40),
  }));
  if (!response?.ok || nonzero === 0) process.exitCode = 2;
  else if (streakMismatches.length > 0) process.exitCode = 1;
  else if (matchedRows === 0) process.exitCode = 1;
} finally {
  await rm(temporaryDir, { recursive: true, force: true });
}
