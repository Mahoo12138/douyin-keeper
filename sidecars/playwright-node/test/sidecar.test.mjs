import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAuthenticatedPage } from "../auth-state.mjs";
import { qrLoginState } from "../login-state.mjs";
import { smsLoginRequiresFreshContext } from "../login-state.mjs";
import { smsLoginSurfaceState } from "../login-state.mjs";
import { decodeProtobuf, summarizeProtobuf } from "../conversation-wire.mjs";
import {
  collectorItemsAfterSequence,
  filterConversationRows,
  finalizeConversationInventory,
  mergeConversationInventoryCandidate,
  selectClickedConversationIdentity,
} from "../conversation-utils.mjs";
import { scrollConversationListDOM } from "../conversation-scroll.mjs";
import { clickConversationListRowByIndex } from "../conversation-click.mjs";
import {
  collectJSONStreakCandidates,
  parseConversationStreakText,
  readConversationListStreakDays,
  selectConversationStreakDays,
} from "../conversation-streak.mjs";
import { chromium } from "playwright";

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
  assert.equal(response.meta.adapter_version, "node-0.2.0");
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

test("friends.list is no longer a supported sidecar operation", async () => {
  const response = await callSidecar({
    protocol_version: 1,
    request_id: "legacy-friends-test",
    op: "friends.list",
    deadline_ms: 5000,
    input: {},
  });
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "UNSUPPORTED_OPERATION");
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

test("QR login accepts strong web auth even when the old QR node remains mounted", () => {
  assert.equal(qrLoginState({ qrSeen: false, qrVisible: false }), "waiting");
  assert.equal(qrLoginState({ qrSeen: true, qrVisible: true }), "waiting");
  assert.equal(qrLoginState({ platformAuthenticated: true, identityReady: true, sessionCookie: true, qrSeen: true, qrVisible: true }), "authenticated");
  assert.equal(qrLoginState({ qrSeen: true, qrVisible: false }), "scanned");
  assert.equal(qrLoginState({ sessionCookie: true }), "scanned");
  assert.equal(qrLoginState({ platformAuthenticated: true, identityReady: true, sessionCookie: true }), "authenticated");
  assert.equal(qrLoginState({ challenge: true, qrSeen: true }), "challenge_required");
});

test("SMS re-login requests a fresh browser context", () => {
  assert.equal(smsLoginRequiresFreshContext({ force_login: true }), true);
  assert.equal(smsLoginRequiresFreshContext({ force_login: false }), false);
  assert.equal(smsLoginRequiresFreshContext({}), false);
});

test("SMS login accepts a web page that already shows the phone form", () => {
  assert.equal(smsLoginSurfaceState({ phoneInputVisible: true }), "direct_form");
  assert.equal(smsLoginSurfaceState({ loginButtonClicked: true }), "switching");
  assert.equal(smsLoginSurfaceState({ methodClicked: true }), "switching");
  assert.equal(smsLoginSurfaceState({}), "unavailable");
});

test("protobuf wire decoder preserves nested field paths without exposing values", () => {
  // field 1 = nested message { field 1 = varint 7, field 2 = UTF-8 text }
  const fixture = Uint8Array.from([0x0a, 0x06, 0x08, 0x07, 0x12, 0x02, 0x68, 0x69]);
  const decoded = decodeProtobuf(fixture);
  assert.equal(decoded.ok, true);
  const summary = summarizeProtobuf(decoded);
  assert.deepEqual(summary.field_paths, ["1", "1.1", "1.2"]);
  assert.deepEqual(summary.kinds, { message: 1, varint: 1, string: 1 });
  assert.equal(JSON.stringify(summary).includes("hi"), false);
});

test("protobuf wire decoder rejects truncated payloads", () => {
  const decoded = decodeProtobuf(Uint8Array.from([0x0a, 0x04, 0x08]));
  assert.equal(decoded.ok, false);
});

test("group-only conversation scans exclude direct and unknown rows", () => {
  const rows = filterConversationRows([
    { platform_conversation_id: "0:1:direct", conversation_type: "direct" },
    { platform_conversation_id: "0:1:misclassified", conversation_type: "group" },
    { platform_conversation_id: "0:2:group", conversation_type: "group" },
    { platform_conversation_id: "0:2:inferred-group", conversation_type: "unknown" },
    { platform_conversation_id: "opaque-unknown", conversation_type: "unknown" },
  ], true);
  assert.deepEqual(rows.map((row) => row.platform_conversation_id), ["0:2:group", "0:2:inferred-group"]);
  const authoritative = filterConversationRows([
    { platform_conversation_id: "0:2:group", conversation_type: "group" },
    { platform_conversation_id: "0:2:other-group", conversation_type: "group" },
  ], true, new Set(["0:2:group"]));
  assert.deepEqual(authoritative.map((row) => row.platform_conversation_id), ["0:2:group"]);
});

test("unified conversation inventory keeps direct and group rows", () => {
  const rows = finalizeConversationInventory([
    { platform_conversation_id: "0:1:direct", conversation_type: "direct" },
    { platform_conversation_id: "0:2:group", conversation_type: "group" },
    { platform_conversation_id: "opaque-group", conversation_type: "group" },
  ]);
  assert.deepEqual(rows.map((row) => row.platform_conversation_id), [
    "0:1:direct",
    "0:2:group",
    "opaque-group",
  ]);
});

test("lower-confidence protobuf inventory cannot overwrite a clicked DOM conversation", () => {
  const clickedDOM = {
    platform_conversation_id: "0:1:peer",
    peer_platform_user_id: "peer-sec-uid",
    peer_display_name: "正确会话昵称",
    peer_avatar_url: "https://example.com/peer.png",
    streak_days: 27,
  };
  const protobufGenerated = {
    platform_conversation_id: "0:1:peer",
    peer_platform_user_id: "self-sec-uid",
    peer_display_name: "当前账号昵称",
    peer_avatar_url: "https://example.com/self.png",
    streak_days: null,
  };
  assert.deepEqual(
    mergeConversationInventoryCandidate(clickedDOM, protobufGenerated, 3, 0),
    clickedDOM,
  );
});

test("bounded collector still correlates responses by monotonic sequence", () => {
  const boundedBuffer = [
    { sequence: 79, path: "/old" },
    { sequence: 80, path: "/v2/conversation/get_info_list" },
    { sequence: 81, path: "/aweme/v1/web/user/profile/scene/" },
  ];
  assert.deepEqual(
    collectorItemsAfterSequence(boundedBuffer, 79).map((item) => item.sequence),
    [80, 81],
  );
  assert.deepEqual(collectorItemsAfterSequence(boundedBuffer, 81), []);
});

test("clicked get-info identity overrides recycled DOM identity", () => {
  assert.deepEqual(selectClickedConversationIdentity("stale-dom-id", [
    { conversationID: "0:1:clicked", conversationType: "direct" },
  ]), {
    conversationID: "0:1:clicked",
    conversationType: "direct",
    authoritative: true,
  });
  assert.deepEqual(selectClickedConversationIdentity("stale-dom-id", [
    { conversationID: "0:1:participant", conversationType: "direct" },
    { conversationID: "opaque-auxiliary", conversationType: "unknown" },
  ]), {
    conversationID: "0:1:participant",
    conversationType: "direct",
    authoritative: true,
  });
});

test("conversation scrolling moves only the exact conversation list element", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const rows = Array.from({ length: 30 }, (_, index) => `<div class="conversationConversationItemwrapper" data-index="${index}">row</div>`).join("");
    const messages = Array.from({ length: 30 }, () => "<div class=message-row>message</div>").join("");
    await page.setContent(`<style>
      .layout { display: flex; gap: 20px; }
      .conversationConversationListwrapper, .messageMessageListwrapper { height: 120px; overflow-y: auto; width: 240px; }
      .conversationConversationItemwrapper, .message-row { height: 32px; }
    </style><div class=layout><div class=conversationConversationListwrapper>${rows}</div><div class=messageMessageListwrapper>${messages}</div></div>`);
    const result = await page.evaluate(scrollConversationListDOM);
    const positions = await page.evaluate(() => ({
      conversations: document.querySelector(".conversationConversationListwrapper").scrollTop,
      messages: document.querySelector(".messageMessageListwrapper").scrollTop,
    }));
    assert.equal(result.target_found, true);
    assert.equal(result.selector, ".conversationConversationListwrapper");
    assert.equal(result.selector_match_count, 1);
    assert.ok(positions.conversations > 0);
    assert.equal(positions.messages, 0);
  } finally {
    await browser.close();
  }
});

test("conversation scrolling never falls back to a generic scrollable ancestor", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const rows = Array.from({ length: 30 }, (_, index) => `<div class="conversationConversationItemwrapper" data-index="${index}">row</div>`).join("");
    await page.setContent(`<style>
      .generic-scrollable { height: 120px; overflow-y: auto; width: 240px; }
      .conversationConversationItemwrapper { height: 32px; }
    </style><div class=generic-scrollable>${rows}</div>`);
    const result = await page.evaluate(scrollConversationListDOM);
    const scrollTop = await page.locator(".generic-scrollable").evaluate((node) => node.scrollTop);
    assert.equal(result.target_found, false);
    assert.equal(result.reason, "conversation_list_selector_not_found");
    assert.equal(scrollTop, 0);
  } finally {
    await browser.close();
  }
});

test("conversation scrolling does not require virtual rows to expose data-index", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const rows = Array.from({ length: 30 }, () => "<div class=conversationConversationItemwrapper>row</div>").join("");
    await page.setContent(`<style>
      .conversationConversationListwrapper { height: 120px; overflow-y: auto; width: 240px; }
      .conversationConversationItemwrapper { height: 32px; }
    </style><div class=conversationConversationListwrapper>${rows}</div>`);
    const result = await page.evaluate(scrollConversationListDOM);
    const scrollTop = await page.locator(".conversationConversationListwrapper").evaluate((node) => node.scrollTop);
    assert.equal(result.target_found, true);
    assert.equal(result.anchor_count, 0);
    assert.ok(scrollTop > 0);
  } finally {
    await browser.close();
  }
});

test("conversation row clicks stay inside the conversation list when chat messages reuse data-index", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    await page.setContent(`
      <div class="conversationConversationListwrapper">
        <div data-index="21" onclick="window.clickedConversation = true">conversation</div>
      </div>
      <div class="messageMessageListwrapper">
        <div data-index="21" onclick="window.clickedMessage = true">message</div>
      </div>
    `);
    const clicked = await clickConversationListRowByIndex(page, 21);
    const state = await page.evaluate(() => ({
      conversation: window.clickedConversation === true,
      message: window.clickedMessage === true,
    }));
    assert.equal(clicked, true);
    assert.equal(state.conversation, true);
    assert.equal(state.message, false);
  } finally {
    await browser.close();
  }
});

test("conversation streak parsing prefers an unambiguous interface value", () => {
  assert.equal(parseConversationStreakText("🔥 81 天"), 81);
  assert.equal(parseConversationStreakText("暂无火花"), null);
  assert.deepEqual(collectJSONStreakCandidates({ data: { streak_days: 12, unrelated_days: 99 } }), [12]);
  assert.deepEqual(selectConversationStreakDays([12], 8), { days: 12, source: "interface" });
  assert.deepEqual(selectConversationStreakDays([12, 13], 8), { days: 8, source: "dom" });
  assert.deepEqual(selectConversationStreakDays([], null), { days: null, source: "missing" });
});

test("conversation streak DOM fallback stays inside the indexed conversation row", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    await page.setContent(`
      <div class="conversationConversationListwrapper">
        <div data-index="21"><div class="conversationConversationItemwrapper"><span class="commonStreaknormalText">🔥 27 天</span></div></div>
      </div>
      <div class="messageMessageListwrapper">
        <div data-index="21"><span class="commonStreaknormalText">🔥 999 天</span></div>
      </div>
    `);
    assert.equal(await readConversationListStreakDays(page, 21), 27);
  } finally {
    await browser.close();
  }
});
