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
  applyConversationHydrationCache,
  collectorItemsAfterSequence,
  conversationInventoryIdentityCount,
  conversationVerificationNeedsRescan,
  conversationRowHydrationKey,
  filterConversationRows,
  filterStrangerConversationInventory,
  finalizeConversationInventory,
  identityRecordsMatchDisplayName,
  identityRecordsMatchPeer,
  isMutualFriendRelationship,
  mergeConversationInventoryCandidate,
  missingConversationInventoryIndexes,
  selectConversationHydrationBatch,
  selectClickedConversationIdentity,
  selectClickedConversationIdentityFromSources,
  shouldRejectConversationInventoryReplacement,
} from "../conversation-utils.mjs";
import { scrollConversationListDOM } from "../conversation-scroll.mjs";
import { clickConversationListRowByIndex } from "../conversation-click.mjs";
import { CHAT_URL, waitForConversationList } from "../conversation-route.mjs";
import {
  classifyConversationStreakIconSource,
  collectJSONStreakCandidates,
  parseConversationStreakText,
  readConversationListStreakDays,
  readConversationListStreakSnapshot,
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

test("stranger endpoint identities are excluded from the final conversation inventory", () => {
  const entries = [
    ["index:1", { platform_conversation_id: "0:1:normal", peer_display_name: "正常会话" }],
    ["index:2", { platform_conversation_id: "0:1:taylor", peer_display_name: "Taylor Swift" }],
    ["index:3", { platform_conversation_id: "0:1:mimi", peer_display_name: "米米" }],
    ["index:4", { platform_conversation_id: "0:1:toy", peer_display_name: "玩具车" }],
  ];
  const result = filterStrangerConversationInventory(entries, new Set([
    "0:1:taylor",
    "0:1:mimi",
    "0:1:toy",
  ]));

  assert.deepEqual(result.kept.map(([, row]) => row.peer_display_name), ["正常会话"]);
  assert.deepEqual(result.filtered.map(([, row]) => row.peer_display_name), [
    "Taylor Swift",
    "米米",
    "玩具车",
  ]);
});

test("profile-scene relationship status distinguishes mutual friends from strangers", () => {
  assert.equal(isMutualFriendRelationship({ follow_status: "2", follower_status: "1" }), true);
  assert.equal(isMutualFriendRelationship({ follow_status: "0", follower_status: "0" }), false);
  assert.equal(isMutualFriendRelationship({ follow_status: "1", follower_status: "0" }), false);
  assert.equal(isMutualFriendRelationship({}), null);
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

test("a transient virtual-list overlap cannot replace a different stable indexed conversation", () => {
  const first = {
    platform_conversation_id: "0:1:first",
    peer_platform_user_id: "first-peer",
    peer_display_name: "第一个会话",
    conversation_type: "direct",
  };
  const second = {
    platform_conversation_id: "0:1:second",
    peer_platform_user_id: "second-peer",
    peer_display_name: "第二个会话",
    conversation_type: "direct",
  };
  const seen = new Map([
    ["index:23", first],
    ["index:24", second],
  ]);

  assert.equal(
    shouldRejectConversationInventoryReplacement(seen, "index:24", second, first),
    true,
  );
  assert.equal(
    shouldRejectConversationInventoryReplacement(seen, "index:24", second, {
      ...second,
      peer_display_name: "第二个会话（更新）",
    }),
    false,
  );
});

test("verification compares unique stable identities instead of virtual hydration keys", () => {
  const first = {
    platform_conversation_id: "0:1:first",
    peer_platform_user_id: "first-peer",
    conversation_type: "direct",
  };
  const second = {
    platform_conversation_id: "0:1:second",
    peer_platform_user_id: "second-peer",
    conversation_type: "direct",
  };
  assert.equal(conversationInventoryIdentityCount([first, { ...first }, second]), 2);
  assert.equal(conversationVerificationNeedsRescan(2, 2, false), false);
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

test("group click identity prefers the conversation shared by group interface responses", () => {
  assert.deepEqual(selectClickedConversationIdentityFromSources(
    "stale-dom-id",
    ["0:1:participant", "0:2:group"],
    ["0:2:group", "0:1:other-participant"],
  ), {
    conversationID: "0:2:group",
    conversationType: "group",
    authoritative: true,
  });
  assert.deepEqual(selectClickedConversationIdentityFromSources(
    "stale-dom-id",
    ["0:1:direct"],
    [],
  ), {
    conversationID: "0:1:direct",
    conversationType: "direct",
    authoritative: true,
  });
});

test("verified conversation identity stays attached to its DOM data-index across virtual-list recycling", () => {
  const cache = new Map([
    ["title:枫糖松饼", {
      platform_conversation_id: "0:1:maple",
      peer_platform_user_id: "peer-maple",
      peer_display_name: "枫糖松饼",
      streak_days: 0,
    }],
    ["title:另一个会话名称", {
      platform_conversation_id: "0:1:other",
      peer_platform_user_id: "peer-other",
      peer_display_name: "另一个会话名称",
      streak_days: 0,
    }],
  ]);
  const recycled = applyConversationHydrationCache([
    {
      data_index: "44",
      platform_conversation_id: "stale-react-id",
      peer_platform_user_id: "peer-maple",
      peer_display_name: "枫糖松饼",
    },
    {
      data_index: "46",
      platform_conversation_id: "0:1:maple",
      peer_platform_user_id: "peer-maple",
      peer_display_name: "另一个会话名称",
    },
  ], cache);

  assert.deepEqual(recycled.map((row) => ({
    data_index: row.data_index,
    platform_conversation_id: row.platform_conversation_id,
    peer_platform_user_id: row.peer_platform_user_id,
    peer_display_name: row.peer_display_name,
    streak_days: row.streak_days,
  })), [
    {
      data_index: "44",
      platform_conversation_id: "0:1:maple",
      peer_platform_user_id: "peer-maple",
      peer_display_name: "枫糖松饼",
      streak_days: 0,
    },
    {
      data_index: "46",
      platform_conversation_id: "0:1:other",
      peer_platform_user_id: "peer-other",
      peer_display_name: "另一个会话名称",
      streak_days: 0,
    },
  ]);

  const reordered = applyConversationHydrationCache([{
    data_index: "44",
    platform_conversation_id: "new-raw-id",
    peer_platform_user_id: "new-peer",
    peer_display_name: "列表重排后的会话",
  }], cache);
  assert.equal(reordered[0].platform_conversation_id, "new-raw-id");
  assert.equal(reordered[0].peer_platform_user_id, "new-peer");
});

test("a virtual-list DOM snapshot hydrates at most one conversation before it is read again", () => {
  const rows = [
    { data_index: "0", peer_display_name: "原神不牛逼" },
    { data_index: "1", peer_display_name: "枫糖松饼" },
    { data_index: "2", peer_display_name: "拾叁啊" },
  ];
  assert.deepEqual(
    selectConversationHydrationBatch(rows, new Set()).map((row) => row.peer_display_name),
    ["原神不牛逼"],
  );
  assert.deepEqual(
    selectConversationHydrationBatch(rows, new Set(["title:原神不牛逼"])).map((row) => row.peer_display_name),
    ["枫糖松饼"],
  );
  assert.deepEqual(
    selectConversationHydrationBatch(rows, new Set(), new Set(["title:原神不牛逼", "title:枫糖松饼"]))
      .map((row) => row.peer_display_name),
    ["拾叁啊"],
  );
});

test("a named conversation keeps one hydration identity when the virtual list reorders", () => {
  assert.equal(
    conversationRowHydrationKey({ data_index: "2", peer_display_name: "枫糖松饼" }),
    conversationRowHydrationKey({ data_index: "41", peer_display_name: "枫糖松饼" }),
  );
});

test("conversation completeness follows observed DOM slots instead of inventing contiguous indexes", () => {
  assert.deepEqual(
    missingConversationInventoryIndexes(new Set([0, 2, 3]), new Set(["index:0", "index:2", "index:3"])),
    [],
  );
  assert.deepEqual(
    missingConversationInventoryIndexes(new Set([0, 2, 3]), new Set(["index:0", "index:3"])),
    [2],
  );
});

test("a lazy verification pass cannot commit fewer rows than were already hydrated", () => {
  assert.equal(conversationVerificationNeedsRescan(44, 51, false), true);
  assert.equal(conversationVerificationNeedsRescan(51, 51, false), false);
  assert.equal(conversationVerificationNeedsRescan(51, 51, true), true);
});

test("clicked response identity must match the DOM conversation name", () => {
  const records = [{
    identity: { conversation_id: "0:1:maple", sec_uid: "peer-maple" },
    labels: { nickname: "枫糖松饼" },
  }];
  assert.equal(identityRecordsMatchDisplayName(records, "枫糖松饼"), true);
  assert.equal(identityRecordsMatchDisplayName(records, "另一个会话名称"), false);
  assert.equal(identityRecordsMatchPeer(records, "peer-maple"), true);
  assert.equal(identityRecordsMatchPeer(records, "peer-other"), false);
});

test("conversation extraction uses the direct popup chat route and waits for the exact virtual list", async () => {
  assert.equal(CHAT_URL, "https://www.douyin.com/chat?isPopup=1");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<div class='messageMessageListwrapper'></div><div hidden class='conversationConversationListwrapper'>responsive duplicate</div>");
    await page.evaluate(() => {
      setTimeout(() => {
        const list = document.createElement("div");
        list.className = "conversationConversationListwrapper";
        list.style.height = "120px";
        list.textContent = "conversation list";
        document.body.append(list);
      }, 30);
    });
    assert.equal(await waitForConversationList(page, 1000), true);
  } finally {
    await browser.close();
  }
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

test("conversation list can be reset to the top for a stable second DOM pass", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const rows = Array.from({ length: 30 }, (_, index) => `<div class="conversationConversationItemwrapper" data-index="${index}" style="height:32px">row</div>`).join("");
    await page.setContent(`<div class="conversationConversationListwrapper" style="height:120px;overflow-y:auto">${rows}</div>`);
    await page.locator(".conversationConversationListwrapper").evaluate((node) => { node.scrollTop = 500; });
    const result = await page.evaluate(scrollConversationListDOM, "top");
    const scrollTop = await page.locator(".conversationConversationListwrapper").evaluate((node) => node.scrollTop);
    assert.equal(result.target_found, true);
    assert.equal(result.reason, "exact_conversation_list_reset");
    assert.equal(scrollTop, 0);
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

test("a clipped virtual conversation row is scrolled fully into the list before clicking", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const rows = Array.from({ length: 8 }, (_, index) => (
      `<div data-index="${index}" style="height:40px" onclick="window.clickedIndex=${index}">row ${index}</div>`
    )).join("");
    await page.setContent(`
      <div class="conversationConversationListwrapper" style="height:100px;overflow-y:auto">${rows}</div>
    `);
    await page.locator(".conversationConversationListwrapper").evaluate((node) => { node.scrollTop = 180; });
    const clicked = await clickConversationListRowByIndex(page, 7);
    const state = await page.evaluate(() => ({
      clickedIndex: window.clickedIndex,
      scrollTop: document.querySelector(".conversationConversationListwrapper").scrollTop,
    }));
    assert.equal(clicked, true);
    assert.equal(state.clickedIndex, 7);
    assert.ok(state.scrollTop >= 220);
  } finally {
    await browser.close();
  }
});

test("conversation streak parsing prefers an unambiguous interface value", () => {
  assert.equal(parseConversationStreakText("🔥 81 天"), 81);
  assert.equal(parseConversationStreakText("暂无火花"), null);
  assert.deepEqual(collectJSONStreakCandidates({ data: { streak_days: 12, unrelated_days: 99 } }), [12]);
  assert.deepEqual(selectConversationStreakDays([12], 8), { days: 8, source: "dom" });
  assert.deepEqual(selectConversationStreakDays([12, 13], 8), { days: 8, source: "dom" });
  assert.deepEqual(selectConversationStreakDays([], null), { days: null, source: "missing" });
});

test("conversation streak icons distinguish today's activation state", () => {
  assert.deepEqual(
    classifyConversationStreakIconSource("https://p.example/flame_icon/normal/gray_normal.png"),
    { activatedToday: false, kind: "gray" },
  );
  assert.deepEqual(
    classifyConversationStreakIconSource("https://p.example/flame_icon/couple/normal_couple.png"),
    { activatedToday: true, kind: "couple" },
  );
  assert.deepEqual(
    classifyConversationStreakIconSource("https://p.example/flame_icon/normal/normal_normal.png"),
    { activatedToday: true, kind: "normal" },
  );
  assert.deepEqual(classifyConversationStreakIconSource(""), { activatedToday: null, kind: "missing" });
});

test("conversation streak parsing rejects an interface candidate that is not scoped to the clicked conversation", () => {
  assert.deepEqual(
    selectConversationStreakDays([1], null, { interfaceScoped: false }),
    { days: null, source: "missing" },
  );
  assert.deepEqual(
    selectConversationStreakDays([1], 27, { interfaceScoped: false }),
    { days: 27, source: "dom" },
  );
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
    assert.equal(await readConversationListStreakDays(page, 22), null);
  } finally {
    await browser.close();
  }
});

test("conversation streak snapshot filters strangers and reads the icon from the same indexed row", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    await page.setContent(`
      <div class="conversationConversationListwrapper">
        <div data-index="10"><div class="conversationStrangerBoxwrapper"><span class="commonStreaknormalText">999 天</span></div></div>
        <div data-index="11"><div class="conversationConversationItemwrapper">
          <span class="commonStreaknormalText">372 天</span>
          <img class="commonStreakicon" src="https://p.example/flame_icon/couple/normal_couple.png">
        </div></div>
        <div data-index="12"><div class="conversationConversationItemwrapper">
          <span class="commonStreaknormalText">8 天</span>
          <img class="commonStreakicon" src="https://p.example/flame_icon/normal/gray_normal.png">
        </div></div>
      </div>
    `);
    assert.equal(await readConversationListStreakSnapshot(page, 10), null);
    assert.deepEqual(await readConversationListStreakSnapshot(page, 11), {
      days: 372,
      activated_today: true,
      icon_kind: "couple",
    });
    assert.deepEqual(await readConversationListStreakSnapshot(page, 12), {
      days: 8,
      activated_today: false,
      icon_kind: "gray",
    });
  } finally {
    await browser.close();
  }
});

test("a visible DOM conversation without a streak badge is an explicit zero", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    await page.setContent(`
      <div class="conversationConversationListwrapper">
        <div data-index="44"><div class="conversationConversationItemwrapper"><span class="conversationConversationItemtitle">枫糖松饼</span></div></div>
      </div>
    `);
    assert.equal(await readConversationListStreakDays(page, 44), 0);
  } finally {
    await browser.close();
  }
});
