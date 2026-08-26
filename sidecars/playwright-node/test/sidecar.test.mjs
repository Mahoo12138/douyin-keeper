import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAuthenticatedPage } from "../auth-state.mjs";
import { canCommitFriendSync } from "../friend-scan.mjs";
import { qrLoginState } from "../login-state.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function callSidecar(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, "sidecar.mjs")], { cwd: root });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0 && !output) return reject(new Error(`sidecar exited with ${code}`));
      try { resolve(JSON.parse(output.trim())); } catch (error) { reject(error); }
    });
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

test("health.check returns the Node browser adapter identity", async () => {
  const response = await callSidecar({
    protocol_version: 1,
    request_id: "health-test",
    op: "health.check",
    deadline_ms: 5000,
    input: {},
  });
  assert.equal(response.ok, true);
  assert.equal(response.meta.adapter, "browser.consumer");
  assert.equal(response.meta.adapter_version, "node-0.1.0");
  assert.ok(response.result.capabilities.includes("login.qr"));
});

test("unknown request fields fail closed with the v1 envelope", async () => {
  const response = await callSidecar({
    protocol_version: 1,
    request_id: "invalid-test",
    op: "health.check",
    deadline_ms: 5000,
    input: {},
    unexpected: true,
  });
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "INVALID_REQUEST");
});

test("session.validate returns expired without opening a browser when the export has no session cookie", async () => {
  const directory = await mkdtemp(join(tmpdir(), "douyin-keeper-sidecar-test-"));
  const statePath = join(directory, "state.json");
  try {
    await writeFile(statePath, JSON.stringify({
      cookies: [],
      origins: [],
    }), { mode: 0o600 });
    const response = await callSidecar({
      protocol_version: 1,
      request_id: "session-valid-test",
      op: "session.validate",
      deadline_ms: 5000,
      input: { session: { kind: "playwright_storage_state_file", path: statePath } },
    });
    assert.equal(response.ok, true);
    assert.deepEqual(response.result, { valid: false, state: "expired" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("session.validate can open a persistent profile when a local browser is configured", { skip: !process.env.PLAYWRIGHT_EXECUTABLE_PATH }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "douyin-keeper-profile-test-"));
  const statePath = join(directory, "state.json");
  const profilePath = join(directory, "profile");
  try {
    await writeFile(statePath, JSON.stringify({ cookies: [], origins: [] }), { mode: 0o600 });
    const response = await callSidecar({
      protocol_version: 1,
      request_id: "persistent-profile-test",
      op: "session.validate",
      deadline_ms: 30000,
      input: { session: { kind: "playwright_storage_state_file", path: statePath, profile_dir: profilePath } },
    });
    assert.equal(response.ok, false);
    assert.equal(response.error.code, "SESSION_EXPIRED");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("stale session cookies do not authenticate a page that is actually logged out", () => {
  assert.equal(isAuthenticatedPage({
    url: "https://www.douyin.com/user/self",
    bodyText: "登录 / 注册",
    hasProfileSignal: true,
    hasLoginSignal: true,
  }), false);
});

test("friend sync cannot commit without the follower response and non-empty relation data", () => {
  assert.equal(canCommitFriendSync({ responseSeen: false, friendCount: 1, complete: true }), false);
  assert.equal(canCommitFriendSync({ responseSeen: true, friendCount: 0, complete: true }), false);
  assert.equal(canCommitFriendSync({ responseSeen: true, friendCount: 2, complete: false }), false);
  assert.equal(canCommitFriendSync({ responseSeen: true, friendCount: 2, complete: true }), true);
});

test("QR login accepts strong Creator Center auth even when the old QR node remains mounted", () => {
  assert.equal(qrLoginState({ qrSeen: false, qrVisible: false }), "waiting");
  assert.equal(qrLoginState({ qrSeen: true, qrVisible: true }), "waiting");
  assert.equal(qrLoginState({ creatorAuthenticated: true, identityReady: true, sessionCookie: true, qrSeen: true, qrVisible: true }), "authenticated");
  assert.equal(qrLoginState({ qrSeen: true, qrVisible: false }), "scanned");
  assert.equal(qrLoginState({ sessionCookie: true }), "scanned");
  assert.equal(qrLoginState({ creatorAuthenticated: true, identityReady: true, sessionCookie: true }), "authenticated");
  assert.equal(qrLoginState({ challenge: true, qrSeen: true }), "challenge_required");
});
