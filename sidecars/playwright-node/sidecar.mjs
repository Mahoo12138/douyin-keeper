#!/usr/bin/env node

/**
 * Node.js Playwright sidecar.
 *
 * Go remains the control plane and source of truth. This process owns only
 * browser contexts, platform operations, and the v1 NDJSON protocol.
 */

import { chmod, mkdir, readFile } from "node:fs/promises";
import { createWriteStream, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, isAbsolute } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { isAuthenticatedPage } from "./auth-state.mjs";
import { qrLoginState, smsLoginRequiresFreshContext, smsLoginSurfaceState } from "./login-state.mjs";
import { fillSMSCodeInput, findSMSCodePage, isQRIdentitySMSVisible, latestLoginPage, prepareQRIdentitySMS } from "./identity-sms.mjs";
import { decodeProtobuf, summarizeProtobuf } from "./conversation-wire.mjs";
import {
  canonicalConversationComponentKey,
  isConversationComponentKey,
  selectGetInfoConversationForComponentKey,
} from "./conversation-get-info.mjs";
import {
  applyConversationHydrationCache,
  collectorItemsAfterSequence,
  conversationInventoryIdentityCount,
  conversationVerificationNeedsRescan,
  conversationRowHydrationKey,
  conversationRowInventoryKey,
  directConversationUIDFromComponentKey,
  filterConversationRows,
  filterSelfConversationInventory,
  filterStrangerConversationInventory,
  finalizeConversationInventory,
  identityRecordsMatchDisplayName,
  identityRecordsMatchPeer,
  mergeConversationInventoryCandidate,
  missingConversationInventoryIndexes,
  recordDirectConversationValidation,
  selectConversationHydrationBatch,
  resolveDirectConversationPeer,
  selectProfileSceneRelationshipForUID,
  shouldRejectConversationInventoryReplacement,
} from "./conversation-utils.mjs";
import { scrollConversationListDOM } from "./conversation-scroll.mjs";
import { clickConversationListRowByIdentity, clickConversationListRowByIndex, describeConversationListRowByIndex } from "./conversation-click.mjs";
import { CHAT_URL, waitForConversationList } from "./conversation-route.mjs";
import { sendTextAndConfirm } from "./message-send.mjs";
import {
  collectJSONStreakCandidates,
  parseConversationStreakText,
  readConversationListStreakSnapshot,
  selectConversationStreakDays,
} from "./conversation-streak.mjs";

const PROTOCOL_VERSION = 1;
const ADAPTER = "browser.consumer";
const ADAPTER_VERSION = "node-0.2.0";
const HOME_URL = "https://www.douyin.com/";
const SELF_URL = "https://www.douyin.com/user/self";
const SESSION_COOKIE_NAMES = new Set(["sessionid", "sessionid_ss", "sid_tt"]);
const CHALLENGE_TEXTS = ["安全验证", "滑动验证", "人机验证", "身份验证"];
const LOGIN_BUTTONS = [
  "button.semi-button-primary:has-text('登录')",
  ".header-ui button:has-text('登录')",
  "header button:has-text('登录')",
  "nav button:has-text('登录')",
  "div[role='button']:has-text('登录')",
  "button:has-text('登录')",
];
const QR_SELECTORS = [
  "#animate_qrcode_container img, #animate_qrcode_container canvas",
  "#douyin_login_comp_scan_code img, #douyin_login_comp_scan_code canvas",
  "img[class*='qrcode' i], img[id*='qrcode' i], canvas[class*='qrcode' i], canvas[id*='qrcode' i]",
  "img[src^='data:image/png;base64']",
];
const SMS_PHONE_SELECTORS = [
  "input[placeholder*='手机号']",
  "input[placeholder*='手机']",
  "input[name='mobile']",
  "input[name='phone']",
  "input[inputmode='tel']",
  "input[type='tel']",
];
const SMS_CODE_SELECTORS = [
  "input[autocomplete='one-time-code']",
  "input[placeholder*='验证码']",
  "input[name='code']",
  "input[name='sms_code']",
  "input[inputmode='numeric']",
];
const loginSessions = new Map();
const identityRecordsByContext = new WeakMap();
const DEBUG_LOG_ENABLED = ["1", "true", "yes", "on"].includes(String(process.env.PLAYWRIGHT_SIDECAR_DEBUG ?? "").toLowerCase());
const DEBUG_LOG_EVENTS = new Set(String(process.env.PLAYWRIGHT_SIDECAR_DEBUG_EVENTS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
const DEBUG_LOG_FILE = String(process.env.PLAYWRIGHT_SIDECAR_LOG_FILE ?? "").trim();
const STREAK_SOURCE_PROBE = ["1", "true", "yes", "on"].includes(String(process.env.PLAYWRIGHT_STREAK_SOURCE_PROBE ?? "").toLowerCase());
let DEBUG_LOG_STREAM = null;
if (DEBUG_LOG_ENABLED && DEBUG_LOG_FILE) {
  try {
    mkdirSync(dirname(DEBUG_LOG_FILE), { recursive: true, mode: 0o700 });
    DEBUG_LOG_STREAM = createWriteStream(DEBUG_LOG_FILE, { flags: "a", mode: 0o600 });
    DEBUG_LOG_STREAM.on("error", (error) => {
      console.error(JSON.stringify({
        time: new Date().toISOString(),
        level: "ERROR",
        component: "playwright-sidecar",
        event: "debug_log_file_error",
        error_code: String(error?.code || ""),
        error_name: String(error?.name || "Error"),
      }));
    });
    void chmod(DEBUG_LOG_FILE, 0o600).catch(() => {});
  } catch (error) {
    console.error(JSON.stringify({
      time: new Date().toISOString(),
      level: "ERROR",
      component: "playwright-sidecar",
      event: "debug_log_file_open_failed",
      error_code: String(error?.code || ""),
      error_name: String(error?.name || "Error"),
    }));
  }
}

function safeURL(target) {
  try {
    const rawURL = typeof target?.url === "function" ? target.url() : target?.url;
    const url = new URL(rawURL);
    if (url.origin === "null") return url.href;
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

function debugLog(event, fields = {}) {
  if (!DEBUG_LOG_ENABLED || (DEBUG_LOG_EVENTS.size && !DEBUG_LOG_EVENTS.has(event))) return;
  const entry = { time: new Date().toISOString(), level: "DEBUG", component: "playwright-sidecar", event, ...fields };
  const line = JSON.stringify(entry);
  console.error(line);
  DEBUG_LOG_STREAM?.write(`${line}\n`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function textHash(value) {
  return sha256(Buffer.from(String(value || ""), "utf8"));
}

function nowMs() {
  return Date.now();
}

function headless() {
  return ["1", "true", "yes", "on"].includes(
    String(process.env.PLAYWRIGHT_HEADLESS ?? "0").toLowerCase(),
  );
}

function protocolError(code, message, retryable = false, detail) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  error.detail = detail;
  return error;
}

function success(request, result, started) {
  return {
    protocol_version: PROTOCOL_VERSION,
    request_id: request.request_id,
    ok: true,
    result,
    meta: { adapter: ADAPTER, adapter_version: ADAPTER_VERSION, duration_ms: nowMs() - started },
  };
}

function failure(request, error, started) {
  return {
    protocol_version: PROTOCOL_VERSION,
    request_id: request?.request_id || "invalid-request",
    ok: false,
    error: {
      code: error.code || "SIDECAR_INTERNAL_ERROR",
      retryable: Boolean(error.retryable),
      message: error.code ? error.message : "internal error",
      ...(error.detail && typeof error.detail === "object" ? { detail: error.detail } : {}),
    },
    meta: { adapter: ADAPTER, adapter_version: ADAPTER_VERSION, duration_ms: nowMs() - started },
  };
}

function parseRequest(line) {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    throw protocolError("INVALID_REQUEST", "invalid JSON");
  }
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw protocolError("INVALID_REQUEST", "request must be an object");
  }
  const allowed = new Set(["protocol_version", "request_id", "op", "deadline_ms", "input"]);
  if (Object.keys(request).some((key) => !allowed.has(key))) {
    throw protocolError("INVALID_REQUEST", "request contains unknown fields");
  }
  if (request.protocol_version !== PROTOCOL_VERSION) {
    throw protocolError("UNSUPPORTED_PROTOCOL_VERSION", "unsupported protocol version");
  }
  if (typeof request.request_id !== "string" || !request.request_id) {
    throw protocolError("INVALID_REQUEST", "request_id is required");
  }
  if (typeof request.op !== "string" || !request.op) {
    throw protocolError("INVALID_REQUEST", "op is required");
  }
  if (!Number.isInteger(request.deadline_ms) || request.deadline_ms < 1000 || request.deadline_ms > 300000) {
    throw protocolError("INVALID_REQUEST", "deadline_ms must be between 1000 and 300000");
  }
  if (!request.input || typeof request.input !== "object" || Array.isArray(request.input)) {
    throw protocolError("INVALID_REQUEST", "input must be an object");
  }
  return request;
}

async function privateDirectory(directory) {
  if (!isAbsolute(directory) || ["/", "/tmp", "/run"].includes(directory)) {
    throw protocolError("INVALID_REQUEST", "profile_dir must be a private absolute path");
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  return directory;
}

function profileDirectory(input) {
  const directory = input?.profile_dir;
  if (typeof directory !== "string" || !directory) {
    throw protocolError("INVALID_REQUEST", "profile_dir is required");
  }
  return privateDirectory(directory);
}

function sessionInput(input) {
  const session = input?.session;
  if (!session || session.kind !== "playwright_storage_state_file" || typeof session.path !== "string" || !session.path) {
    throw protocolError("INVALID_REQUEST", "session must reference a storage state file");
  }
  if (session.profile_dir !== undefined && (typeof session.profile_dir !== "string" || !isAbsolute(session.profile_dir))) {
    throw protocolError("INVALID_REQUEST", "session.profile_dir must be an absolute path");
  }
  return session;
}

async function sessionState(path) {
  try {
    const raw = await readFile(path, "utf8");
    const state = JSON.parse(raw);
    if (!state || !Array.isArray(state.cookies)) throw new Error("invalid state");
    return state;
  } catch {
    throw protocolError("SESSION_EXPIRED", "session state cannot be read");
  }
}

function hasSessionCookie(cookies) {
  return (cookies || []).some((cookie) =>
    cookie && SESSION_COOKIE_NAMES.has(cookie.name) && String(cookie.value || "").trim(),
  );
}

async function seedProfile(context, statePath) {
  if (!statePath) return;
  const state = await sessionState(statePath);
  // The encrypted DB session is authoritative. A persistent profile may hold
  // an older/invalid cookie, so only seeding when the profile is empty would
  // reproduce the exact false-authentication failure this adapter must avoid.
  await context.clearCookies();
  if (state.cookies.length) await context.addCookies(state.cookies);
}

async function launchProfile(directory, statePath) {
  const profile = await privateDirectory(directory);
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH?.trim() || undefined;
  debugLog("browser_launch_start", { headless: headless(), executable_configured: Boolean(executablePath) });
  const context = await chromium.launchPersistentContext(profile, {
    headless: headless(),
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    viewport: { width: 1280, height: 720 },
  });
  attachIdentityResponseCollector(context);
  try {
    await seedProfile(context, statePath);
  } catch (error) {
    await context.close();
    throw error;
  }
  const page = context.pages()[0] || await context.newPage();
  debugLog("browser_launch_ready", { pages: context.pages().length, url: safeURL(page) });
  return { context, page };
}

async function sessionCookies(page) {
  return page.context().cookies();
}

async function challengeVisible(page) {
  try {
    const title = await page.title();
    if (["验证码中间页", "安全验证", "人机验证"].some((text) => title.includes(text))) return true;
    const body = await page.locator("body").innerText({ timeout: 1500 });
    return CHALLENGE_TEXTS.some((text) => body.includes(text));
  } catch {
    return false;
  }
}

async function clickLogin(page) {
  for (const frame of page.frames()) {
    for (const selector of LOGIN_BUTTONS) {
      try {
        const locator = frame.locator(selector);
        const count = Math.min(await locator.count(), 4);
        for (let index = 0; index < count; index += 1) {
          const candidate = locator.nth(index);
          if (await candidate.isVisible()) {
            await candidate.click({ timeout: 5000 });
            return true;
          }
        }
      } catch {
        // Selector drift is expected; try the next supported frame/shape.
      }
    }
  }
  return false;
}

async function qrData(page) {
  try {
    const value = await page.evaluate(() => {
      const selectors = [
        "#animate_qrcode_container img, #animate_qrcode_container canvas",
        "#douyin_login_comp_scan_code img, #douyin_login_comp_scan_code canvas",
        "img[class*='qrcode' i], img[id*='qrcode' i], canvas[class*='qrcode' i], canvas[id*='qrcode' i]",
        "img[src^='data:image/png;base64']",
      ];
      for (const [selectorIndex, selector] of selectors.entries()) {
        for (const [elementIndex, node] of [...document.querySelectorAll(selector)].entries()) {
          const rect = node.getBoundingClientRect();
          const width = Math.max(rect.width || 0, node.naturalWidth || 0, node.width || 0);
          const height = Math.max(rect.height || 0, node.naturalHeight || 0, node.height || 0);
          if (width < 100 || height < 100 || width / height < 0.75 || width / height > 1.33) continue;
          if (node.tagName === "CANVAS" && node.toDataURL) {
            try {
              const data = node.toDataURL("image/png");
              if (data.length > 200) return { value: data, source: `selector_${selectorIndex + 1}`, tag: "canvas", width, height, selectorIndex, elementIndex };
            } catch {}
          }
          const src = node.currentSrc || node.src || "";
          if (/^(?:data:image|https?:\/\/)/.test(src) && src.length > 30) return { value: src, source: `selector_${selectorIndex + 1}`, tag: "img", width, height, selectorIndex, elementIndex };
        }
      }
      return { value: "", source: "", tag: "", width: 0, height: 0 };
    });
    if (!value?.value || value.tag !== "img" || value.value.startsWith("data:image")) return value || { value: "", source: "", tag: "", width: 0, height: 0 };
    try {
      const locator = page.locator(QR_SELECTORS[value.selectorIndex]).nth(value.elementIndex);
      const screenshot = await locator.screenshot({ type: "png" });
      return { ...value, value: `data:image/png;base64,${screenshot.toString("base64")}`, source: `${value.source}_screenshot` };
    } catch {
      return { ...value, value: "" };
    }
  } catch {
    return { value: "", source: "", tag: "", width: 0, height: 0 };
  }
}

function collectIdentityResponseValue(value, records, depth = 0) {
  if (depth > 7 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 100)) collectIdentityResponseValue(item, records, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  const read = (keys) => keys.map((key) => String(value[key] ?? "").trim()).find(Boolean) || "";
  const platformUserID = read(["sec_uid", "secUid", "sec_user_id", "secUserId", "uid", "user_id", "userId"]);
  const nickname = read(["nickname", "nick_name", "username", "user_name", "unique_id", "uniqueId", "short_id", "shortId"]);
  if (platformUserID && nickname && platformUserID.length <= 256 && nickname.length <= 128) {
    if (!records.some((record) => record.platform_user_id === platformUserID && record.nickname === nickname)) {
      records.push({ platform_user_id: platformUserID, nickname });
    }
  }
  for (const child of Object.values(value)) collectIdentityResponseValue(child, records, depth + 1);
}

function attachIdentityResponseCollector(context) {
  const records = [];
  identityRecordsByContext.set(context, records);
  context.on("response", (response) => {
    let url = "";
    try { url = response.url().split("?", 1)[0]; } catch {}
    if (!/^https:\/\/www\.douyin\.com\//.test(url) || !/(?:\/user\/|\/profile\/|\/account\/|\/passport\/)/i.test(url)) return;
    void response.json().then((payload) => {
      collectIdentityResponseValue(payload, records);
      if (records.length > 500) records.splice(0, records.length - 500);
    }).catch(() => {});
  });
}

function responseIdentityFor(records, nickname) {
  const cleanNickname = cleanIdentity(nickname);
  if (!cleanNickname) return null;
  return records.find((record) => cleanIdentity(record.nickname) === cleanNickname) || null;
}

async function waitForQrOrChallenge(page) {
  let challenge = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const qr = await qrData(page);
    if (qr.value) {
      debugLog("qr_visible", { attempt: attempt + 1, qr_length: qr.value.length, qr_source: qr.source, qr_tag: qr.tag, qr_width: qr.width, qr_height: qr.height, url: safeURL(page) });
      return { qr: qr.value, challenge: false };
    }
    challenge ||= await challengeVisible(page);
    if (challenge) debugLog("platform_challenge_visible", { attempt: attempt + 1, url: safeURL(page) });
    await page.waitForTimeout(250);
  }
  debugLog("qr_wait_finished_without_qr", { challenge, url: safeURL(page) });
  return { qr: "", challenge };
}

function cleanIdentity(value) {
  const text = String(value || "").replace(/[\u200b\u200c\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim().replace(/^@+/, "");
  if (!text || text.length > 64 || new Set(["我的", "抖音", "登录", "登录 / 注册", "登录注册"]).has(text)) return "";
  if (["登录", "注册", "关注", "粉丝", "获赞", "作品", "喜欢", "收藏", "观看历史"].some((token) => text.includes(token))) return "";
  return text;
}

async function identity(page, { allowSelfFallback = true, allowCookieFallback = false } = {}) {
  let result = await readIdentity(page);
  let nickname = result.candidates.map((candidate) => cleanIdentity(candidate.text)).find(Boolean) || "";
  if ((!nickname || !result.platform_user_id) && allowSelfFallback) {
    try {
      await page.goto(SELF_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    } catch {}
    result = await readIdentity(page);
    nickname = result.candidates.map((candidate) => cleanIdentity(candidate.text)).find(Boolean) || "";
  }
  const avatar = /^https?:\/\//.test(result.avatar_url || "") ? result.avatar_url : null;
  const responseIdentity = responseIdentityFor(identityRecordsByContext.get(page.context()) || [], nickname);
  const cookies = await sessionCookies(page);
  const uid = cookies.find((cookie) => ["uid_tt", "uid_tt_ss", "sid_uid"].includes(cookie.name) && cookie.value)?.value || "";
  const platformUserID = String(result.platform_user_id || responseIdentity?.platform_user_id || (allowCookieFallback ? uid : "")).slice(0, 128);
  const identitySource = result.platform_user_id ? "page" : responseIdentity ? "response" : allowCookieFallback && uid ? "cookie_fallback" : "none";
  debugLog("identity_resolved", {
    platform_id_present: Boolean(platformUserID),
    platform_id_length: platformUserID.length,
    identity_source: identitySource,
    cookie_candidate_present: Boolean(uid),
    nickname_present: Boolean(nickname),
    avatar_present: Boolean(avatar),
    url: safeURL(page),
  });
  return { platform_user_id: platformUserID, nickname: nickname.slice(0, 64), avatar_url: avatar, identity_source: identitySource };
}

async function readIdentity(page) {
  try {
    return await page.evaluate(() => {
      const normalize = (value) => String(value || "").replace(/[\u200b\u200c\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim();
      const candidates = [];
      const platformIDs = [];
      const add = (value, source) => { const text = normalize(value); if (text) candidates.push({ text, source }); };
      const addPlatformID = (value, source) => {
        const text = normalize(value);
        if (text && text.length <= 256 && !platformIDs.some((item) => item.value === text)) platformIDs.push({ value: text, source });
      };
      const xpathText = (path) => {
        const node = document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        return node?.textContent || "";
      };
      add(document.querySelector('[data-e2e="user-title"]')?.innerText, "data-e2e=user-title");
      add(document.querySelector('[class*="userName"], [class*="UserName"], [class*="nickname"], [class*="Nickname"], h1')?.innerText, "profile-name-selector");
      add(document.title.split(/[｜|\-]/)[0], "document-title");
      add(document.querySelector('meta[property="og:title"]')?.content?.split(/[｜|\-]/)[0], "og:title");
      const selfLink = document.querySelector('a[href*="/user/self"]');
      if (selfLink) {
        const root = selfLink.closest("div")?.parentElement?.parentElement || selfLink;
        add(normalize(root.innerText).split(/关注|粉丝|获赞|我的喜欢|我的收藏|观看历史|稍后再看|我的作品|我的预约|我的订单|退出登录/)[0], "self-link-root");
      }
      const idAttributes = ["data-user-id", "data-uid", "data-userid", "data-sec-uid", "data-sec_uid", "data-secuid"];
      for (const node of document.querySelectorAll('[data-e2e="user-title"], [data-e2e="user-avatar"], [data-user-id], [data-uid], [data-userid], [data-sec-uid], [data-sec_uid], [data-secuid]')) {
        for (const attribute of idAttributes) addPlatformID(node.getAttribute(attribute), `dom:${attribute}`);
      }
      for (const anchor of document.querySelectorAll('[data-e2e="user-avatar"] a, [data-e2e="user-title"] a')) {
        const match = String(anchor.getAttribute("href") || "").match(/\/user\/([^/?#]+)/);
        if (match && match[1] !== "self") addPlatformID(match[1], "profile-link");
      }
      const labelKeys = ["nickname", "nick_name", "username", "user_name", "unique_id", "uniqueId", "short_id", "shortId"];
      const idKeys = ["sec_uid", "secUid", "sec_user_id", "secUserId", "uid", "user_id", "userId"];
      const walk = (value, depth = 0, label = "") => {
        if (depth > 7 || value === null || value === undefined) return;
        if (Array.isArray(value)) {
          for (const item of value.slice(0, 80)) walk(item, depth + 1, label);
          return;
        }
        if (typeof value !== "object") return;
        const labels = labelKeys.map((key) => normalize(value[key])).filter(Boolean);
        const ids = idKeys.map((key) => normalize(value[key])).filter(Boolean);
        if (ids.length && labels.some((item) => candidates.some((candidate) => candidate.text === item))) {
          for (const id of ids) addPlatformID(id, `embedded:${label || "object"}`);
        }
        for (const [key, child] of Object.entries(value)) walk(child, depth + 1, key);
      };
      for (const script of document.scripts) {
        const source = script.textContent || "";
        if (source.length > 2000000 || !/(sec[_A-Za-z]*uid|unique[_A-Za-z]*id|user[_A-Za-z]*id)/i.test(source)) continue;
        try { walk(JSON.parse(source)); } catch {}
      }
      const avatar = document.querySelector('[data-e2e="user-avatar"] img, [class*="avatar" i] img, meta[property="og:image"]');
      return { candidates, platform_user_id: platformIDs[0]?.value || "", platform_id_source: platformIDs[0]?.source || "", avatar_url: avatar?.content || avatar?.currentSrc || avatar?.src || "" };
    });
  } catch {
    return { candidates: [], platform_user_id: "", platform_id_source: "", avatar_url: "" };
  }
}

async function readWebLoginState(page) {
  try {
    const snapshot = await readAuthSnapshot(page);
    const result = await identity(page, { allowSelfFallback: false });
    return {
      authenticated: snapshot.hasProfileSignal && !snapshot.hasLoginSignal,
      identityReady: Boolean(result.platform_user_id && result.nickname),
      url: snapshot.url,
    };
  } catch {
    return { authenticated: false, identityReady: false, url: "" };
  }
}

async function exportState(context, exportPath) {
  if (typeof exportPath !== "string" || !isAbsolute(exportPath) || ["/", "/tmp", "/run"].includes(exportPath)) {
    throw protocolError("INVALID_REQUEST", "export_session_file must be a private absolute path");
  }
  await mkdir(dirname(exportPath), { recursive: true, mode: 0o700 });
  await context.storageState({ path: exportPath });
  await chmod(exportPath, 0o600);
  debugLog("session_state_exported", { path_configured: true });
}

async function startQr(input) {
  const startedAt = nowMs();
  const profile = await profileDirectory(input);
  const { context, page } = await launchProfile(profile);
  try {
    debugLog("qr_start_begin", { force_login: input?.force_login === true, url: safeURL(page) });
    if (input?.force_login === true) {
      await context.clearCookies();
      debugLog("qr_start_cookies_cleared");
    }
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    debugLog("qr_start_web_loaded", { url: safeURL(page), session_cookie: hasSessionCookie(await sessionCookies(page)) });
    if (input?.force_login === true || !(await hasSessionCookie(await sessionCookies(page)))) {
      const clicked = await clickLogin(page);
      debugLog("qr_start_login_clicked", { clicked, url: safeURL(page) });
    }
    const result = await waitForQrOrChallenge(page);
    if (!result.qr && !result.challenge) {
      await context.close();
      throw protocolError("QR_NOT_READY", "login QR code is not available", true);
    }
    const handle = `qr_${randomUUID().replaceAll("-", "")}`;
    const expiresAt = new Date(nowMs() + 180000).toISOString();
    loginSessions.set(handle, { context, page, profile, expiresAt, qrSeen: Boolean(result.qr), kind: "qr", identitySMSRequested: false });
    debugLog("qr_start_ready", { handle: handle.slice(0, 16), state: result.challenge ? "challenge_required" : "waiting", qr_available: Boolean(result.qr), elapsed_ms: nowMs() - startedAt, url: safeURL(page) });
    return {
      login_handle: handle,
      state: result.challenge ? "challenge_required" : "waiting",
      qr: { format: result.qr ? "data_url" : "none", value: result.qr, expires_at: expiresAt },
    };
  } catch (error) {
    debugLog("qr_start_failed", { code: error.code || "SIDECAR_INTERNAL_ERROR", message: error.code ? error.message : "internal error", elapsed_ms: nowMs() - startedAt, url: safeURL(page) });
    if (!loginSessions.values().some((item) => item.context === context)) await context.close().catch(() => {});
    throw error;
  }
}

async function pollQr(input) {
  const startedAt = nowMs();
  const handle = input?.login_handle;
  const item = loginSessions.get(handle);
  if (!item) {
    debugLog("qr_poll_handle_missing", { handle: String(handle || "").slice(0, 16) });
    throw protocolError("LOGIN_HANDLE_NOT_FOUND", "login handle is unavailable");
  }
  if (Date.now() >= Date.parse(item.expiresAt)) {
    debugLog("qr_poll_expired", { handle: String(handle).slice(0, 16) });
    loginSessions.delete(handle);
    await item.context.close().catch(() => {});
    throw protocolError("QR_EXPIRED", "login QR session expired");
  }
  const identitySMS = await prepareQRIdentitySMS(item, {
    allowClick: !item.identitySMSRequested,
    requestPending: item.identitySMSRequested === true,
  });
  if (identitySMS.page) item.page = identitySMS.page;
  if (identitySMS.clicked) item.identitySMSRequested = true;
  if (identitySMS.state === "sms_code_required") {
    if (!item.identitySMSExpiresExtended) {
      item.expiresAt = new Date(nowMs() + 300000).toISOString();
      item.identitySMSExpiresExtended = true;
    }
    debugLog("qr_poll_sms_code_required", { handle: String(handle).slice(0, 16), clicked: identitySMS.clicked, elapsed_ms: nowMs() - startedAt, url: safeURL(item.page) });
    return { state: "sms_code_required", expires_at: item.expiresAt };
  }
  if (identitySMS.state === "sms_request_pending") {
    debugLog("qr_poll_sms_request_pending", { handle: String(handle).slice(0, 16), clicked: identitySMS.clicked, action_text: identitySMS.actionText || "", elapsed_ms: nowMs() - startedAt, url: safeURL(item.page) });
    return { state: "scanned" };
  }
  if (identitySMS.state === "challenge_required" || await challengeVisible(item.page)) {
    debugLog("qr_poll_challenge_required", { handle: String(handle).slice(0, 16), elapsed_ms: nowMs() - startedAt, url: safeURL(item.page) });
    return { state: "challenge_required" };
  }
  const webState = await readWebLoginState(item.page);
  const cookies = await sessionCookies(item.page);
  const sessionCookie = hasSessionCookie(cookies);
  const qr = await qrData(item.page);
  if (qr.value) item.qrSeen = true;
  if (sessionCookie && (webState.authenticated || !qr.value)) {
    // Validate the newly established session on the public Douyin site before
    // accepting the scan. This prevents a stale QR shell or cookie-only state
    // from being reported as a successful login.
    try {
      await ensureAuthenticatedPage(item.page);
      const result = await identity(item.page, { allowSelfFallback: true, allowCookieFallback: false });
      if (result.platform_user_id && result.nickname) {
        if (input?.export_session_file) await exportState(item.context, input.export_session_file);
        loginSessions.delete(handle);
        await item.context.close().catch(() => {});
        debugLog("qr_poll_authenticated", { handle: String(handle).slice(0, 16), identity_source: result.identity_source, elapsed_ms: nowMs() - startedAt });
        return { state: "authenticated", identity: result, session_exported: Boolean(input?.export_session_file) };
      }
      debugLog("qr_poll_identity_incomplete", { handle: String(handle).slice(0, 16), platform_user_id: Boolean(result.platform_user_id), nickname: Boolean(result.nickname), identity_source: result.identity_source, url: safeURL(item.page) });
    } catch (error) {
      if (error.code === "CHALLENGE_REQUIRED") {
        debugLog("qr_poll_challenge_required", { handle: String(handle).slice(0, 16), phase: "session_validate", elapsed_ms: nowMs() - startedAt, url: safeURL(item.page) });
        return { state: "challenge_required" };
      }
      debugLog("qr_poll_session_not_ready", { handle: String(handle).slice(0, 16), error_code: error.code || "SIDECAR_INTERNAL_ERROR", elapsed_ms: nowMs() - startedAt, url: safeURL(item.page) });
    }
  }
  const state = qrLoginState({
    platformAuthenticated: webState.authenticated,
    identityReady: webState.identityReady,
    sessionCookie,
    qrSeen: item.qrSeen,
    qrVisible: Boolean(qr.value),
  });
  if (state === "authenticated") {
    const result = await identity(item.page, { allowSelfFallback: false, allowCookieFallback: false });
    if (!result.platform_user_id || !result.nickname) {
      debugLog("qr_poll_identity_incomplete", { handle: String(handle).slice(0, 16), platform_user_id: Boolean(result.platform_user_id), nickname: Boolean(result.nickname), url: safeURL(item.page) });
      return { state: "scanned" };
    }
    if (input?.export_session_file) await exportState(item.context, input.export_session_file);
    loginSessions.delete(handle);
    await item.context.close().catch(() => {});
    debugLog("qr_poll_authenticated", { handle: String(handle).slice(0, 16), elapsed_ms: nowMs() - startedAt });
    return { state: "authenticated", identity: result, session_exported: Boolean(input?.export_session_file) };
  }
  debugLog("qr_poll_state", {
    handle: String(handle).slice(0, 16),
    state,
    qr_visible: Boolean(qr.value),
    qr_source: qr.source,
    qr_tag: qr.tag,
    qr_width: qr.width,
    qr_height: qr.height,
    qr_seen: Boolean(item.qrSeen),
    platform_authenticated: Boolean(webState.authenticated),
    identity_ready: Boolean(webState.identityReady),
    session_cookie: sessionCookie,
    elapsed_ms: nowMs() - startedAt,
    url: safeURL(item.page),
  });
  return { state };
}

async function cancelLogin(input) {
  const item = loginSessions.get(input?.login_handle);
  if (item) {
    debugLog("qr_cancel", { handle: String(input.login_handle).slice(0, 16) });
    loginSessions.delete(input.login_handle);
    await item.context.close().catch(() => {});
  }
  return { state: "cancelled" };
}

async function clickText(page, values) {
  for (const value of values) {
    // Prefer exact text and the smallest visible match. A fuzzy locator can
    // resolve to the whole login card; clicking its center reports success
    // without activating the SMS submit control.
    for (const exact of [true, false]) {
      const locator = page.getByText(value, { exact });
      const candidates = [];
      const count = Math.min(await locator.count().catch(() => 0), 12);
      for (let index = 0; index < count; index += 1) {
        const item = locator.nth(index);
        if (!await item.isVisible().catch(() => false)) continue;
        const box = await item.boundingBox().catch(() => null);
        candidates.push({ item, area: box ? box.width * box.height : Number.MAX_SAFE_INTEGER });
      }
      candidates.sort((left, right) => left.area - right.area);
      for (const candidate of candidates) {
        try {
          await candidate.item.click({ timeout: 5000, force: true });
          return true;
        } catch {
          // A stale or covered element is not a successful click. Continue
          // with the next supported match instead of advancing the flow.
        }
      }
      if (exact) continue;
      break;
    }
  }
  return false;
}

async function clickTextInFrames(page, values) {
  for (const [frameIndex, frame] of page.frames().entries()) {
    if (await clickText(frame, values)) return { frameIndex };
  }
  return null;
}

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = Math.min(await locator.count().catch(() => 0), 4);
    for (let index = 0; index < count; index += 1) {
      const item = locator.nth(index);
      if (await item.isVisible().catch(() => false)) return item;
    }
  }
  return null;
}

async function firstVisibleInFrames(page, selectors) {
  for (const [frameIndex, frame] of page.frames().entries()) {
    const item = await firstVisible(frame, selectors);
    if (item) return { locator: item, frameIndex };
  }
  return null;
}

async function waitForVisible(page, selectors, timeoutMs = 10000) {
  const deadline = nowMs() + timeoutMs;
  while (nowMs() < deadline) {
    const item = await firstVisible(page, selectors);
    if (item) return item;
    await page.waitForTimeout(250);
  }
  return null;
}

async function waitForVisibleInFrames(page, selectors, timeoutMs = 10000) {
  const deadline = nowMs() + timeoutMs;
  while (nowMs() < deadline) {
    const item = await firstVisibleInFrames(page, selectors);
    if (item) return item;
    await page.waitForTimeout(250);
  }
  return null;
}

async function clickTextEventually(page, values, timeoutMs = 10000) {
  const deadline = nowMs() + timeoutMs;
  while (nowMs() < deadline) {
    if (await clickText(page, values)) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

async function clickTextInFramesEventually(page, values, timeoutMs = 10000) {
  const deadline = nowMs() + timeoutMs;
  while (nowMs() < deadline) {
    const result = await clickTextInFrames(page, values);
    if (result) return result;
    await page.waitForTimeout(250);
  }
  return null;
}

async function clickSmsSubmit(page, inputBox) {
  const input = inputBox.locator;
  // The public web page keeps a header "登录" button mounted while the SMS
  // dialog is open. Scope the click to the nearest dialog/form container that
  // contains the code input, otherwise a generic text locator can click the
  // header and leave the entered code untouched.
  const scopedRoot = input.locator("xpath=ancestor::div[.//*[normalize-space(text())='登录']][1]");
  const scopedLogin = scopedRoot.getByText("登录", { exact: true });
  const candidates = [];
  const count = Math.min(await scopedLogin.count().catch(() => 0), 8);
  for (let index = 0; index < count; index += 1) {
    const candidate = scopedLogin.nth(index);
    if (!await candidate.isVisible().catch(() => false)) continue;
    const box = await candidate.boundingBox().catch(() => null);
    candidates.push({ candidate, area: box ? box.width * box.height : Number.MAX_SAFE_INTEGER });
  }
  candidates.sort((left, right) => left.area - right.area);
  for (const item of candidates) {
    try {
      await item.candidate.click({ timeout: 5000 });
      debugLog("sms_verify_submit_target_clicked", { frame_index: inputBox.frameIndex, candidate_area: Math.round(item.area), scoped_candidates: candidates.length, url: safeURL(page) });
      return { frameIndex: inputBox.frameIndex, candidateArea: Math.round(item.area), scopedCandidates: candidates.length };
    } catch {}
  }
  debugLog("sms_verify_submit_target_missing", { frame_index: inputBox.frameIndex, scoped_candidates: candidates.length, url: safeURL(page) });
  return null;
}

async function loginSurfaceSummary(page) {
  const frames = [];
  for (const frame of page.frames()) {
    try {
      const value = await frame.evaluate(() => {
        const visible = (node) => {
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        };
        const inputs = [...document.querySelectorAll("input")].filter(visible);
        const buttons = [...document.querySelectorAll("button, [role='button']")].filter(visible);
        return {
          body_text: document.body?.innerText || "",
          input_count: inputs.length,
          input_types: inputs.map((node) => node.getAttribute("type") || "text").slice(0, 20),
          input_placeholders: inputs.map((node) => node.getAttribute("placeholder") || "").filter(Boolean).slice(0, 20),
          button_count: buttons.length,
          button_text: buttons.map((node) => node.innerText || node.getAttribute("aria-label") || "").join(" ").slice(0, 2000),
        };
      });
      frames.push({
        url: safeURL(frame),
        body_hash: textHash(value.body_text),
        body_chars: value.body_text.length,
        input_count: value.input_count,
        input_types: value.input_types,
        input_placeholders: value.input_placeholders,
        button_count: value.button_count,
        button_text_hash: textHash(value.button_text),
      });
    } catch {
      frames.push({ url: safeURL(frame), unreadable: true });
    }
  }
  return { frame_count: frames.length, frames };
}

async function logSmsStage(stage, page, fields = {}) {
  debugLog("sms_start_stage", {
    stage,
    url: safeURL(page),
    surface: await loginSurfaceSummary(page),
    ...fields,
  });
}

async function startSms(input) {
  if (typeof input?.phone !== "string" || input.phone.trim().length < 5 || input.phone.trim().length > 32) {
    throw protocolError("INVALID_REQUEST", "phone must be 5..32 characters");
  }
  const startedAt = nowMs();
  let stage = "request_validated";
  const profile = await profileDirectory(input);
  const { context, page } = await launchProfile(profile);
  try {
    await logSmsStage(stage, page, { force_login: input?.force_login === true });
    stage = "browser_ready";
    if (smsLoginRequiresFreshContext(input)) {
      await context.clearCookies();
      stage = "cookies_cleared";
      await logSmsStage(stage, page);
    }
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    stage = "web_loaded";
    await logSmsStage(stage, page);

    // Douyin web may open directly on the SMS tab. Requiring a generic
    // "登录" button first makes that valid state look like selector drift.
    let phone = await waitForVisibleInFrames(page, SMS_PHONE_SELECTORS, 3000);
    if (smsLoginSurfaceState({ phoneInputVisible: Boolean(phone) }) === "direct_form") {
      stage = "sms_form_ready_direct";
      await logSmsStage(stage, page, { frame_index: phone.frameIndex, selector_found: true });
    } else {
      stage = "sms_form_not_visible";
      await logSmsStage(stage, page, { selector_found: false });
      const loginClicked = await clickLogin(page);
      stage = "login_entry_attempted";
      await logSmsStage(stage, page, { clicked: loginClicked });
      const methodClicked = await clickTextInFramesEventually(page, ["短信登录", "验证码登录", "手机登录"], 15000);
      if (smsLoginSurfaceState({ loginButtonClicked: loginClicked, methodClicked: Boolean(methodClicked) }) === "unavailable") {
        throw protocolError("BROWSER_SELECTOR_CHANGED", "SMS login entry is unavailable");
      }
      stage = "sms_method_selected";
      await logSmsStage(stage, page, { frame_index: methodClicked?.frameIndex ?? null });
      phone = await waitForVisibleInFrames(page, SMS_PHONE_SELECTORS, 20000);
    }
    if (!phone) throw protocolError("BROWSER_SELECTOR_CHANGED", "SMS phone input is unavailable");
    stage = "phone_input_ready";
    await logSmsStage(stage, page, { frame_index: phone.frameIndex });
    await phone.locator.fill(input.phone.trim());
    stage = "phone_filled";
    await logSmsStage(stage, page, { frame_index: phone.frameIndex });
    const codeButton = await clickTextInFramesEventually(page, ["获取验证码", "发送验证码", "发送验证码登录"], 15000);
    if (!codeButton) throw protocolError("BROWSER_SELECTOR_CHANGED", "SMS code button is unavailable");
    stage = "code_requested";
    await logSmsStage(stage, page, { frame_index: codeButton.frameIndex });
    const handle = `sms_${randomUUID().replaceAll("-", "")}`;
    const expiresAt = new Date(nowMs() + 300000).toISOString();
    loginSessions.set(handle, { context, page, profile, expiresAt, kind: "sms" });
    stage = "waiting_for_code";
    await logSmsStage(stage, page, { handle: handle.slice(0, 16), elapsed_ms: nowMs() - startedAt });
    return { login_handle: handle, expires_at: expiresAt };
  } catch (error) {
    debugLog("sms_start_failed", {
      stage,
      code: error.code || "SIDECAR_INTERNAL_ERROR",
      message: error.code ? error.message : "internal error",
      elapsed_ms: nowMs() - startedAt,
      url: safeURL(page),
      surface: await loginSurfaceSummary(page),
      browser_cleanup: "context_close_after_no_login_handle",
    });
    await context.close().catch(() => {});
    throw error;
  }
}

async function verifySms(input) {
  const startedAt = nowMs();
  const handle = input?.login_handle;
  const code = typeof input?.code === "string" ? input.code.trim() : "";
  if (!/^\d{4,8}$/.test(code)) throw protocolError("INVALID_REQUEST", "code must be 4..8 digits");
  const item = loginSessions.get(handle);
  if (!item || (item.kind !== "sms" && item.kind !== "qr")) throw protocolError("LOGIN_HANDLE_NOT_FOUND", "login handle is unavailable");
  if (nowMs() >= Date.parse(item.expiresAt)) {
    loginSessions.delete(handle);
    await item.context.close().catch(() => {});
    throw protocolError("SMS_CODE_EXPIRED", "SMS verification session expired");
  }
  debugLog("sms_verify_begin", { handle: String(handle).slice(0, 16), elapsed_ms: nowMs() - startedAt, url: safeURL(item.page) });
  const inputBox = item.kind === "qr"
    ? await findSMSCodePage(item)
    : await firstVisibleInFrames(item.page, SMS_CODE_SELECTORS);
  if (!inputBox) throw protocolError("BROWSER_SELECTOR_CHANGED", "SMS code input is unavailable");
  if (inputBox.page) item.page = inputBox.page;
  debugLog("sms_verify_code_input_ready", { handle: String(handle).slice(0, 16), frame_index: inputBox.frameIndex, url: safeURL(item.page) });
  const inputShape = item.kind === "qr" ? await fillSMSCodeInput(inputBox, code) : (await inputBox.locator.fill(code), "single");
  debugLog("sms_verify_code_filled", { handle: String(handle).slice(0, 16), input_shape: inputShape, frame_index: inputBox.frameIndex, url: safeURL(item.page) });
  const submit = await clickSmsSubmit(item.page, inputBox) || await clickTextInFramesEventually(item.page, ["验证", "下一步", "确认", "完成", "确定", "提交"], 5000);
  debugLog("sms_verify_submit_clicked", { handle: String(handle).slice(0, 16), clicked: Boolean(submit), frame_index: submit?.frameIndex ?? null, elapsed_ms: nowMs() - startedAt, url: safeURL(item.page), surface: await loginSurfaceSummary(item.page) });
  if (!submit) throw protocolError("BROWSER_SELECTOR_CHANGED", "SMS submit button is unavailable");

  // The Douyin web response is asynchronous. Give the page time to
  // update its error text, challenge state, and session cookies before
  // returning a non-terminal state to the worker.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const activePage = latestLoginPage(item);
    if (activePage) item.page = activePage;
    if (await visibleText(item.page, ["验证码错误", "验证码不正确", "验证码无效", "验证码已失效", "验证码失效", "验证码过期", "请输入正确的验证码", "验证码有误"])) {
      if (item.kind === "qr") item.identitySMSRequested = false;
      debugLog("sms_verify_platform_rejected", { handle: String(handle).slice(0, 16), attempt: attempt + 1, elapsed_ms: nowMs() - startedAt, url: safeURL(item.page) });
      throw protocolError("SMS_CODE_INVALID", "SMS verification code is invalid");
    }
    const qrIdentitySMSVisible = item.kind === "qr" && await isQRIdentitySMSVisible(item);
    if (await challengeVisible(item.page) && !qrIdentitySMSVisible) {
      debugLog("sms_verify_challenge_required", { handle: String(handle).slice(0, 16), attempt: attempt + 1, elapsed_ms: nowMs() - startedAt, url: safeURL(item.page) });
      loginSessions.delete(handle);
      await item.context.close().catch(() => {});
      return { state: "challenge_required" };
    }
    if (hasSessionCookie(await sessionCookies(item.page))) break;
    await item.page.waitForTimeout(500).catch(() => {});
  }
  debugLog("sms_verify_platform_state", { handle: String(handle).slice(0, 16), session_cookie: hasSessionCookie(await sessionCookies(item.page)), elapsed_ms: nowMs() - startedAt, url: safeURL(item.page) });
  const qrIdentitySMSVisible = item.kind === "qr" && await isQRIdentitySMSVisible(item);
  if (await challengeVisible(item.page) && !qrIdentitySMSVisible) {
    loginSessions.delete(handle);
    await item.context.close().catch(() => {});
    return { state: "challenge_required" };
  }
  if (hasSessionCookie(await sessionCookies(item.page))) {
    // Capture the identity while the login dialog's page is still mounted.
    // Navigating to /user/self first can discard the stable profile metadata
    // and force a rotating cookie token to become the account identifier.
    let result = await identity(item.page, { allowSelfFallback: false });
    try {
      await ensureAuthenticatedPage(item.page);
    } catch (error) {
      if (error.code === "CHALLENGE_REQUIRED") return { state: "challenge_required" };
      throw error;
    }
    if (input.export_session_file) await exportState(item.context, input.export_session_file);
    if (!result.platform_user_id || !result.nickname) {
      const validatedIdentity = await identity(item.page);
      result = {
        platform_user_id: result.platform_user_id || validatedIdentity.platform_user_id,
        nickname: result.nickname || validatedIdentity.nickname,
        avatar_url: result.avatar_url || validatedIdentity.avatar_url,
        identity_source: result.identity_source === "none" ? validatedIdentity.identity_source : result.identity_source,
      };
    }
    loginSessions.delete(handle);
    await item.context.close().catch(() => {});
    return { state: "authenticated", identity: result, session_exported: Boolean(input.export_session_file) };
  }
  return { state: "waiting", session_exported: false };
}

async function validateSession(input) {
  const session = sessionInput(input);
  if (!session.profile_dir) {
    const state = await sessionState(session.path);
    if (!hasSessionCookie(state.cookies)) return { valid: false, state: "expired" };
  }
  const runtime = await launchSession(session);
  try {
    await ensureAuthenticatedPage(runtime.page);
    return { valid: true, state: "valid" };
  } finally {
    await runtime.context.close();
    if (runtime.browser) await runtime.browser.close().catch(() => {});
  }
}

async function launchSession(session) {
  if (session.profile_dir) return launchProfile(session.profile_dir, session.path);
  const state = await sessionState(session.path);
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH?.trim() || undefined;
  const browser = await chromium.launch({
    headless: headless(),
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({ storageState: state, locale: "zh-CN", timezoneId: "Asia/Shanghai", viewport: { width: 1280, height: 720 } });
  const page = context.pages()[0] || await context.newPage();
  return { browser, context, page };
}

async function withSession(input, operation) {
  const session = sessionInput(input);
  const runtime = await launchSession(session);
  try {
    await ensureAuthenticatedPage(runtime.page);
    return await operation(runtime.page, runtime.context);
  } finally {
    await runtime.context.close().catch(() => {});
    if (runtime.browser) await runtime.browser.close().catch(() => {});
  }
}

async function visibleText(page, values) {
  for (const frame of page.frames()) {
    try {
      const body = await frame.locator("body").innerText({ timeout: 1500 });
      if (values.some((value) => body.includes(value))) return true;
    } catch {
      // A detached challenge frame should not hide the main page state.
    }
  }
  return false;
}

async function readAuthSnapshot(page) {
  let url = "";
  try { url = page.url(); } catch {}
  try {
    const dom = await page.evaluate(() => {
      const visible = (node) => {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const text = (node) => (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
      const profileSelectors = [
        '[data-e2e="user-avatar"]',
        '[data-e2e="user-title"]',
        '[class*="avatar" i] img',
        '[class*="userName" i]',
      ];
      const hasProfileSignal = profileSelectors.some((selector) =>
        [...document.querySelectorAll(selector)].some(visible),
      ) || [...document.querySelectorAll("button, [role=button], a")].some((node) =>
        visible(node) && /退出登录/.test(text(node)),
      );
      const hasLoginSignal = [...document.querySelectorAll("button, [role=button], a, input")].some((node) =>
        visible(node) && /^(登录|登录\s*\/\s*注册|登录注册)$/.test(text(node)),
      );
      return { hasProfileSignal, hasLoginSignal, bodyText: text(document.body).slice(0, 4000) };
    });
    return { url, ...dom };
  } catch {
    return { url, hasProfileSignal: false, hasLoginSignal: false, bodyText: "" };
  }
}

async function ensureAuthenticatedPage(page) {
  const startedAt = nowMs();
  debugLog("session_validate_begin", { url: safeURL(page), session_cookie: hasSessionCookie(await sessionCookies(page)) });
  if (!hasSessionCookie(await sessionCookies(page))) {
    debugLog("session_validate_no_cookie");
    throw protocolError("SESSION_EXPIRED", "session is no longer valid");
  }
  await page.goto(SELF_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  debugLog("session_validate_self_loaded", { url: safeURL(page) });
  const deadline = nowMs() + 12000;
  let snapshot = { url: page.url(), hasProfileSignal: false, hasLoginSignal: false, bodyText: "" };
  while (nowMs() < deadline) {
    if (await challengeVisible(page)) {
      debugLog("session_validate_challenge", { elapsed_ms: nowMs() - startedAt, url: safeURL(page) });
      throw protocolError("CHALLENGE_REQUIRED", "platform challenge is required");
    }
    snapshot = await readAuthSnapshot(page);
    if (isAuthenticatedPage(snapshot)) {
      debugLog("session_validate_success", { elapsed_ms: nowMs() - startedAt, url: safeURL(page) });
      return snapshot;
    }
    await page.waitForTimeout(500);
  }
  debugLog("session_validate_failed", { elapsed_ms: nowMs() - startedAt, url: safeURL(page), has_profile_signal: snapshot.hasProfileSignal, has_login_signal: snapshot.hasLoginSignal });
  throw protocolError("SESSION_EXPIRED", "session page is not authenticated", false, {
    reason: "logged_out_page",
    url: snapshot.url,
  });
}

async function openMessagePanel(page, { groupOnly = false } = {}) {
  const candidates = [
    page.getByText("消息", { exact: true }),
    page.locator("[aria-label*='消息'], [title*='消息']"),
  ];
  for (const locator of candidates) {
    try {
      const count = Math.min(await locator.count(), 5);
      for (let index = count - 1; index >= 0; index -= 1) {
        const item = locator.nth(index);
        if (await item.isVisible().catch(() => false)) {
          await item.click({ timeout: 5000, force: true });
          await page.waitForTimeout(1000);
          debugLog("conversations_message_entry_clicked", { candidate_count: count, candidate_index: index, url: safeURL(page) });
          return true;
        }
      }
    } catch {}
  }
  debugLog("conversations_message_entry_unavailable", { url: safeURL(page) });
  return false;
}

async function openConversationRoute(page, { groupOnly = false } = {}) {
  await page.goto(CHAT_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  debugLog("conversations_chat_route_loaded", { group_only: groupOnly, url: safeURL(page) });
  if (await challengeVisible(page)) {
    throw protocolError("CHALLENGE_REQUIRED", "platform challenge is required");
  }
  if (await waitForConversationList(page)) {
    debugLog("conversations_list_ready", { source: "direct_chat_route", group_only: groupOnly, url: safeURL(page) });
    return "direct_chat_route";
  }

  // Compatibility path for a platform rollout that renders the route shell
  // but leaves the popup closed. The normal path never clicks the header.
  debugLog("conversations_direct_route_list_missing", { group_only: groupOnly, url: safeURL(page) });
  if (await openMessagePanel(page, { groupOnly }) && await waitForConversationList(page, 8000)) {
    debugLog("conversations_list_ready", { source: "message_entry_fallback", group_only: groupOnly, url: safeURL(page) });
    return "message_entry_fallback";
  }
  return "";
}

async function openGroupConversationTab(page) {
  const candidates = [
    page.locator("[role='tab']:has-text('群聊'), [role='tab']:has-text('群组')"),
    page.locator("button:has-text('群聊'), button:has-text('群组'), [role='button']:has-text('群聊'), [role='button']:has-text('群组')"),
  ];
  for (const locator of candidates) {
    try {
      const count = Math.min(await locator.count(), 8);
      for (let index = count - 1; index >= 0; index -= 1) {
        const item = locator.nth(index);
        if (!await item.isVisible().catch(() => false)) continue;
        await item.click({ timeout: 5000, force: true });
        await page.waitForTimeout(900);
        debugLog("conversations_group_tab_clicked", { candidate_count: count, candidate_index: index, url: safeURL(page) });
        return true;
      }
    } catch {}
  }
  debugLog("conversations_group_tab_unavailable", { url: safeURL(page) });
  return false;
}

function conversationIdentityFromRecords(records, conversationHint = "") {
  const conversationKeys = [
    "conversation_id", "conversationid", "conv_id", "convid",
    "conversation_short_id", "conversationshortid",
  ];
  const userKeys = ["uid", "user_id", "userid"];
  const secUserKeys = ["sec_uid", "secuid", "sec_user_id", "secuserid"];
  const identities = (records || []).map((record) => record?.identity).filter((value) => value && typeof value === "object");
  const uidToSec = new Map();
  for (const identity of identities) {
    const uid = userKeys.map((key) => String(identity[key] ?? "").trim()).find(Boolean);
    const secUID = secUserKeys.map((key) => String(identity[key] ?? "").trim()).find(Boolean);
    if (uid && secUID) uidToSec.set(uid, secUID);
  }
  const exact = identities.filter((identity) => conversationKeys.some((key) => String(identity[key] ?? "").trim() === conversationHint));
  const source = exact.length ? exact : identities.filter((identity) => conversationKeys.some((key) => String(identity[key] ?? "").trim()));
  const identity = source.at(-1) || {};
  const conversationID = conversationKeys.map((key) => String(identity[key] ?? "").trim()).find(Boolean) || "";
  const conversationType = conversationTypeFromRecord({ identity }, conversationID);
  let peerID = secUserKeys.map((key) => String(identity[key] ?? "").trim()).find(Boolean) || "";
  if (!peerID) {
    const uid = userKeys.map((key) => String(identity[key] ?? "").trim()).find(Boolean) || "";
    peerID = uidToSec.get(uid) || uid;
  }
  return { conversationID, peerID, conversationType };
}

function collectConversationIdentityRecords(value, records, depth = 0, path = "$" ) {
  if (depth > 6 || records.length >= 500 || value === null || value === undefined) return;
  const identityKeys = new Set([
    "conversation_id", "conversationid", "conv_id", "convid",
    "conversation_short_id", "conversationshortid", "user_id", "userid",
    "conv_short_id", "conv_short_id_str", "uid", "sec_uid", "secuid", "sec_user_id", "secuserid",
    "type", "conversation_type", "conversationtype", "conv_type", "conversation_kind", "conversationkind",
    "follow_status", "follower_status", "mate_relation", "mate_status", "new_friend_type",
    "social_relation_type", "social_relation_sub_type", "is_block", "is_blocked",
    "avatar_url", "avatarurl", "avatar_thumb", "avatarthumb", "avatar_larger", "avatarlarger", "avatar_medium", "avatarmedium",
  ]);
  const labelKeys = new Set(["nickname", "display_name", "username", "user_name", "name", "title", "conversation_name", "conversationname", "group_name", "groupname"]);
  if (Array.isArray(value)) {
    for (const [index, item] of value.slice(0, 100).entries()) collectConversationIdentityRecords(item, records, depth + 1, `${path}[${index}]`);
    return;
  }
  if (typeof value !== "object") return;
  const identity = {};
  const labels = {};
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replaceAll("-", "_");
    if (identityKeys.has(normalizedKey) && (typeof item === "string" || typeof item === "number")) {
      const text = String(item).trim();
      if (text && text.length <= 512) identity[normalizedKey] = text;
    }
    if (labelKeys.has(normalizedKey) && typeof item === "string") {
      const text = item.trim();
      if (text && text.length <= 128) labels[normalizedKey] = text;
    }
  }
  const avatarURL = findAvatarURL(value);
  if (avatarURL) identity.avatar_url = avatarURL;
  const childRecords = [];
  for (const [key, item] of Object.entries(value)) collectConversationIdentityRecords(item, childRecords, depth + 1, `${path}.${key}`);
  const hasConversation = Object.keys(identity).some((key) =>
    ["conversation_id", "conversationid", "conv_id", "convid", "conversation_short_id", "conversationshortid", "conv_short_id", "conv_short_id_str"].includes(key));
  if (hasConversation) {
    // Some IM payloads keep conv_id on the conversation object and uid/sec_uid
    // plus nickname one level below it. Preserve that local context so the
    // later DOM title calibration does not have to guess across unrelated
    // response records.
    for (const child of childRecords) {
      const childIdentity = child?.identity;
      if (!childIdentity || typeof childIdentity !== "object") continue;
      const childLabels = child?.labels && typeof child.labels === "object" ? child.labels : {};
      const childHasPeer = ["uid", "user_id", "userid", "sec_uid", "secuid", "sec_user_id", "secuserid"]
        .some((key) => String(childIdentity[key] ?? "").trim());
      const childHasLabel = Object.values(childLabels).some((item) => String(item ?? "").trim());
      const childHasAvatar = Boolean(String(childIdentity.avatar_url || "").trim());
      if (!childHasPeer && !childHasLabel && !childHasAvatar) continue;
      records.push({ identity: { ...identity, ...childIdentity }, labels: { ...labels, ...childLabels }, path });
      break;
    }
  }
  if (Object.keys(identity).length) records.push({ identity, labels, path });
  records.push(...childRecords);
}

function findAvatarURL(value, depth = 0, keyHint = "") {
  if (depth > 5 || value === null || value === undefined) return "";
  if (typeof value === "string") {
    const text = value.trim();
    return /avatar|url_list/i.test(keyHint) && /^https?:\/\//i.test(text) && text.length <= 2048 ? text : "";
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 8)) {
      const found = findAvatarURL(item, depth + 1, keyHint);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  const entries = Object.entries(value);
  for (const [key, child] of entries) {
    const found = findAvatarURL(child, depth + 1, key);
    if (found) return found;
  }
  return "";
}

function collectPayloadKeyNames(value, keys, depth = 0) {
  if (depth > 5 || keys.size >= 120 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 20)) collectPayloadKeyNames(item, keys, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    keys.add(key.toLowerCase().replaceAll("-", "_"));
    collectPayloadKeyNames(item, keys, depth + 1);
  }
}

function summarizeConversationRecordShapes(records) {
  const counts = new Map();
  for (const record of records || []) {
    const identityKeys = Object.keys(record?.identity || {}).sort();
    const labelKeys = Object.keys(record?.labels || {}).sort();
    const path = String(record?.path || "$").replace(/\[\d+\]/g, "[]");
    const key = `${identityKeys.join(",") || "-"}|${labelKeys.join(",") || "-"}|${path}`;
    const existing = counts.get(key) || { count: 0 };
    existing.count += 1;
    counts.set(key, existing);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
    .slice(0, 24)
    .map(([shape, detail]) => {
      const [identityKeys, labelKeys, path] = shape.split("|");
      return { identity_keys: identityKeys.split(",").filter(Boolean), label_keys: labelKeys.split(",").filter(Boolean), path, count: detail.count };
    });
}

const protobufLeavesCache = new WeakMap();

function protobufLeaves(fields, path = [], containers = [], out = [], skipCache = false) {
  if (!skipCache && Array.isArray(fields) && containers.length === 0 && out.length === 0) {
    const pathKey = path.join(".");
    const cachedByPath = protobufLeavesCache.get(fields);
    if (cachedByPath?.has(pathKey)) return cachedByPath.get(pathKey);
    const result = [];
    protobufLeaves(fields, path, containers, result, true);
    const cache = cachedByPath || new Map();
    cache.set(pathKey, result);
    if (!cachedByPath) protobufLeavesCache.set(fields, cache);
    return result;
  }
  for (const item of fields || []) {
    const nextPath = [...path, item.field];
    if (item.kind === "message") {
      const message = { path: nextPath.join("."), fields: item.fields || [] };
      protobufLeaves(item.fields, nextPath, [...containers, message], out);
      continue;
    }
    out.push({
      path: nextPath.join("."),
      kind: item.kind,
      text: item.kind === "string" ? String(item.text || "") : "",
      value: item.kind === "varint" ? String(item.value || "") : "",
      containers,
    });
  }
  return out;
}

function isConversationID(value) {
  return /^\d+(?::\d+){2,}$/.test(String(value || "").trim());
}

function conversationTypeFromID(value) {
  const parts = String(value || "").trim().split(":");
  if (parts.length >= 3 && parts[1] === "1") return "direct";
  if (parts.length >= 3 && parts[1] === "2") return "group";
  return "unknown";
}

function conversationTypeFromValue(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (["2", "group", "群聊", "multi", "多人"].includes(text)) return "group";
  if (["1", "direct", "single", "单聊"].includes(text)) return "direct";
  return "unknown";
}

function conversationTypeFromRecord(record, conversationID = "") {
  const identity = record?.identity;
  const idType = conversationTypeFromID(conversationID);
  if (idType !== "unknown") return idType;
  for (const key of ["conversation_type", "conversationtype", "conv_type", "type", "conversation_kind", "conversationkind"]) {
    const type = conversationTypeFromValue(identity?.[key]);
    if (type !== "unknown") return type;
  }
  return conversationTypeFromID(conversationID);
}

function conversationTypeFromProtobufScope(scope) {
  const fields = scope?.fields || [];
  // The IM Conversation message uses a small integer type field. Prefer the
  // schema's usual field 3, then accept the other common layouts used by the
  // web bundle. ID-derived type remains the final source of truth.
  for (const fieldNumber of [3, 2, 4, 5]) {
    const field = fields.find((item) => item.field === fieldNumber && item.kind === "varint");
    const type = conversationTypeFromValue(field?.value);
    if (type !== "unknown") return type;
  }
  return "unknown";
}

function conversationTypeCounts(rows) {
  const counts = { direct: 0, group: 0, unknown: 0 };
  for (const row of rows || []) {
    const type = String(row?.conversation_type || "unknown");
    if (type === "direct") counts.direct += 1;
    else if (type === "group") counts.group += 1;
    else counts.unknown += 1;
  }
  return counts;
}

function isNumericID(value) {
  return /^\d{5,30}$/.test(String(value || "").trim());
}

function isSecUID(value) {
  const text = String(value || "").trim();
  return text.length >= 20 && /^[A-Za-z0-9_-]+$/.test(text) && !/^\d+$/.test(text);
}

function protobufGroupLabel(scopeLeaves, conversationID) {
  const candidates = scopeLeaves
    .filter((leaf) => leaf.kind === "string")
    .map((leaf) => String(leaf.text || "").trim())
    .filter((value) => value && value !== conversationID && value !== "群聊" && value !== "消息")
    .filter((value) => value.length >= 2 && value.length <= 80)
    .filter((value) => /[\u3400-\u9fff]/.test(value) || /\p{Extended_Pictographic}/u.test(value))
    .filter((value) => !isConversationID(value) && !isSecUID(value) && !/^https?:\/\//i.test(value));
  if (!candidates.length) return "";
  return candidates
    .map((value) => ({
      value,
      score: Number(/[\u3400-\u9fff]/.test(value)) * 4
        + Number(value.length <= 32) * 2
        + Number(!/^\d+$/.test(value)),
    }))
    .sort((left, right) => right.score - left.score || left.value.length - right.value.length)[0]?.value || "";
}

function protobufAvatarURL(scopeLeaves) {
  return scopeLeaves
    .filter((leaf) => leaf.kind === "string")
    .map((leaf) => String(leaf.text || "").trim())
    .find((value) => /^https?:\/\//i.test(value) && value.length <= 2048 && /(avatar|head|douyinpic|image)/i.test(value)) || "";
}

function protobufGroupMetadataForID(conversationID, responses) {
  const wanted = String(conversationID || "").trim();
  if (!wanted) return null;
  for (const response of responses || []) {
    if (!/\/(?:v2\/conversation\/get_info_list|v1\/conversation\/participants_list)(?:\/|$)/i.test(response?.path || "")) continue;
    const leaves = protobufLeaves(response.decoded?.fields || []);
    for (const idLeaf of leaves.filter((leaf) => leaf.kind === "string" && leaf.text === wanted)) {
      const scopes = idLeaf.containers?.length
        ? [...idLeaf.containers].reverse()
        : [{ path: "$", fields: response.decoded.fields || [] }];
      for (const scope of scopes) {
        const scopeLeaves = protobufLeaves(scope.fields, scope.path === "$" ? [] : scope.path.split(".").filter(Boolean).map(Number), []);
        if (!scopeLeaves.some((leaf) => leaf.kind === "string" && leaf.text === wanted)) continue;
        const type = conversationTypeFromID(wanted) !== "unknown"
          ? conversationTypeFromID(wanted)
          : (/participants_list/i.test(response.path || "") ? "group" : conversationTypeFromProtobufScope(scope));
        if (type !== "group") continue;
        return {
          conversationType: "group",
          groupName: protobufGroupLabel(scopeLeaves, wanted),
          avatarURL: protobufAvatarURL(scopeLeaves),
          messagePath: scope.path,
        };
      }
    }
  }
  return null;
}

function mergeConversationDisplayName(current, candidate) {
  const existing = String(current || "").trim();
  const next = String(candidate || "").trim();
  return existing && existing !== "群聊" ? existing : next || existing;
}

function protobufCandidateFromLeaves(leaves, displayName, uidToSec) {
  const matched = leaves.filter((leaf) => {
    if (leaf.kind !== "string" || !leaf.text || !displayName) return false;
    return leaf.text === displayName || leaf.text.includes(displayName) || displayName.includes(leaf.text);
  });
  if (!matched.length) return null;

  const scopes = [];
  const seenScopes = new Set();
  for (const leaf of matched) {
    for (const scope of leaf.containers || []) {
      if (seenScopes.has(scope.path)) continue;
      seenScopes.add(scope.path);
      scopes.push(scope);
    }
  }
  let best = null;
  for (const scope of scopes) {
    const scopeLeaves = protobufLeaves(scope.fields, scope.path.split(".").filter(Boolean).map(Number), []);
    const strings = scopeLeaves.filter((leaf) => leaf.kind === "string" && leaf.text);
    const conversationIDs = [...new Set(strings.filter((leaf) => isConversationID(leaf.text)).map((leaf) => leaf.text))];
    if (conversationIDs.length !== 1) continue;
    const numerics = scopeLeaves.filter((leaf) => leaf.kind === "varint" && isNumericID(leaf.value));
    const conversation = conversationIDs[0] || "";
    const conversationType = conversationTypeFromID(conversation) !== "unknown"
      ? conversationTypeFromID(conversation)
      : conversationTypeFromProtobufScope(scope);
    const groupName = conversationType === "group" ? protobufGroupLabel(strings, conversation) : "";
    const avatarURL = conversationType === "group" ? protobufAvatarURL(strings) : "";
    const secUID = strings.find((leaf) => isSecUID(leaf.text) && leaf.text !== displayName)?.text || "";
    const numericStrings = strings.filter((leaf) => isNumericID(leaf.text) && leaf.text !== displayName);
    const knownUID = [...numericStrings.map((leaf) => leaf.text), ...numerics.map((leaf) => leaf.value)]
      .find((value) => uidToSec.has(value)) || "";
    // The broad protobuf scope can contain several sec_uid-like strings
    // (owner, participants, and auxiliary metadata). A numeric UID that was
    // correlated with the JSON relation response is a stronger peer signal.
    const peerID = knownUID ? uidToSec.get(knownUID) || knownUID : secUID;
    const score = Number(Boolean(peerID)) * 8 + Number(Boolean(groupName)) * 3 - scope.path.length / 1000;
    if (!best || score > best.score) {
      best = {
        score,
        conversationID: conversation,
        conversationType,
        groupName,
        avatarURL,
        peerID,
        messagePath: scope.path,
        matchedCount: matched.length,
        candidatePaths: [
          ...strings.filter((leaf) => isConversationID(leaf.text) || isSecUID(leaf.text)).map((leaf) => ({ path: leaf.path, kind: leaf.kind, length: leaf.text.length, category: isConversationID(leaf.text) ? "conversation_id" : "sec_uid" })),
          ...[...numericStrings, ...numerics].filter((leaf) => uidToSec.has(leaf.text || leaf.value)).map((leaf) => ({ path: leaf.path, kind: leaf.kind, length: (leaf.text || leaf.value).length, category: "uid" })),
        ].slice(0, 12),
      };
    }
  }
  return best;
}

function protobufConversationCandidateFromLeaf(leaf, uidToSec, knownPeers, options = {}) {
  const allowNumericID = options.allowNumericID === true;
  const isCandidateID = isConversationID(leaf?.text) || (allowNumericID && /^\d{10,30}$/.test(String(leaf?.text || "").trim()));
  if (!leaf || leaf.kind !== "string" || !isCandidateID) return null;
  const conversationType = options.forceType || conversationTypeFromID(leaf.text);
  let best = null;
  for (const scope of [...(leaf.containers || [])].reverse()) {
    const scopeLeaves = protobufLeaves(scope.fields, scope.path.split(".").filter(Boolean).map(Number), []);
    const scopedConversationIDs = new Set(scopeLeaves
      .filter((item) => item.kind === "string" && (isConversationID(item.text) || (allowNumericID && /^\d{10,30}$/.test(String(item.text || "").trim()))))
      .map((item) => item.text));
    if (scopedConversationIDs.size !== 1 || !scopedConversationIDs.has(leaf.text)) continue;
    const mappedPeers = scopeLeaves
      .filter((item) => item.kind === "varint" && uidToSec.has(item.value))
      .map((item) => uidToSec.get(item.value) || item.value)
      .filter(Boolean);
    // A field number from an arbitrary message is not enough to classify an
    // inventory entry. Only the platform conversation-id shape is stable;
    // otherwise message history records can be mistaken for group rows.
    const resolvedType = conversationType;
    const groupName = resolvedType === "group" ? protobufGroupLabel(scopeLeaves, leaf.text) : "";
    const peerID = mappedPeers.find((value) => knownPeers.has(value)) || mappedPeers[0] || "";
    if (!peerID && resolvedType !== "group") continue;
    // Keep the name paired with the nearest conversation object. Scoring a
    // broad parent message higher can attach a perfectly valid group title to
    // a different conversation ID from the same protobuf response.
    const score = Number(knownPeers.has(peerID)) * 4
      + Number(Boolean(peerID)) * 2
      + Number(resolvedType === "group") * 2
      + Number(Boolean(groupName)) * 6
      - scope.path.length / 1000;
    if (!best || score > best.score) best = { score, conversationID: leaf.text, peerID, conversationType: resolvedType, groupName, messagePath: scope.path };
  }
  return best;
}

function resolveRowsFromProtobuf(rows, binaryResponses, records, authoritativeGroupIDs = new Set()) {
  const uidToSec = new Map();
  for (const record of records || []) {
    const identity = record?.identity;
    if (!identity || typeof identity !== "object") continue;
    const uid = [identity.uid, identity.user_id, identity.userid].map((value) => String(value || "").trim()).find(Boolean);
    const secUID = [identity.sec_uid, identity.secuid, identity.sec_user_id, identity.secuserid].map((value) => String(value || "").trim()).find(Boolean);
    if (uid && secUID) uidToSec.set(uid, secUID);
  }
  const peerLabels = new Map();
  for (const record of records || []) {
    const identity = record?.identity;
    if (!identity || typeof identity !== "object") continue;
    const peerID = [identity.sec_uid, identity.secuid, identity.sec_user_id, identity.secuserid]
      .map((value) => String(value || "").trim()).find(Boolean) || "";
    if (!peerID) continue;
    const labels = Object.values(record?.labels || {}).map((value) => String(value || "").trim()).filter(Boolean);
    if (!labels.length) continue;
    const set = peerLabels.get(peerID) || new Set();
    for (const label of labels) set.add(label);
    peerLabels.set(peerID, set);
  }
  const knownPeers = new Set(peerLabels.keys());
  const responses = (binaryResponses || []).filter((item) => item?.decoded?.ok);
  if (!responses.length) return { rows, probes: [], generated_count: 0, group_conversation_ids: [], group_label_lengths: [], group_string_shapes: [] };
  const probes = [];
  // Group titles are authoritative only when read from the rendered message
  // row. Nearby strings in message history are not safely attributable to a
  // conversation and previously caused duplicate/wrong group names.
  const groupNames = new Map();
  const resolved = (rows || []).map((row) => {
    const groupMetadata = protobufGroupMetadataForID(row.platform_conversation_id, responses);
    if (groupMetadata) {
      return {
        ...row,
        conversation_type: "group",
        peer_display_name: row.peer_display_name && row.peer_display_name !== "群聊"
          ? row.peer_display_name
          : groupMetadata.groupName || row.peer_display_name || "群聊",
        peer_avatar_url: row.peer_avatar_url || groupMetadata.avatarURL || null,
      };
    }
    if (row.platform_conversation_id && conversationTypeFromValue(row.conversation_type) === "group") {
      const groupLabel = groupNames.get(row.platform_conversation_id);
      return groupLabel && (row.peer_display_name === "" || row.peer_display_name === "群聊")
        ? { ...row, peer_display_name: groupLabel }
        : row;
    }
    if (row.platform_conversation_id && row.peer_platform_user_id) {
      const groupLabel = groupNames.get(row.platform_conversation_id);
      return groupLabel && (row.peer_display_name === "" || row.peer_display_name === "群聊")
        ? { ...row, peer_display_name: groupLabel }
        : row;
    }
    const displayName = String(row.peer_display_name || "").trim();
    let best = null;
    for (const response of responses) {
      const leaves = protobufLeaves(response.decoded.fields);
      const candidate = protobufCandidateFromLeaves(leaves, displayName, uidToSec);
      if (!candidate) continue;
      probes.push({
        path: response.path,
        title_length: displayName.length,
        message_path: candidate.messagePath,
        matched_count: candidate.matchedCount,
        candidate_paths: candidate.candidatePaths,
      });
      if (!best || Number(Boolean(candidate.conversationID)) + Number(Boolean(candidate.peerID)) > Number(Boolean(best.conversationID)) + Number(Boolean(best.peerID))) best = candidate;
    }
    if (!best) return row;
    return {
      ...row,
      platform_conversation_id: row.platform_conversation_id || best.conversationID || null,
      peer_platform_user_id: row.peer_platform_user_id || best.peerID || null,
      peer_display_name: groupNames.get(row.platform_conversation_id) || row.peer_display_name,
      conversation_type: authoritativeGroupIDs.has(row.platform_conversation_id)
        ? "group"
        : conversationTypeFromValue(row.conversation_type) !== "unknown"
          ? row.conversation_type
        : (best.conversationType || conversationTypeFromID(row.platform_conversation_id || best.conversationID)),
    };
  });
  const generated = [];
  const groupStringShapes = responses
    .filter((response) => /\/v2\/conversation\/get_info_list(?:\/|$)/i.test(response.path || ""))
    .flatMap((response) => protobufLeaves(response.decoded.fields)
      .filter((leaf) => leaf.kind === "string" && leaf.text && !isConversationID(leaf.text) && !isSecUID(leaf.text) && leaf.text.length >= 2 && leaf.text.length <= 80)
      .map((leaf) => ({ path: leaf.path, length: leaf.text.length, hash: textHash(leaf.text) })))
    .slice(0, 80);
  const generatedByConversation = new Set(resolved.map((row) => row.platform_conversation_id).filter(Boolean));
  for (const response of responses) {
    // get_message_by_init contains message history and participant objects,
    // not the conversation inventory. It is allowed above for enriching a
    // DOM row that is already visible, but must never create inventory rows.
    const isStrangerInventory = /\/v1\/stranger\/get_conversation_list(?:\/|$)/i.test(response.path || "");
    if (!isStrangerInventory && !/\/v2\/conversation\/get_info_list(?:\/|$)/i.test(response.path || "")) continue;
    const leaves = protobufLeaves(response.decoded.fields);
    for (const leaf of leaves.filter((item) => item.kind === "string" && isConversationID(item.text))) {
      const candidate = protobufConversationCandidateFromLeaf(leaf, uidToSec, knownPeers, {
        allowNumericID: false,
      });
      if (!candidate) continue;
      const labels = [...(peerLabels.get(candidate.peerID) || [])];
      const conversationType = authoritativeGroupIDs.has(candidate.conversationID)
        ? "group"
        : candidate.conversationType || conversationTypeFromID(candidate.conversationID);
      if (conversationType === "unknown") continue;
      if (generatedByConversation.has(candidate.conversationID)) continue;
      if (!labels.length && conversationType !== "group") continue;
      generatedByConversation.add(candidate.conversationID);
      generated.push({
        platform_conversation_id: candidate.conversationID,
        peer_platform_user_id: candidate.peerID || null,
      peer_display_name: candidate.groupName || labels[0] || "群聊",
      peer_avatar_url: candidate.avatarURL || null,
        conversation_type: conversationType,
        last_message_at: null,
      });
    }
  }
  const namedResolved = resolved;
  return {
    rows: [...namedResolved, ...generated],
    probes: probes.slice(0, 40),
    generated_count: generated.length,
    group_label_lengths: generated
      .filter((row) => row.conversation_type === "group" && row.peer_display_name !== "群聊")
      .map((row) => row.peer_display_name.length),
    group_name_count: groupNames.size,
    group_name_conversation_ids: [...groupNames.keys()],
    group_string_shapes: groupStringShapes,
    // DOM rows can carry a generic "group" class even for the mixed message
    // list. Only protobuf records generated from the conversation inventory
    // are authoritative for group membership here.
    group_conversation_ids: [...new Set([
      ...generated.filter((row) => row.conversation_type === "group").map((row) => row.platform_conversation_id),
    ])],
  };
}

function resolveRowsFromNetworkRecords(rows, records) {
  const conversationKeys = [
    "conversation_id", "conversationid", "conv_id", "convid",
    "conversation_short_id", "conversationshortid", "conv_short_id", "conv_short_id_str",
  ];
  const userKeys = ["uid", "user_id", "userid"];
  const secUserKeys = ["sec_uid", "secuid", "sec_user_id", "secuserid"];
  const entries = (records || []).map((record) => ({
    identity: record?.identity,
    labels: record?.labels,
    response_path: record?.response_path || "",
  })).filter((entry) => entry.identity && typeof entry.identity === "object"
    && !/\/spotlight\/relation(?:\/|$)/i.test(entry.response_path));
  const identities = entries.map((entry) => entry.identity);
  const uidToSec = new Map();
  for (const identity of identities) {
    const uid = userKeys.map((key) => String(identity[key] ?? "").trim()).find(Boolean);
    const secUID = secUserKeys.map((key) => String(identity[key] ?? "").trim()).find(Boolean);
    if (uid && secUID) uidToSec.set(uid, secUID);
  }
  const conversationForIdentity = (identity) => conversationKeys
    .map((key) => String(identity?.[key] ?? "").trim())
    .find(Boolean) || "";
  const conversationMetadata = new Map();
  const peerForIdentity = (identity) => {
    const secUID = secUserKeys.map((key) => String(identity?.[key] ?? "").trim()).find(Boolean) || "";
    if (secUID) return secUID;
    const uid = userKeys.map((key) => String(identity?.[key] ?? "").trim()).find(Boolean) || "";
    return uidToSec.get(uid) || uid;
  };
  const labelsForEntry = (entry) => [
    ...Object.values(entry.labels || {}),
    entry.identity.nickname, entry.identity.display_name, entry.identity.username,
    entry.identity.user_name, entry.identity.name, entry.identity.title,
  ].map((value) => String(value ?? "").trim()).filter(Boolean);
  const peerConversations = new Map();
  const labelPeers = new Map();
  const labelConversations = new Map();
  for (const entry of entries) {
    const identity = entry.identity;
    const conversationID = conversationForIdentity(identity);
    const peerID = peerForIdentity(identity);
    const labels = labelsForEntry(entry);
    if (conversationID) {
      const existing = conversationMetadata.get(conversationID) || { type: "unknown", labels: new Set(), avatar_url: "" };
      const type = conversationTypeFromRecord(entry, conversationID);
      if (type !== "unknown") existing.type = type;
      for (const label of labels) existing.labels.add(label);
      if (!existing.avatar_url && entry.identity.avatar_url) existing.avatar_url = String(entry.identity.avatar_url).trim();
      conversationMetadata.set(conversationID, existing);
    }
    if (peerID && conversationID) {
      const set = peerConversations.get(peerID) || new Set();
      set.add(conversationID);
      peerConversations.set(peerID, set);
    }
    for (const label of labels) {
      if (peerID) {
        const peers = labelPeers.get(label) || new Set();
        peers.add(peerID);
        labelPeers.set(label, peers);
      }
      if (conversationID) {
        const conversations = labelConversations.get(label) || new Set();
        conversations.add(conversationID);
        labelConversations.set(label, conversations);
      }
    }
  }
  const resolved = [];
  const probes = [];
  const inventory = {
    identity_count: identities.length,
    conversation_id_count: identities.filter((identity) => conversationKeys.some((key) => String(identity[key] ?? "").trim())).length,
    labeled_identity_count: entries.filter((entry) => Object.values(entry.labels || {}).some((value) => String(value ?? "").trim())).length,
    labeled_peer_count: [...labelPeers.values()].filter((peers) => peers.size > 0).length,
    labeled_conversation_count: [...labelConversations.values()].filter((conversations) => conversations.size > 0).length,
    peer_conversation_count: [...peerConversations.values()].filter((conversations) => conversations.size > 0).length,
  };
  const nextRows = (rows || []).map((row) => {
    if (row.platform_conversation_id) {
      const metadata = conversationMetadata.get(row.platform_conversation_id);
      const metadataType = metadata?.type || "unknown";
      const rowLabel = String(row.peer_display_name || "").trim();
      const metadataLabel = [...(metadata?.labels || [])][0] || "";
      return {
        ...row,
        conversation_type: conversationTypeFromValue(row.conversation_type) !== "unknown" ? row.conversation_type : metadataType,
        peer_display_name: rowLabel && rowLabel !== "群聊" ? rowLabel : metadataLabel || rowLabel || (metadataType === "group" ? "群聊" : ""),
        peer_avatar_url: row.peer_avatar_url || metadata?.avatar_url || null,
      };
    }
    const displayName = String(row.peer_display_name || "").trim();
    if (!displayName) return row;
    const matches = entries.filter((entry) => {
      const labels = labelsForEntry(entry);
      return labels.some((label) => label === displayName);
    });
    const candidates = [];
    for (const entry of matches) {
      const identity = entry.identity;
      const directConversationID = conversationForIdentity(identity);
      const directPeerID = peerForIdentity(identity);
      const labels = labelsForEntry(entry);
      const peers = new Set(directPeerID ? [directPeerID] : []);
      const conversations = new Set(directConversationID ? [directConversationID] : []);
      for (const label of labels) {
        for (const peerID of labelPeers.get(label) || []) peers.add(peerID);
        for (const conversationID of labelConversations.get(label) || []) conversations.add(conversationID);
      }
      for (const peerID of peers) for (const conversationID of peerConversations.get(peerID) || []) conversations.add(conversationID);
      for (const conversationID of conversations) for (const peerID of peers) candidates.push({ conversationID, peerID });
    }
    const unique = [...new Map(candidates.map((candidate) => [candidate.conversationID, candidate])).values()];
    if (unique.length !== 1) {
      if (matches.length) probes.push({ title_hash: textHash(displayName), title_length: displayName.length, match_count: matches.length, usable_count: unique.length });
      return row;
    }
    resolved.push({ title_hash: textHash(displayName), title_length: displayName.length, match_count: matches.length, usable_count: 1 });
    const matchedAvatar = matches
      .map((entry) => String(entry.identity?.avatar_url || "").trim())
      .find((value) => /^https?:\/\//i.test(value) && value.length <= 2048) || "";
    return {
      ...row,
      platform_conversation_id: unique[0].conversationID,
      peer_platform_user_id: unique[0].peerID,
      peer_avatar_url: row.peer_avatar_url || matchedAvatar || null,
    };
  });
  const generated = [];
  for (const [conversationID, metadata] of conversationMetadata) {
    if (metadata.type !== "group" || nextRows.some((row) => row.platform_conversation_id === conversationID)) continue;
    generated.push({
      platform_conversation_id: conversationID,
      peer_platform_user_id: null,
      peer_display_name: [...metadata.labels][0] || "群聊",
      peer_avatar_url: metadata.avatar_url || null,
      conversation_type: "group",
      last_message_at: null,
    });
  }
  return {
    rows: [...nextRows, ...generated],
    ...inventory,
    generated_count: generated.length,
    group_conversation_ids: [...conversationMetadata.entries()]
      .filter(([, metadata]) => metadata.type === "group")
      .map(([conversationID]) => conversationID),
    resolved_count: resolved.length,
    ambiguous_count: probes.length,
    probes: probes.slice(0, 40),
    resolved: resolved.slice(0, 40),
  };
}

function attachConversationCollector(page) {
  const collector = {
    records: [],
    binaryResponses: [],
    binarySequence: 0,
    streakCandidates: [],
    streakSequence: 0,
    responseSeen: false,
    relevantResponses: 0,
    pending: new Set(),
  };
  const consume = async (response) => {
    try {
      const resourceType = response.request().resourceType();
      if (resourceType !== "xhr" && resourceType !== "fetch") return;
      const url = response.url().split("?", 1)[0];
      if (!/(conversation|message|chat|\/im(?:\/|$)|\/aweme\/v1\/web\/user\/profile\/scene(?:\/|$))/i.test(url)) return;
      collector.relevantResponses += 1;
      const headers = await response.allHeaders().catch(() => ({}));
      const contentType = String(headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
      const contentEncoding = String(headers["content-encoding"] || "").trim().toLowerCase();
      let body;
      try {
        body = await response.body();
      } catch (error) {
        debugLog("conversations_response_body_unreadable", {
          path: (() => { try { return new URL(url).pathname; } catch { return ""; } })(),
          status: response.status(),
          content_type: contentType,
          content_encoding: contentEncoding,
          error_name: String(error?.name || "Error"),
        });
        return;
      }
      let payload = null;
      try {
        const text = body.toString("utf8");
        if (contentType.includes("json") || /^[\\s\\[{]/.test(text)) payload = JSON.parse(text);
      } catch {}
      if (!payload) {
        const pathname = (() => { try { return new URL(url).pathname; } catch { return ""; } })();
        const standardBinaryResponse = /\/(?:v2\/conversation\/get_info_list|v1\/conversation\/participants_list|v1\/stranger\/get_conversation_list|v1\/message\/get_message_by_init)(?:\/|$)/i.test(pathname);
        const shouldDecodeBinary = (standardBinaryResponse
          || (STREAK_SOURCE_PROBE && /\/(?:v\d+\/)?(?:conversation|message)\//i.test(pathname)))
          && body.length <= 8 * 1024 * 1024;
        if (!shouldDecodeBinary) {
          collector.responseSeen = true;
          debugLog("conversations_binary_response_skipped", {
            path: pathname,
            status: response.status(),
            content_type: contentType,
            content_encoding: contentEncoding,
            byte_length: body.length,
            body_sha256: sha256(body),
          });
          return;
        }
        const decoded = decodeProtobuf(body);
        const summary = summarizeProtobuf(decoded);
        const requestBody = response.request().postDataBuffer?.() || null;
        const requestDecoded = requestBody?.length ? decodeProtobuf(requestBody) : null;
        const requestConversationIDs = [...new Set([
          ...(requestDecoded?.ok ? protobufLeaves(requestDecoded.fields)
            .filter((leaf) => leaf.kind === "string" && isConversationID(leaf.text))
            .map((leaf) => leaf.text) : []),
          ...((requestBody?.toString("utf8") || "").match(/\d+(?::\d+){2,}/g) || []),
        ])];
        debugLog("conversations_binary_response", {
          path: pathname,
          status: response.status(),
          content_type: contentType,
          content_encoding: contentEncoding,
          byte_length: body.length,
          body_sha256: sha256(body),
          protobuf: summary,
          request_byte_length: requestBody?.length || 0,
          request_protobuf: requestDecoded ? summarizeProtobuf(requestDecoded) : null,
          request_conversation_id_hashes: requestConversationIDs.map((value) => textHash(value)).slice(0, 20),
        });
        if (!decoded.ok) return;
        if (standardBinaryResponse || STREAK_SOURCE_PROBE) {
          collector.binaryResponses.push({
            path: pathname,
            decoded,
            request_conversation_ids: requestConversationIDs,
            sequence: ++collector.binarySequence,
          });
          if (collector.binaryResponses.length > 80) collector.binaryResponses.splice(0, collector.binaryResponses.length - 80);
        }
        collector.responseSeen = true;
        return;
      }
      const records = [];
      collectConversationIdentityRecords(payload, records);
      const responsePath = (() => { try { return new URL(url).pathname; } catch { return ""; } })();
      for (const record of records) record.response_path = responsePath;
      for (const days of collectJSONStreakCandidates(payload)) {
        collector.streakCandidates.push({ path: responsePath, days, sequence: ++collector.streakSequence });
      }
      if (collector.streakCandidates.length > 240) {
        collector.streakCandidates.splice(0, collector.streakCandidates.length - 240);
      }
      const keyNames = new Set();
      collectPayloadKeyNames(payload, keyNames);
      if (records.length) collector.records.push(...records);
      collector.responseSeen = true;
      debugLog("conversations_response", {
        path: (() => { try { return new URL(url).pathname; } catch { return ""; } })(),
        status: response.status(),
        content_type: contentType,
        identity_record_count: records.length,
        identity_record_shapes: summarizeConversationRecordShapes(records),
        payload_key_names: [...keyNames].sort().slice(0, 80),
      });
    } catch {
      // A response may disappear before its body is readable. DOM extraction
      // remains authoritative when the platform exposes stable row IDs.
    }
  };
  page.on("response", (response) => {
    const pending = consume(response).finally(() => collector.pending.delete(pending));
    collector.pending.add(pending);
  });
  return collector;
}

function probeConversationStreakResponses(responses, conversationID, domStreakDays) {
  if (!STREAK_SOURCE_PROBE || !Number.isInteger(domStreakDays) || domStreakDays <= 0) return [];
  const wantedID = String(conversationID || "").trim();
  const wantedDays = String(domStreakDays);
  const matches = [];
  for (const response of responses || []) {
    const leaves = protobufLeaves(response?.decoded?.fields || []);
    const idLeaves = wantedID
      ? leaves.filter((leaf) => leaf.kind === "string" && leaf.text === wantedID)
      : [];
    const scopes = idLeaves.flatMap((leaf) => leaf.containers || []);
    for (const scope of scopes) {
      const scopeLeaves = protobufLeaves(
        scope.fields || [],
        String(scope.path || "").split(".").filter(Boolean).map(Number),
        [],
      );
      const candidatePaths = [...new Set(scopeLeaves
        .filter((leaf) => (leaf.kind === "varint" && leaf.value === wantedDays)
          || (leaf.kind === "string" && parseConversationStreakText(leaf.text) === domStreakDays))
        .map((leaf) => leaf.path))];
      if (candidatePaths.length) {
        matches.push({
          endpoint: response.path,
          scope_path: scope.path,
          candidate_paths: candidatePaths.slice(0, 20),
          scoped_to_conversation: true,
        });
      }
    }
  }
  return matches;
}

async function flushConversationCollector(collector) {
  if (collector.pending.size) await Promise.allSettled([...collector.pending]);
}

async function extractConversationRows(page) {
  try {
    return await page.evaluate(() => {
      const attr = (node, names) => {
        for (const name of names) {
          const value = node?.getAttribute?.(name);
          if (value && value.trim()) return value.trim();
        }
        return "";
      };
      const decode = (value) => {
        try { return decodeURIComponent(String(value || "")).trim(); } catch { return String(value || "").trim(); }
      };
      const text = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();
      const isConversationIdentifier = (value) => /^\d+(?::\d+){2,}$/.test(String(value || "").trim());
      const reactConversationFields = (nodes) => {
        const result = { component_key: "", conversation: "", peer: "", type: "", avatar: "", react_prop_key_count: 0 };
        const visited = new WeakSet();
        const visit = (value, keyHint = "", depth = 0) => {
          if (depth > 6 || value === null || value === undefined) return;
          if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
            const textValue = String(value).trim();
            const key = String(keyHint || "").toLowerCase().replaceAll("-", "_");
            if (!result.conversation && isConversationIdentifier(textValue)
              && (/(conversation|conv).*(id|key)/.test(key) || key === "id")) result.conversation = textValue;
            if (!result.peer && textValue && textValue.length <= 256
              && /(sec_?uid|peer.*(id|uid)|user.*(id|uid)|^uid$)/.test(key)) result.peer = textValue;
            if (!result.type && /^(conversation|conv)[_.-]?type$/.test(key)) {
              const normalized = textValue.toLowerCase();
              if (["1", "direct", "single", "单聊"].includes(normalized)) result.type = "direct";
              if (["2", "group", "群聊", "multi", "多人"].includes(normalized)) result.type = "group";
            }
            if (!result.avatar && /avatar|url_list|avatarurl/i.test(key) && /^https?:\/\//i.test(textValue) && textValue.length <= 2048) result.avatar = textValue;
            return;
          }
          if (typeof value !== "object" || visited.has(value)) return;
          visited.add(value);
          for (const [key, child] of Object.entries(value).slice(0, 120)) visit(child, key, depth + 1);
        };
        for (const node of nodes) {
          for (const key of Object.keys(node || {}).filter((item) => /^__react(Props|Fiber)/.test(item))) {
            result.react_prop_key_count += 1;
            if (!result.component_key && /^__reactFiber/.test(key)) {
              let fiber = node[key];
              for (let depth = 0; fiber && depth < 12; depth += 1, fiber = fiber.return) {
                const candidate = String(fiber.key ?? "")
                  .replace(/(?:&#x20;|&#32;|&nbsp;|\u00a0)+$/gi, "")
                  .trim();
                if (/^\d+(?::\d+){2,}$/.test(candidate) || /^\d{10,30}$/.test(candidate)) {
                  result.component_key = candidate;
                  break;
                }
              }
            }
            visit(node[key], key, 0);
          }
        }
        return result;
      };
      const conversationType = (value) => {
        const textValue = String(value || '').trim().toLowerCase();
        if (['2', 'group', '群聊', 'multi', '多人'].includes(textValue)) return 'group';
        if (['1', 'direct', 'single', '单聊'].includes(textValue)) return 'direct';
        const parts = String(value || "").trim().split(":");
        if (parts.length >= 3 && parts[1] === "1") return "direct";
        if (parts.length >= 3 && parts[1] === "2") return "group";
        return "unknown";
      };
      const list = document.querySelector(".conversationConversationListwrapper");
      const hasClassFragment = (node, fragment) => String(node?.className || "").includes(fragment);
      const closestClassFragment = (node, fragment) => {
        let current = node;
        while (current) {
          if (hasClassFragment(current, fragment)) return current;
          if (current === list) break;
          current = current.parentElement;
        }
        return null;
      };
      const descendantClassFragment = (node, fragment) => node?.querySelector?.(`[class*="${fragment}"]`) || null;
      const indexedSlotKinds = new Map();
      const indexedSlotDiagnostics = [];
      for (const node of [...list?.querySelectorAll?.("[data-index]") || []]) {
        const index = attr(node, ["data-index"]);
        if (!/^\d+$/.test(index)) continue;
        const strangerNode = closestClassFragment(node, "conversationStrangerBoxwrapper")
          || descendantClassFragment(node, "conversationStrangerBoxwrapper");
        const conversationNode = closestClassFragment(node, "conversationConversationItemwrapper")
          || descendantClassFragment(node, "conversationConversationItemwrapper");
        const kind = strangerNode ? "stranger" : (conversationNode ? "conversation" : "unknown");
        const titleNode = node.querySelector(".conversationConversationItemtitle, .conversationStrangerBoxtitle");
        indexedSlotKinds.set(index, kind);
        indexedSlotDiagnostics.push({
          data_index: Number(index),
          kind,
          title: text(titleNode),
          stranger_marker_found: Boolean(strangerNode),
          conversation_marker_found: Boolean(conversationNode),
          slot_class: String(node.className || "").slice(0, 160),
          stranger_class: String(strangerNode?.className || "").slice(0, 160),
          conversation_class: String(conversationNode?.className || "").slice(0, 160),
        });
      }
      const titles = [...list?.querySelectorAll?.(".conversationConversationItemtitle") || []]
        .filter((node) => !closestClassFragment(node, "conversationStrangerBoxwrapper")
          && Boolean(closestClassFragment(node, "conversationConversationItemwrapper")));
      const wrappers = [...list?.querySelectorAll?.(".conversationConversationItemwrapper") || []]
        .filter((node) => !closestClassFragment(node, "conversationStrangerBoxwrapper")
          && !descendantClassFragment(node, "conversationStrangerBoxwrapper"));
      const fallbackRows = [...list?.querySelectorAll?.("[class*='conversationConversationItem'], [data-conversation-id], [data-conversationid], [data-conv-id], [data-conversation], [data-conversation-key]") || []]
        .filter((node) => !closestClassFragment(node, "conversationStrangerBoxwrapper")
          && !descendantClassFragment(node, "conversationStrangerBoxwrapper"));
      // The message panel virtualizes rows. The title selector can still
      // match detached/recycled title nodes, so prefer the stable row wrapper
      // and resolve its title inside that wrapper.
      const source = wrappers.length ? wrappers : (titles.length ? titles : fallbackRows);
      const hrefs = (nodes) => nodes.flatMap((node) => {
        const own = node?.matches?.("a[href]") ? [node.getAttribute("href") || ""] : [];
        return own.concat([...node?.querySelectorAll?.("a[href]") || []].map((link) => link.getAttribute("href") || ""));
      }).filter(Boolean);
      const queryValue = (href, names) => {
        try {
          const url = new URL(href, location.origin || "https://www.douyin.com");
          for (const name of names) {
            const value = url.searchParams.get(name);
            if (value) return decode(value);
          }
        } catch {}
        return "";
      };
      const pathValue = (href) => decode(href.match(/\/(?:user|profile)\/([^/?#]+)/i)?.[1] || "");
      const rows = [];
      const rowDiagnostics = [];
      let pushedRowCount = 0;
      for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex += 1) {
        const sourceNode = source[sourceIndex];
        const title = sourceNode?.matches?.(".conversationConversationItemtitle")
          ? sourceNode
          : sourceNode?.querySelector?.(".conversationConversationItemtitle") || sourceNode;
        let row = wrappers.length ? sourceNode : title;
        for (let depth = 0; !wrappers.length && depth < 6 && row?.parentElement; depth += 1) row = row.parentElement;
        const nodes = [title, row, ...[...row?.querySelectorAll?.("*") || []]];
        let parent = title?.parentElement;
        for (let depth = 0; depth < 5 && parent; depth += 1, parent = parent.parentElement) nodes.push(parent);
        const uniqueNodes = [...new Set(nodes.filter(Boolean))];
        const reactFields = reactConversationFields(uniqueNodes);
        const firstAttr = (names) => {
          for (const node of uniqueNodes) {
            const value = attr(node, names);
            if (value) return decode(value);
          }
          return "";
        };
        const explicitConversation = firstAttr(["data-conversation-id", "data-conversationid", "data-conv-id", "data-conversation", "data-conversation-key"]);
        const genericDataID = firstAttr(["data-id"]);
        const hrefConversation = hrefs(uniqueNodes)
          .map((href) => queryValue(href, ["conversation_id", "conversationId", "conversation-id", "conv_id", "convId"]))
          .find(Boolean) || "";
        // React Fiber also contains neighboring virtual-row state. Its first
        // conversation-looking value changes as chats are selected, so it is
        // diagnostic only and must never seed a row identity.
        const conversation = explicitConversation
          || (isConversationIdentifier(genericDataID) ? genericDataID : "")
          || hrefConversation;
        const conversationSource = explicitConversation
          ? "explicit_attribute"
          : (isConversationIdentifier(genericDataID) ? "validated_data_id" : (hrefConversation ? "href" : "missing"));
        const explicitType = firstAttr(["data-conversation-type", "data-conversationtype", "data-conv-type", "data-type"]);
        const typeFromClass = uniqueNodes.some((node) => /group|群聊|multi/i.test(typeof node.className === "string" ? node.className : "")) ? "group" : "unknown";
        const peer = firstAttr(["data-sec-uid", "data-sec_uid", "data-secuid", "data-user-id", "data-uid", "data-userid", "data-peer-id", "data-peer-uid"])
          || reactFields.peer
          || hrefs(uniqueNodes).map((href) => queryValue(href, ["sec_uid", "secUid", "sec-uid", "uid", "user_id", "userId"]) || pathValue(href)).find(Boolean) || "";
        const imageNodes = uniqueNodes.flatMap((node) => node?.matches?.("img") ? [node] : [...node?.querySelectorAll?.("img") || []]);
        const avatar = firstAttr(["data-avatar", "data-avatar-url", "data-avatar-url-list"])
          || reactFields.avatar
          || imageNodes
            .sort((left, right) => Number(/avatar/i.test(String(right.className || ""))) - Number(/avatar/i.test(String(left.className || ""))))
            .map((node) => node.currentSrc || node.src || node.getAttribute("data-src") || "")
            .find((value) => /^https?:\/\//i.test(value) && value.length <= 2048) || "";
        const displayName = text(title || row).slice(0, 128);
        rowDiagnostics.push({
          index: sourceIndex,
          title_found: Boolean(sourceNode?.querySelector?.(".conversationConversationItemtitle")),
          title_length: text(title).length,
          row_length: text(row).length,
          display_name_length: displayName.length,
          unique_node_count: uniqueNodes.length,
          react_prop_key_count: reactFields.react_prop_key_count,
          react_component_key_present: Boolean(reactFields.component_key),
          react_conversation_present: Boolean(reactFields.conversation),
          accepted_conversation_source: conversationSource,
          react_peer_present: Boolean(reactFields.peer),
          react_type: reactFields.type || "unknown",
        });
        if (!displayName || displayName.length > 128) continue;
        const timeNode = row?.querySelector?.("time[datetime], [data-last-message-at]");
        rows.push({
          platform_component_key: reactFields.component_key || null,
          platform_conversation_id: conversation || null,
          peer_platform_user_id: peer || null,
          peer_avatar_url: avatar || null,
          peer_display_name: displayName,
          conversation_type: conversationType(explicitType) !== "unknown" ? conversationType(explicitType) : (conversationType(reactFields.type) !== "unknown" ? conversationType(reactFields.type) : (conversationType(conversation) !== "unknown" ? conversationType(conversation) : typeFromClass)),
          last_message_at: attr(timeNode, ["datetime", "data-last-message-at"]) || attr(row, ["data-last-message-at"]) || null,
          data_index: firstAttr(["data-index"]) || null,
          _conversation_source: conversationSource,
          _row_key: firstAttr(["data-index", "data-key"]) || `${displayName}:${sourceIndex}`,
          _source_index: sourceIndex,
        });
        pushedRowCount += 1;
      }
      const idCount = rows.filter((row) => row.platform_conversation_id).length;
      const peerCount = rows.filter((row) => row.peer_platform_user_id).length;
      const accepted = rows.filter((row) => row.platform_conversation_id && row.peer_platform_user_id).length;
      const titleTextLengths = titles.map((node) => text(node).length);
      const wrapperTitleTextLengths = wrappers.map((node) => text(node.querySelector(".conversationConversationItemtitle, .conversationConversationItemtitleWrapper") || node).length);
      const structuralClassCounts = new Map();
      for (const node of [...document.querySelectorAll("[class]")]) {
        const className = typeof node.className === "string" ? node.className.trim() : "";
        if (!className || !/(conversation|message|chat|dialog|modal)/i.test(className)) continue;
        structuralClassCounts.set(className, (structuralClassCounts.get(className) || 0) + 1);
      }
      return {
        rows,
        candidate_count: pushedRowCount,
        conversation_id_count: idCount,
        peer_id_count: peerCount,
        accepted_count: accepted,
        title_count: titles.length,
        wrapper_count: wrappers.length,
        title_nonempty_count: titleTextLengths.filter(Boolean).length,
        title_text_lengths: titleTextLengths.slice(0, 40),
        wrapper_title_nonempty_count: wrapperTitleTextLengths.filter(Boolean).length,
        wrapper_title_text_lengths: wrapperTitleTextLengths.slice(0, 40),
        source_count: source.length,
        indexed_slot_count: indexedSlotKinds.size,
        normal_conversation_slot_count: [...indexedSlotKinds.values()].filter((kind) => kind === "conversation").length,
        filtered_stranger_slot_count: [...indexedSlotKinds.values()].filter((kind) => kind === "stranger").length,
        unknown_indexed_slot_count: [...indexedSlotKinds.values()].filter((kind) => kind === "unknown").length,
        indexed_slot_diagnostics: indexedSlotDiagnostics.slice(0, 40),
        row_diagnostics: rowDiagnostics.slice(0, 40),
        pushed_row_count: pushedRowCount,
        fallback_count: fallbackRows.length,
        iframe_count: document.querySelectorAll("iframe").length,
        scrollable_element_count: [...document.querySelectorAll("*")].filter((node) => {
          const style = getComputedStyle(node);
          return /(auto|scroll)/.test(style.overflowY || "") && node.scrollHeight > node.clientHeight + 20;
        }).length,
        structural_classes: [...structuralClassCounts.entries()]
          .sort((left, right) => right[1] - left[1])
          .slice(0, 40)
          .map(([className, count]) => ({ class_name: className.slice(0, 160), count })),
      };
    });
  } catch (error) {
    return {
      rows: [],
      candidate_count: 0,
      conversation_id_count: 0,
      peer_id_count: 0,
      accepted_count: 0,
      title_count: 0,
      wrapper_count: 0,
      fallback_count: 0,
      extract_error_name: String(error?.name || "Error"),
      extract_error_message: String(error?.message || "").slice(0, 160),
    };
  }
}

async function readOpenConversationName(page, fallback = "") {
  try {
    return await page.evaluate(({ fallback: current }) => {
      const excluded = new Set(["消息", "群聊", "会话", "朋友", "通知", "搜索", "返回", "关闭", "抖音"]);
      const visible = (node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < Math.max(260, innerHeight * 0.35)
          && style.display !== "none" && style.visibility !== "hidden";
      };
      const candidates = [...document.querySelectorAll("h1,h2,h3,[class*='conversation' i],[class*='chat' i],[class*='dialog' i],[class*='header' i],[class*='title' i],[class*='name' i]")]
        .filter(visible)
        .map((node) => {
          const value = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
          const className = typeof node.className === "string" ? node.className : "";
          const rect = node.getBoundingClientRect();
          return { value, className, top: rect.top, area: rect.width * rect.height };
        })
        .filter(({ value }) => value && value !== current && !excluded.has(value) && value.length >= 2 && value.length <= 80)
        .filter(({ value }) => /[\u3400-\u9fff]/.test(value) || /\p{Extended_Pictographic}/u.test(value))
        .filter(({ value }) => !/^a:[a-z0-9_:-]+$/i.test(value) && !/^https?:\/\//i.test(value));
      candidates.sort((left, right) => {
        const leftScore = Number(/conversation|chat|dialog/i.test(left.className)) * 5 + Number(left.top < 120) * 2 - left.area / 1000000;
        const rightScore = Number(/conversation|chat|dialog/i.test(right.className)) * 5 + Number(right.top < 120) * 2 - right.area / 1000000;
        return rightScore - leftScore;
      });
      return candidates[0]?.value || "";
    }, { fallback });
  } catch {
    return "";
  }
}

async function scrollConversationPanel(page, action = "next") {
  try {
    return await page.evaluate(scrollConversationListDOM, action);
  } catch {
    return {
      moved: false,
      at_bottom: false,
      target_found: false,
      position_verified: false,
      reason: "scroll_evaluation_failed",
      candidate_count: 0,
    };
  }
}

async function clickConversationRowByIndex(page, dataIndex) {
  return clickConversationListRowByIndex(page, dataIndex);
}

async function clickConversationRow(page, row) {
  const dataIndex = String(row?.data_index || "").trim();
  if (/^\d+$/.test(dataIndex)) return clickConversationRowByIndex(page, dataIndex);
  const sourceIndex = Number(row?._source_index);
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0) return false;
  try {
    const candidate = page.locator(".conversationConversationItemwrapper").nth(sourceIndex);
    if (!await candidate.isVisible().catch(() => false)) return false;
    await candidate.click({ timeout: 5000, force: true });
    return true;
  } catch {
    return false;
  }
}

function decorateConversationRowFromIdentityRecords(row, records) {
  const displayName = String(row?.peer_display_name || "").trim();
  if (!displayName || displayName === "群聊") return row;
  const userKeys = ["uid", "user_id", "userid"];
  const secUserKeys = ["sec_uid", "secuid", "sec_user_id", "secuserid"];
  const uidToSec = new Map();
  for (const record of records || []) {
    const identity = record?.identity || {};
    const uid = userKeys.map((key) => String(identity[key] || "").trim()).find(Boolean) || "";
    const secUID = secUserKeys.map((key) => String(identity[key] || "").trim()).find(Boolean) || "";
    if (uid && secUID) uidToSec.set(uid, secUID);
  }
  const labelsForEntry = (record) => [
    ...Object.values(record?.labels || {}),
    ...["nickname", "display_name", "username", "user_name", "name", "title"].map((key) => record?.identity?.[key]),
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const matches = (records || []).filter((record) => labelsForEntry(record).some((label) => label === displayName));
  if (!matches.length) return row;
  const first = matches.find((record) => /^https?:\/\//i.test(String(record?.identity?.avatar_url || ""))) || matches[0];
  const identity = first?.identity || {};
  const peerID = secUserKeys.map((key) => String(identity[key] || "").trim()).find(Boolean)
    || uidToSec.get(userKeys.map((key) => String(identity[key] || "").trim()).find(Boolean) || "") || "";
  const avatarURL = String(first?.identity?.avatar_url || "").trim();
  return {
    ...row,
    peer_platform_user_id: row.peer_platform_user_id || peerID || null,
    peer_avatar_url: row.peer_avatar_url || (/^https?:\/\//i.test(avatarURL) ? avatarURL : null),
  };
}

function binaryResponsesMatchDisplayName(responses, displayName) {
  const expected = String(displayName || "").replace(/\s+/g, " ").trim();
  if (!expected) return false;
  return (responses || []).some((response) => protobufLeaves(response?.decoded?.fields || [])
    .some((leaf) => leaf.kind === "string"
      && String(leaf.text || "").replace(/\s+/g, " ").trim() === expected));
}

async function hydrateConversationRows(page, rows, collector, clickedDataIndexes, unsupportedHydrationKeys, scanContext = {}) {
  const updates = new Map();
  const hydrationBatch = selectConversationHydrationBatch(rows, clickedDataIndexes, unsupportedHydrationKeys);
  let rejectionReason = "";
  for (const row of hydrationBatch) {
    const dataIndex = String(row?.data_index || "").trim();
    const hydrationKey = conversationRowHydrationKey(row);
    if (clickedDataIndexes.has(hydrationKey)) continue;
    const recordCount = collector.records.length;
    const binarySequence = collector.binarySequence;
    const streakSequence = collector.streakSequence;
    const target = await describeConversationListRowByIndex(page, dataIndex);
    debugLog("conversation_row_click_begin", {
      scan_pass: scanContext.scanPass,
      scan_round: scanContext.round,
      data_index: /^\d+$/.test(dataIndex) ? dataIndex : null,
      source_index: Number.isInteger(Number(row?._source_index)) ? Number(row._source_index) : null,
      title_hash: textHash(target.title || row.peer_display_name),
      title_length: String(target.title || row.peer_display_name || "").length,
      conversation_id_hash: textHash(row.platform_conversation_id),
      conversation_id_source: row._conversation_source || "unknown",
      peer_id_hash: textHash(row.peer_platform_user_id),
      target_found: target.target_found === true,
      target_reason: target.reason || "",
      selector_match_count: target.selector_match_count || 0,
      visible_match_count: target.visible_match_count || 0,
      selected_position: Number.isInteger(target.selected_position) ? target.selected_position : null,
      inside_list: target.inside_list === true,
      row_rect: target.row_rect || null,
      list_rect: target.list_rect || null,
      row_class: target.row_class || "",
    });
    const expectedTitle = String(row?.peer_display_name || "").replace(/\s+/g, " ").trim();
    const targetTitle = String(target?.title || "").replace(/\s+/g, " ").trim();
    const expectedComponentKey = canonicalConversationComponentKey(row?.platform_component_key);
    const targetComponentKey = canonicalConversationComponentKey(target?.platform_component_key);
    if (!target.target_found || !expectedTitle || targetTitle !== expectedTitle
      || !isConversationComponentKey(expectedComponentKey) || targetComponentKey !== expectedComponentKey) {
      rejectionReason = !target.target_found
        ? "target_not_found"
        : (!expectedTitle || targetTitle !== expectedTitle
          ? "dom_title_changed"
          : (!isConversationComponentKey(expectedComponentKey) ? "component_key_missing" : "component_key_changed"));
      debugLog("conversation_row_click_rejected", {
        data_index: /^\d+$/.test(dataIndex) ? dataIndex : null,
        reason: rejectionReason,
        expected_title_hash: textHash(expectedTitle),
        actual_title_hash: textHash(targetTitle),
        expected_component_key_hash: textHash(expectedComponentKey),
        actual_component_key_hash: textHash(targetComponentKey),
      });
      continue;
    }
    const domStreak = await readConversationListStreakSnapshot(page, dataIndex);
    const domStreakDays = domStreak?.days ?? null;
    const clicked = await clickConversationRow(page, row);
    debugLog("conversation_row_click_result", {
      data_index: /^\d+$/.test(dataIndex) ? dataIndex : null,
      conversation_id_hash: textHash(row.platform_conversation_id),
      clicked,
      dom_streak_days: domStreakDays,
      dom_streak_activated_today: domStreak?.activated_today ?? null,
      dom_streak_icon_kind: domStreak?.icon_kind || "missing",
    });
    if (!clicked) {
      rejectionReason = "click_failed";
      continue;
    }
    await page.waitForTimeout(850);
    await flushConversationCollector(collector);
    const newRecords = collector.records.slice(recordCount);
    const newBinaryResponses = collectorItemsAfterSequence(collector.binaryResponses, binarySequence);
    const getInfo = selectGetInfoConversationForComponentKey(newBinaryResponses, expectedComponentKey);
    if (!getInfo) {
      rejectionReason = "get_info_component_key_mismatch";
      debugLog("conversation_row_hydration_rejected", {
        data_index: /^\d+$/.test(dataIndex) ? dataIndex : null,
        reason: rejectionReason,
        component_key_hash: textHash(expectedComponentKey),
        new_binary_response_count: newBinaryResponses.length,
        get_info_response_count: newBinaryResponses
          .filter((response) => /\/v2\/conversation\/get_info_list(?:\/|$)/i.test(response?.path || "")).length,
      });
      continue;
    }
    const newStreakCandidates = collectorItemsAfterSequence(collector.streakCandidates, streakSequence);
    const interfaceStreakCandidates = newStreakCandidates
      .map((candidate) => candidate.days);
    const interfaceStreakPaths = [...new Set(newStreakCandidates
      .map((candidate) => candidate.path)
      .filter(Boolean))];
    if (Number.isSafeInteger(getInfo.streakDays)) {
      interfaceStreakCandidates.unshift(getInfo.streakDays);
      interfaceStreakPaths.unshift("/v2/conversation/get_info_list#6.610.1.50.11");
    }
    for (const response of newBinaryResponses) {
      for (const leaf of protobufLeaves(response?.decoded?.fields || [])) {
        if (leaf.kind !== "string" || !/(火花|连续聊天|streak|flame|🔥)/i.test(String(leaf.text || ""))) continue;
        const days = parseConversationStreakText(leaf.text);
        if (days !== null) interfaceStreakCandidates.push(days);
      }
    }
    const streak = Number.isSafeInteger(getInfo.streakDays)
      ? { days: getInfo.streakDays, source: "get_info_list" }
      : selectConversationStreakDays(interfaceStreakCandidates, domStreakDays, {
        interfaceScoped: interfaceStreakPaths.length > 0,
      });
    const responsePaths = [...new Set([
      ...newRecords.map((record) => record?.response_path),
      ...newBinaryResponses.map((response) => response?.path),
    ].filter(Boolean))];
    let hydrated = decorateConversationRowFromIdentityRecords(row, newRecords);
    hydrated.platform_component_key = getInfo.componentKey;
    hydrated.platform_conversation_id = getInfo.platformConversationID;
    hydrated.conversation_type = getInfo.conversationType !== "unknown"
      ? getInfo.conversationType
      : hydrated.conversation_type;
    hydrated.peer_platform_user_id = getInfo.conversationType === "direct"
      ? (resolveDirectConversationPeer({
        domPeerPlatformUserID: hydrated.peer_platform_user_id,
        getInfoPeerPlatformUserID: getInfo.peerPlatformUserID,
        selfPlatformUserID: scanContext.selfPlatformUserID,
      }) || null)
      : (hydrated.peer_platform_user_id || null);
    hydrated.peer_avatar_url = getInfo.avatarURL || hydrated.peer_avatar_url || null;
    if ((!hydrated.peer_display_name || hydrated.peer_display_name === "群聊") && getInfo.displayName) {
      hydrated.peer_display_name = getInfo.displayName;
    }
    hydrated.streak_days = streak.days;
    hydrated.streak_activated_today = typeof getInfo.streakActivatedToday === "boolean"
      ? getInfo.streakActivatedToday
      : (domStreak?.activated_today ?? null);
    hydrated = resolveRowsFromNetworkRecords([hydrated], newRecords).rows[0] || hydrated;
    const protobuf = resolveRowsFromProtobuf([hydrated], newBinaryResponses, newRecords, new Set());
    const sameID = String(hydrated.platform_conversation_id || "").trim();
    const protobufRow = (protobuf.rows || []).find((item) => sameID && item.platform_conversation_id === sameID)
      || (protobuf.rows || []).find((item) => item.peer_display_name === hydrated.peer_display_name);
    if (protobufRow) {
      hydrated = {
        ...hydrated,
        ...protobufRow,
        peer_avatar_url: protobufRow.peer_avatar_url || hydrated.peer_avatar_url || null,
        peer_display_name: protobufRow.peer_display_name && protobufRow.peer_display_name !== "群聊"
          ? protobufRow.peer_display_name
          : hydrated.peer_display_name,
        peer_platform_user_id: protobufRow.peer_platform_user_id || hydrated.peer_platform_user_id || null,
        streak_days: streak.days,
        platform_component_key: getInfo.componentKey,
        streak_activated_today: typeof getInfo.streakActivatedToday === "boolean"
          ? getInfo.streakActivatedToday
          : (domStreak?.activated_today ?? null),
      };
    }
    const conversationIDsForPath = (path) => newBinaryResponses
      .filter((response) => response?.path === path)
      .flatMap((response) => [
        ...(response?.request_conversation_ids || []),
        ...protobufLeaves(response?.decoded?.fields || [])
          .filter((leaf) => leaf.kind === "string" && isConversationID(leaf.text))
          .map((leaf) => leaf.text),
      ]);
    const clickedIdentity = {
      conversationID: getInfo.platformConversationID,
      conversationType: getInfo.conversationType,
      authoritative: true,
    };
    const responseMatchesTitle = identityRecordsMatchDisplayName(newRecords, expectedTitle)
      || binaryResponsesMatchDisplayName(newBinaryResponses, expectedTitle);
    const responseMatchesPeer = identityRecordsMatchPeer(newRecords, row.peer_platform_user_id);
    const responseHasParticipantList = newBinaryResponses
      .some((response) => /\/v1\/conversation\/participants_list(?:\/|$)/i.test(response?.path || ""));
    const responseIsClickedGroup = clickedIdentity.conversationType === "group";
    const responseMatchesDOM = getInfo.componentKey === expectedComponentKey;
    const directUID = clickedIdentity.conversationType === "direct"
      ? directConversationUIDFromComponentKey(expectedComponentKey)
      : "";
    const profileScene = selectProfileSceneRelationshipForUID(newRecords, directUID);
    const relationship = profileScene.relationship;
    debugLog("conversation_peer_relationship_observed", {
      scan_pass: scanContext.scanPass,
      scan_round: scanContext.round,
      data_index: /^\d+$/.test(dataIndex) ? dataIndex : null,
      title_hash: textHash(expectedTitle),
      conversation_id_hash: textHash(clickedIdentity.conversationID || hydrated.platform_conversation_id),
      component_uid_present: Boolean(directUID),
      component_uid_hash: textHash(directUID),
      profile_uid_matched: profileScene.matched,
      relationship_record_count: profileScene.recordCount,
      relationship,
    });
    hydrated._peer_relationship = relationship;
    hydrated._peer_profile_uid_match = profileScene.matched;
    debugLog("conversation_clicked_response_correlation", {
      scan_pass: scanContext.scanPass,
      scan_round: scanContext.round,
      data_index: /^\d+$/.test(dataIndex) ? dataIndex : null,
      expected_title_hash: textHash(expectedTitle),
      dom_conversation_id_hash: textHash(row.platform_conversation_id),
      dom_conversation_id_source: row._conversation_source || "unknown",
      dom_peer_id_hash: textHash(row.peer_platform_user_id),
      candidate_conversation_id_hash: textHash(clickedIdentity.conversationID),
      candidate_conversation_type: clickedIdentity.conversationType,
      candidate_authoritative: clickedIdentity.authoritative,
      response_matches_title: responseMatchesTitle,
      response_matches_peer: responseMatchesPeer,
      response_has_participant_list: responseHasParticipantList,
      response_matches_dom: responseMatchesDOM,
      component_key_hash: textHash(getInfo.componentKey),
      get_info_response_count: getInfo.responseCount,
      get_info_conversation_id_hashes: [...new Set(conversationIDsForPath("/v2/conversation/get_info_list"))]
        .map((value) => textHash(value)).slice(0, 20),
      participant_conversation_id_hashes: [...new Set(conversationIDsForPath("/v1/conversation/participants_list"))]
        .map((value) => textHash(value)).slice(0, 20),
      response_paths: responsePaths.slice(0, 20),
    });
    if (responseMatchesDOM) {
      hydrated = {
        ...hydrated,
        platform_component_key: getInfo.componentKey,
        platform_conversation_id: clickedIdentity.conversationID,
        conversation_type: responseIsClickedGroup ? "group" : clickedIdentity.conversationType,
      };
    } else {
      debugLog("conversation_clicked_identity_rejected", {
        data_index: /^\d+$/.test(dataIndex) ? dataIndex : null,
        reason: "response_name_mismatch",
        expected_title_hash: textHash(expectedTitle),
        candidate_conversation_id_hash: textHash(clickedIdentity.conversationID),
        new_json_record_count: newRecords.length,
        new_binary_response_count: newBinaryResponses.length,
        response_matches_peer: responseMatchesPeer,
        response_is_clicked_group: responseIsClickedGroup,
      });
    }
    const hydratedType = conversationTypeFromValue(hydrated.conversation_type) !== "unknown"
      ? conversationTypeFromValue(hydrated.conversation_type)
      : conversationTypeFromID(hydrated.platform_conversation_id);
    const stableIdentity = Boolean(String(hydrated.platform_conversation_id || "").trim())
      && canonicalConversationComponentKey(hydrated.platform_component_key) === String(hydrated.platform_conversation_id || "").trim()
      && (hydratedType === "group" || Boolean(String(hydrated.peer_platform_user_id || "").trim()));
    if (!stableIdentity) {
      rejectionReason = "stable_identity_missing";
      debugLog("conversation_row_hydration_rejected", {
        data_index: /^\d+$/.test(dataIndex) ? dataIndex : null,
        reason: "stable_identity_missing",
        expected_title_hash: textHash(expectedTitle),
        response_matches_title: responseMatchesTitle,
        response_matches_peer: responseMatchesPeer,
        response_is_clicked_group: responseIsClickedGroup,
        conversation_id_present: Boolean(hydrated.platform_conversation_id),
        component_key_present: Boolean(hydrated.platform_component_key),
        peer_id_present: Boolean(hydrated.peer_platform_user_id),
        conversation_type: hydratedType,
      });
      continue;
    }
    if (STREAK_SOURCE_PROBE && Number.isInteger(domStreakDays) && domStreakDays > 0) {
      const probeMatches = probeConversationStreakResponses(
        collector.binaryResponses,
        hydrated.platform_conversation_id,
        domStreakDays,
      );
      debugLog("conversation_streak_source_probe", {
        data_index: /^\d+$/.test(dataIndex) ? dataIndex : null,
        conversation_id_hash: textHash(hydrated.platform_conversation_id),
        response_count: collector.binaryResponses.length,
        match_count: probeMatches.length,
        matches: probeMatches,
      });
    }
    clickedDataIndexes.add(hydrationKey);
    updates.set(hydrationKey, hydrated);
    debugLog("conversation_row_hydrated", {
      data_index: /^\d+$/.test(dataIndex) ? dataIndex : null,
      source_index: Number.isInteger(Number(row?._source_index)) ? Number(row._source_index) : null,
      hydration_key_hash: textHash(hydrationKey),
      conversation_id_hash: textHash(hydrated.platform_conversation_id),
      component_key_hash: textHash(hydrated.platform_component_key),
      conversation_id_source: hydrated._conversation_source || "response",
      title_hash: textHash(hydrated.peer_display_name),
      title_length: String(hydrated.peer_display_name || "").length,
      conversation_id_present: Boolean(hydrated.platform_conversation_id),
      peer_id_present: Boolean(hydrated.peer_platform_user_id),
      avatar_present: Boolean(hydrated.peer_avatar_url),
      streak_days_present: hydrated.streak_days !== null,
      streak_days: hydrated.streak_days,
      streak_activated_today: hydrated.streak_activated_today ?? null,
      streak_icon_kind: domStreak?.icon_kind || "missing",
      streak_source: Number.isSafeInteger(getInfo.streakDays) ? getInfo.streakSource : streak.source,
      dom_streak_days: domStreakDays,
      interface_streak_candidates: [...new Set(interfaceStreakCandidates)].slice(0, 20),
      interface_streak_paths: interfaceStreakPaths.slice(0, 20),
      conversation_type: conversationTypeFromValue(hydrated.conversation_type),
      new_json_record_count: newRecords.length,
      new_binary_response_count: newBinaryResponses.length,
      response_paths: responsePaths.slice(0, 20),
    });
  }
  return {
    updates,
    snapshotConsumed: hydrationBatch.length > 0,
    attemptedKey: hydrationBatch.length ? conversationRowHydrationKey(hydrationBatch[0]) : "",
    rejectionReason,
  };
}

async function listConversations(input) {
  const limit = Number.isInteger(input?.limit) ? Math.min(Math.max(input.limit, 1), 100) : 100;
  const cursor = input?.cursor || null;
  const groupOnly = input?.group_only === true;
  const selfPlatformUserID = String(input?.self_platform_user_id || "").trim();
  return withSession(input, async (page) => {
    const collector = attachConversationCollector(page);
    const panelSource = await openConversationRoute(page, { groupOnly });
    debugLog("conversations_panel_opened", { opened: Boolean(panelSource), source: panelSource || "missing", group_only: groupOnly, url: safeURL(page) });
    if (!panelSource) throw protocolError("BROWSER_SELECTOR_CHANGED", "conversation list is unavailable on the chat route");
    await page.waitForTimeout(500);
    if (groupOnly) await openGroupConversationTab(page);
    const seen = new Map();
    const seenQuality = new Map();
    let stable = 0;
    let lastScan = { candidate_count: 0, conversation_id_count: 0, peer_id_count: 0, accepted_count: 0 };
    let lastScroll = { moved: false, at_bottom: false, target_found: false };
    const authoritativeGroupIDs = new Set();
    const namedGroupIDs = new Set();
    const clickedDataIndexes = new Set();
    const unsupportedHydrationKeys = new Set();
    const hydrationFailureCounts = new Map();
    const hydrationCache = new Map();
    const validDirectConversationIDs = new Set();
    const invalidDirectConversationIDs = new Set();
    const observedDataIndexes = new Set();
    const currentPassIndexState = new Map();
    const loggedDOMSlots = new Set();
    let stuck = 0;
    let bottomStable = 0;
    let scanPass = 0;
    let passHadHydration = false;
    for (let round = 0; round < 140; round += 1) {
      const previousSeenCount = seen.size;
      await flushConversationCollector(collector);
      const scan = await extractConversationRows(page);
      const indexedSlotDiagnostics = new Map((scan.indexed_slot_diagnostics || [])
        .map((slot) => [String(slot?.data_index ?? ""), slot]));
      for (const slot of scan.indexed_slot_diagnostics || []) {
        if (slot?.kind !== "stranger") continue;
        const slotSignature = `stranger:${scanPass}:${slot.data_index}:${slot.title}`;
        if (loggedDOMSlots.has(slotSignature)) continue;
        loggedDOMSlots.add(slotSignature);
        debugLog("conversation_stranger_filtered", {
          scan_pass: scanPass + 1,
          scan_round: round + 1,
          data_index: Number.isSafeInteger(slot.data_index) ? slot.data_index : null,
          title_hash: textHash(slot.title),
          title_length: String(slot.title || "").length,
          stranger_marker_found: slot.stranger_marker_found === true,
          conversation_marker_found: slot.conversation_marker_found === true,
          slot_class: slot.slot_class || "",
          stranger_class: slot.stranger_class || "",
          conversation_class: slot.conversation_class || "",
          reason: "conversationStrangerBoxwrapper",
        });
      }
      for (const row of scan.rows || []) {
        const dataIndex = String(row?.data_index || "").trim();
        const slotDiagnostic = indexedSlotDiagnostics.get(dataIndex);
        const slotSignature = `${scanPass}:${dataIndex}:${row.peer_display_name}:${row.platform_conversation_id}:${row.peer_platform_user_id}`;
        if (/^\d+$/.test(dataIndex) && !loggedDOMSlots.has(slotSignature)) {
          loggedDOMSlots.add(slotSignature);
          debugLog("conversation_dom_slot_observed", {
            scan_pass: scanPass + 1,
            scan_round: round + 1,
            data_index: Number(dataIndex),
            title_hash: textHash(row.peer_display_name),
            title_length: String(row.peer_display_name || "").length,
            conversation_id_hash: textHash(row.platform_conversation_id),
            conversation_id_present: Boolean(row.platform_conversation_id),
            conversation_id_source: row._conversation_source || "unknown",
            peer_id_hash: textHash(row.peer_platform_user_id),
            peer_id_present: Boolean(row.peer_platform_user_id),
            avatar_present: Boolean(row.peer_avatar_url),
            conversation_type: conversationTypeFromValue(row.conversation_type),
            dom_slot_kind: slotDiagnostic?.kind || "unknown",
            stranger_marker_found: slotDiagnostic?.stranger_marker_found === true,
            conversation_marker_found: slotDiagnostic?.conversation_marker_found === true,
          });
        }
      }
      const domGroupRows = (scan.rows || [])
        .filter((row) => row?.conversation_type === "group")
        .map((row) => ({
          title_hash: textHash(row.peer_display_name),
          title_length: String(row.peer_display_name || "").length,
          conversation_id_hash: textHash(row.platform_conversation_id),
          conversation_id_length: String(row.platform_conversation_id || "").length,
        }));
      if (domGroupRows.length) debugLog("conversations_dom_group_rows", { round: round + 1, rows: domGroupRows });
      scan.rows = applyConversationHydrationCache(scan.rows || [], hydrationCache);
      const hydrationIdentityCountBefore = conversationInventoryIdentityCount(hydrationCache.values());
      const hydration = await hydrateConversationRows(page, scan.rows, collector, clickedDataIndexes, unsupportedHydrationKeys, {
        scanPass: scanPass + 1,
        round: round + 1,
        selfPlatformUserID,
      });
      const hydratedRows = hydration.updates;
      for (const [key, hydrated] of hydratedRows) hydrationCache.set(key, hydrated);
      const hydrationIdentityCountAfter = conversationInventoryIdentityCount(hydrationCache.values());
      scan.rows = applyConversationHydrationCache(scan.rows, hydrationCache);
      for (const row of scan.rows) {
        const inventoryKey = conversationRowInventoryKey(row);
        if (!/^index:\d+$/.test(inventoryKey)) continue;
        currentPassIndexState.set(inventoryKey, {
          data_index: Number(inventoryKey.slice(6)),
          title_hash: textHash(row.peer_display_name),
          hydration_key_hash: textHash(conversationRowHydrationKey(row)),
          hydration_cache_hit: hydrationCache.has(conversationRowHydrationKey(row)),
          resolved: false,
          stored: false,
        });
      }
      const trustedDOMRows = scan.rows.filter((row) => hydrationCache.has(conversationRowHydrationKey(row)));
      // Global response collectors are diagnostic only. A row has already
      // been enriched from the responses triggered by its own click; applying
      // the accumulated response pool again can attach another row's identity
      // after the virtual list reorders.
      const resolvedNetwork = resolveRowsFromNetworkRecords([], collector.records);
      const networkGroupIDs = new Set(resolvedNetwork.group_conversation_ids || []);
      const resolvedProtobuf = resolveRowsFromProtobuf([], collector.binaryResponses, collector.records, networkGroupIDs);
      // DOM data-index rows are the authoritative inventory. Interface and
      // protobuf responses may enrich a clicked row, but they must never add
      // an extra conversation that was not rendered by the message panel.
      const rows = trustedDOMRows;
      for (const row of rows) {
        const state = currentPassIndexState.get(conversationRowInventoryKey(row));
        if (state) state.resolved = true;
      }
      if (hydration.snapshotConsumed) {
        if (hydrationIdentityCountAfter > hydrationIdentityCountBefore) passHadHydration = true;
        if (!hydratedRows.size && hydration.attemptedKey) {
          const failureCount = (hydrationFailureCounts.get(hydration.attemptedKey) || 0) + 1;
          hydrationFailureCounts.set(hydration.attemptedKey, failureCount);
          if (failureCount >= 3) {
            unsupportedHydrationKeys.add(hydration.attemptedKey);
            debugLog("conversation_dom_row_unsupported", {
              scan_pass: scanPass + 1,
              scan_round: round + 1,
              hydration_key_hash: textHash(hydration.attemptedKey),
              failure_count: failureCount,
              reason: hydration.rejectionReason || "stable_identity_unavailable",
            });
          }
        }
        debugLog("conversation_dom_snapshot_consumed", {
          scan_pass: scanPass + 1,
          scan_round: round + 1,
          hydrated_count: hydratedRows.size,
          hydrated_identity_count: hydrationIdentityCountAfter,
          new_unique_identity_count: Math.max(0, hydrationIdentityCountAfter - hydrationIdentityCountBefore),
          clicked_key_count: clickedDataIndexes.size,
          reason: "virtual_list_may_reorder_after_click",
        });
        await page.waitForTimeout(120);
        continue;
      }
      for (const row of scan.rows || []) {
        const dataIndex = String(row?.data_index || "").trim();
        if (/^\d+$/.test(dataIndex) && !unsupportedHydrationKeys.has(conversationRowHydrationKey(row))) {
          observedDataIndexes.add(Number(dataIndex));
        }
      }
      const groupIDs = rows
        .filter((row) => conversationTypeFromValue(row.conversation_type) === "group")
        .map((row) => row.platform_conversation_id);
      for (const conversationID of groupIDs) {
        if (conversationID) authoritativeGroupIDs.add(conversationID);
      }
      for (const conversationID of resolvedProtobuf.group_name_conversation_ids || []) {
        if (conversationID) namedGroupIDs.add(conversationID);
      }
      lastScan = scan;
      if (resolvedNetwork.identity_count) {
        debugLog("conversations_network_identity_resolution", {
          round: round + 1,
          record_count: collector.records.length,
          identity_count: resolvedNetwork.identity_count,
          conversation_id_count: resolvedNetwork.conversation_id_count,
          labeled_identity_count: resolvedNetwork.labeled_identity_count,
          labeled_peer_count: resolvedNetwork.labeled_peer_count,
          labeled_conversation_count: resolvedNetwork.labeled_conversation_count,
          peer_conversation_count: resolvedNetwork.peer_conversation_count,
          generated_count: resolvedNetwork.generated_count || 0,
          resolved_count: resolvedNetwork.resolved_count,
          ambiguous_count: resolvedNetwork.ambiguous_count,
          conversation_type_counts: conversationTypeCounts(resolvedNetwork.rows),
          resolved: resolvedNetwork.resolved,
          probes: resolvedNetwork.probes,
        });
      }
      if (resolvedProtobuf.probes.length) {
        debugLog("conversations_binary_identity_probe", {
          round: round + 1,
          response_count: collector.binaryResponses.length,
          generated_count: resolvedProtobuf.generated_count || 0,
          group_label_lengths: resolvedProtobuf.group_label_lengths || [],
          group_name_count: resolvedProtobuf.group_name_count || 0,
          group_string_shapes: resolvedProtobuf.group_string_shapes || [],
          probe_count: resolvedProtobuf.probes.length,
          probes: resolvedProtobuf.probes,
          conversation_type_counts: conversationTypeCounts(resolvedProtobuf.rows),
        });
      }
      if (resolvedProtobuf.group_string_shapes?.length) {
        debugLog("conversations_group_string_shapes", { shapes: resolvedProtobuf.group_string_shapes });
      }
      for (const row of rows) {
        const declaredType = conversationTypeFromValue(row.conversation_type);
        const idType = conversationTypeFromID(row.platform_conversation_id);
        const rowType = idType !== "unknown" ? idType : declaredType;
        if (row.platform_conversation_id && (row.peer_platform_user_id || rowType === "group")) {
          if (rowType === "direct") {
            recordDirectConversationValidation(
              validDirectConversationIDs,
              invalidDirectConversationIDs,
              row.platform_conversation_id,
              row._peer_profile_uid_match,
              row._peer_relationship,
            );
          }
          const clean = {
            platform_component_key: canonicalConversationComponentKey(row.platform_component_key).slice(0, 512),
            platform_conversation_id: String(row.platform_conversation_id).trim().slice(0, 512),
            peer_platform_user_id: row.peer_platform_user_id ? String(row.peer_platform_user_id).trim().slice(0, 256) : null,
            peer_avatar_url: /^https?:\/\//i.test(String(row.peer_avatar_url || "").trim())
              ? String(row.peer_avatar_url).trim().slice(0, 2048)
              : null,
            peer_display_name: String(row.peer_display_name || (rowType === "group" ? "群聊" : "")).trim().slice(0, 128),
            conversation_type: rowType.slice(0, 32) || "unknown",
            last_message_at: row.last_message_at ? String(row.last_message_at).trim().slice(0, 128) : null,
            streak_days: Number.isSafeInteger(row.streak_days) && row.streak_days >= 0 && row.streak_days <= 10000
              ? row.streak_days
              : null,
            streak_activated_today: typeof row.streak_activated_today === "boolean"
              ? row.streak_activated_today
              : null,
          };
          if (clean.platform_component_key
            && clean.platform_component_key === clean.platform_conversation_id
            && (clean.peer_platform_user_id || clean.conversation_type === "group")) {
            const accepted = filterConversationRows([clean], groupOnly);
            if (accepted.length) {
              const inventoryKey = conversationRowInventoryKey(row);
              const existing = seen.get(inventoryKey);
              const existingQuality = seenQuality.get(inventoryKey) || 0;
              const incomingQuality = Number(/^[0-9]+$/.test(String(row?.data_index || ""))) * 2
                + Number(Number.isInteger(Number(row?._source_index)));
              if (shouldRejectConversationInventoryReplacement(seen, inventoryKey, existing, clean)) {
                debugLog("conversation_inventory_virtual_overlap_rejected", {
                  data_index: /^index:\d+$/.test(inventoryKey) ? Number(inventoryKey.slice(6)) : null,
                  existing_conversation_id_hash: textHash(existing.platform_conversation_id),
                  incoming_conversation_id_hash: textHash(clean.platform_conversation_id),
                  existing_peer_id_hash: textHash(existing.peer_platform_user_id),
                  incoming_peer_id_hash: textHash(clean.peer_platform_user_id),
                  existing_title_hash: textHash(existing.peer_display_name),
                  incoming_title_hash: textHash(clean.peer_display_name),
                  reason: "incoming_identity_already_owned_by_another_index",
                });
                continue;
              }
              const merged = mergeConversationInventoryCandidate(
                existing,
                clean,
                existingQuality,
                incomingQuality,
              );
              if (existing && incomingQuality < existingQuality
                && (existing.peer_platform_user_id !== clean.peer_platform_user_id
                  || existing.peer_display_name !== clean.peer_display_name)) {
                debugLog("conversation_inventory_lower_quality_rejected", {
                  conversation_id_hash: textHash(clean.platform_conversation_id),
                  existing_quality: existingQuality,
                  incoming_quality: incomingQuality,
                  existing_peer_id_hash: textHash(existing.peer_platform_user_id),
                  incoming_peer_id_hash: textHash(clean.peer_platform_user_id),
                  existing_title_hash: textHash(existing.peer_display_name),
                  incoming_title_hash: textHash(clean.peer_display_name),
                  existing_streak_days: existing.streak_days,
                  incoming_streak_days: clean.streak_days,
                  existing_streak_activated_today: existing.streak_activated_today ?? null,
                  incoming_streak_activated_today: clean.streak_activated_today,
                });
              }
              seen.set(inventoryKey, merged);
              const state = currentPassIndexState.get(inventoryKey);
              if (state) state.stored = true;
              seenQuality.set(inventoryKey, Math.max(
                seenQuality.get(inventoryKey) || 0,
                incomingQuality,
              ));
            }
          }
        }
      }
      stable = seen.size === previousSeenCount ? stable + 1 : 0;
      lastScroll = await scrollConversationPanel(page);
      if (lastScroll.moved) stuck = 0;
      else stuck += 1;
      if (lastScroll.at_bottom && !lastScroll.moved) bottomStable += 1;
      else bottomStable = 0;
      debugLog("conversations_dom_scan", {
        round: round + 1,
        candidate_count: scan.candidate_count,
        extract_error_name: scan.extract_error_name,
        extract_error_message: scan.extract_error_message,
        conversation_id_count: scan.conversation_id_count,
        peer_id_count: scan.peer_id_count,
        accepted_count: scan.accepted_count,
        avatar_count: (scan.rows || []).filter((row) => row?.peer_avatar_url).length,
        title_count: scan.title_count,
        wrapper_count: scan.wrapper_count,
        title_nonempty_count: scan.title_nonempty_count,
        wrapper_title_nonempty_count: scan.wrapper_title_nonempty_count,
        title_text_lengths: scan.title_text_lengths,
        wrapper_title_text_lengths: scan.wrapper_title_text_lengths,
        source_count: scan.source_count,
        indexed_slot_count: scan.indexed_slot_count,
        normal_conversation_slot_count: scan.normal_conversation_slot_count,
        filtered_stranger_slot_count: scan.filtered_stranger_slot_count,
        unknown_indexed_slot_count: scan.unknown_indexed_slot_count,
        row_diagnostics: scan.row_diagnostics,
        pushed_row_count: scan.pushed_row_count,
        fallback_count: scan.fallback_count,
        iframe_count: scan.iframe_count,
        scrollable_element_count: scan.scrollable_element_count,
        structural_classes: scan.structural_classes,
        seen_count: seen.size,
        conversation_type_counts: conversationTypeCounts(rows),
        network_identity_count: collector.records.length,
        response_seen: collector.responseSeen,
        relevant_response_count: collector.relevantResponses,
        stable_rounds: stable,
        stuck_rounds: stuck,
        ...lastScroll,
      });
      // The message list is virtualized and its next batch is requested after
      // the scroll event. At the bottom, allow the request and React commit to
      // settle before deciding that the inventory is stable.
      const settleDelay = lastScroll.moved ? (lastScroll.at_bottom ? 1600 : 900) : 700;
      await page.waitForTimeout(settleDelay);
      await flushConversationCollector(collector);
      debugLog("conversations_lazy_batch_settled", {
        round: round + 1,
        settle_delay_ms: settleDelay,
        pending_response_count: collector.pending.size,
        relevant_response_count: collector.relevantResponses,
        seen_count: seen.size,
        at_bottom: lastScroll.at_bottom,
      });
      const passComplete = (bottomStable >= 2 && stable >= 1) || (!lastScroll.target_found && round >= 2);
      const hydratedIdentityCount = conversationInventoryIdentityCount(hydrationCache.values());
      const verificationNeedsRescan = conversationVerificationNeedsRescan(
        seen.size,
        hydratedIdentityCount,
        passHadHydration,
      );
      if (passComplete && verificationNeedsRescan && lastScroll.target_found) {
        debugLog("conversations_verification_rescan_required", {
          scan_pass: scanPass + 1,
          inventory_count: seen.size,
          hydration_cache_size: hydrationCache.size,
          hydrated_identity_count: hydratedIdentityCount,
          pass_had_hydration: passHadHydration,
          underfilled: seen.size < hydratedIdentityCount,
          scroll_height: lastScroll.scroll_height || null,
          highest_observed_data_index: observedDataIndexes.size ? Math.max(...observedDataIndexes) : null,
        });
        scanPass += 1;
        if (scanPass > 4) {
          debugLog("conversations_scan_failed_unstable_verification", {
            completed_passes: scanPass,
            clicked_key_count: clickedDataIndexes.size,
            hydration_cache_size: hydrationCache.size,
            hydrated_identity_count: hydratedIdentityCount,
          });
          throw protocolError("BROWSER_SELECTOR_CHANGED", "conversation panel did not reach a read-only verification pass", false);
        }
        seen.clear();
        seenQuality.clear();
        observedDataIndexes.clear();
        currentPassIndexState.clear();
        loggedDOMSlots.clear();
        stable = 0;
        stuck = 0;
        bottomStable = 0;
        passHadHydration = false;
        await page.goto(CHAT_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
        const routeReady = await waitForConversationList(page, 15000);
        const reset = routeReady
          ? await scrollConversationPanel(page, "top")
          : { moved: false, reason: "conversation_route_not_ready", target_found: false, position_verified: false };
        debugLog("conversations_dom_rescan_started", {
          pass: scanPass + 1,
          reset_moved: reset.moved,
          reset_reason: reset.reason,
          target_found: reset.target_found,
          position_verified: reset.position_verified,
          route_ready: routeReady,
        });
        await page.waitForTimeout(900);
        continue;
      }
      if (passComplete) break;
    }
    await flushConversationCollector(collector);
    const numericInventoryIndex = (key) => {
      const match = String(key || "").match(/^index:(\d+)$/);
      return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
    };
    const allInventoryEntries = [...seen.entries()]
      .sort((left, right) => numericInventoryIndex(left[0]) - numericInventoryIndex(right[0]));
    for (const [, row] of allInventoryEntries) {
      if (conversationTypeFromValue(row?.conversation_type) !== "direct") continue;
      recordDirectConversationValidation(
        validDirectConversationIDs,
        invalidDirectConversationIDs,
        row.platform_conversation_id,
        false,
        {},
      );
    }
    const strangerConversationIDs = new Set();
    for (const response of collector.binaryResponses || []) {
      if (!/\/v1\/stranger\/get_conversation_list(?:\/|$)/i.test(response?.path || "")) continue;
      for (const conversationID of response?.request_conversation_ids || []) {
        if (isConversationID(conversationID)) strangerConversationIDs.add(String(conversationID).trim());
      }
      for (const leaf of protobufLeaves(response?.decoded?.fields || [])) {
        if (leaf.kind === "string" && isConversationID(leaf.text)) strangerConversationIDs.add(String(leaf.text).trim());
      }
    }
    const conversationIDKeys = [
      "conversation_id", "conversationid", "conv_id", "convid",
      "conversation_short_id", "conversationshortid", "conv_short_id", "conv_short_id_str",
    ];
    for (const record of collector.records || []) {
      if (!/\/v1\/stranger\/get_conversation_list(?:\/|$)/i.test(record?.response_path || "")) continue;
      for (const key of conversationIDKeys) {
        const conversationID = String(record?.identity?.[key] || "").trim();
        if (isConversationID(conversationID)) strangerConversationIDs.add(conversationID);
      }
    }
    for (const conversationID of invalidDirectConversationIDs) strangerConversationIDs.add(conversationID);
    const selfInventory = filterSelfConversationInventory(allInventoryEntries, selfPlatformUserID);
    for (const [key, row] of selfInventory.filtered) {
      debugLog("conversation_self_filtered", {
        scan_pass: scanPass + 1,
        scan_round: null,
        data_index: /^index:\d+$/.test(key) ? Number(key.slice(6)) : null,
        conversation_id_hash: textHash(row.platform_conversation_id),
        title_hash: textHash(row.peer_display_name),
        title_length: String(row.peer_display_name || "").length,
        reason: "direct_peer_is_signed_in_account",
      });
    }
    const strangerInventory = filterStrangerConversationInventory(selfInventory.kept, strangerConversationIDs);
    const inventoryEntries = strangerInventory.kept;
    debugLog("conversations_stranger_identity_filter", {
      stranger_identity_count: strangerConversationIDs.size,
      profile_invalid_direct_identity_count: invalidDirectConversationIDs.size,
      filtered_inventory_count: strangerInventory.filtered.length,
      retained_inventory_count: inventoryEntries.length,
      stranger_conversation_id_hashes: [...strangerConversationIDs].map((id) => textHash(id)).slice(0, 80),
    });
    for (const [key, row] of strangerInventory.filtered) {
      debugLog("conversation_stranger_filtered", {
        scan_pass: scanPass + 1,
        scan_round: null,
        data_index: /^index:\d+$/.test(key) ? Number(key.slice(6)) : null,
        title_hash: textHash(row.peer_display_name),
        title_length: String(row.peer_display_name || "").length,
        conversation_id_hash: textHash(row.platform_conversation_id),
        peer_id_hash: textHash(row.peer_platform_user_id),
        conversation_type: conversationTypeFromValue(row.conversation_type),
        reason: invalidDirectConversationIDs.has(String(row.platform_conversation_id || ""))
          ? "profile_scene_uid_or_follow_status_invalid"
          : "stranger_inventory_endpoint",
      });
    }
    const inventoryValues = inventoryEntries
      .map(([, row]) => row)
      .filter((row) => String(row?.platform_conversation_id || "").trim());
    const observedNumericIndexes = [...observedDataIndexes].sort((left, right) => left - right);
    const missingIndexes = missingConversationInventoryIndexes(observedDataIndexes, new Set(seen.keys()));
    if (missingIndexes.length) {
      debugLog("conversations_scan_failed_incomplete_dom_inventory", {
        observed_index_count: observedNumericIndexes.length,
        highest_data_index: observedNumericIndexes.at(-1),
        hydrated_index_count: [...seen.keys()].filter((key) => /^index:\d+$/.test(key)).length,
        missing_indexes: missingIndexes.slice(0, 40),
        missing_index_states: missingIndexes
          .map((index) => currentPassIndexState.get(`index:${index}`) || { data_index: index, not_observed_in_latest_scan_state: true })
          .slice(0, 40),
      });
      throw protocolError("BROWSER_SELECTOR_CHANGED", "conversation panel contains rows whose identity could not be verified", false, {
        observed_index_count: observedNumericIndexes.length,
        highest_data_index: observedNumericIndexes.at(-1),
        missing_index_count: missingIndexes.length,
      });
    }
    const duplicateConversationIDs = [...inventoryValues.reduce((counts, row) => {
      const id = String(row.platform_conversation_id || "").trim();
      counts.set(id, (counts.get(id) || 0) + 1);
      return counts;
    }, new Map()).entries()].filter(([, count]) => count > 1);
    const duplicateDirectPeers = [...inventoryValues.reduce((counts, row) => {
      const peer = row.conversation_type === "direct" ? String(row.peer_platform_user_id || "").trim() : "";
      if (peer) counts.set(peer, (counts.get(peer) || 0) + 1);
      return counts;
    }, new Map()).entries()].filter(([, count]) => count > 1);
    if (duplicateConversationIDs.length || duplicateDirectPeers.length) {
      const duplicateConversationIDSet = new Set(duplicateConversationIDs.map(([id]) => id));
      const duplicateDirectPeerSet = new Set(duplicateDirectPeers.map(([id]) => id));
      debugLog("conversations_scan_failed_duplicate_identity", {
        duplicate_conversation_id_count: duplicateConversationIDs.length,
        duplicate_direct_peer_count: duplicateDirectPeers.length,
        duplicate_conversation_id_hashes: duplicateConversationIDs.map(([id, count]) => ({ hash: textHash(id), count })).slice(0, 20),
        duplicate_direct_peer_hashes: duplicateDirectPeers.map(([id, count]) => ({ hash: textHash(id), count })).slice(0, 20),
        duplicate_rows: inventoryEntries
          .filter(([, row]) => duplicateConversationIDSet.has(String(row.platform_conversation_id || ""))
            || duplicateDirectPeerSet.has(String(row.peer_platform_user_id || "")))
          .map(([key, row]) => ({
            data_index: /^index:\d+$/.test(key) ? Number(key.slice(6)) : null,
            conversation_id_hash: textHash(row.platform_conversation_id),
            peer_id_hash: textHash(row.peer_platform_user_id),
            title_hash: textHash(row.peer_display_name),
            title_length: String(row.peer_display_name || "").length,
            conversation_type: row.conversation_type,
          }))
          .slice(0, 40),
      });
      throw protocolError("BROWSER_SELECTOR_CHANGED", "conversation panel identity correlation produced duplicates", false, {
        duplicate_conversation_id_count: duplicateConversationIDs.length,
        duplicate_direct_peer_count: duplicateDirectPeers.length,
      });
    }
    const values = finalizeConversationInventory(inventoryValues, groupOnly, authoritativeGroupIDs);
    const qualityByConversationID = new Map(inventoryEntries.map(([key, row]) => [
      String(row?.platform_conversation_id || ""),
      seenQuality.get(key) || 0,
    ]));
    const cursorIndex = cursor ? values.findIndex((item) => item.platform_conversation_id === cursor) : -1;
    if (cursor && cursorIndex < 0) throw protocolError("INVALID_REQUEST", "conversation cursor is no longer available", false, { operation: "conversations.list", reason: "cursor_not_found" });
    if (!values.length) {
      debugLog("conversations_scan_failed_empty", {
        candidate_count: lastScan.candidate_count,
        conversation_id_count: lastScan.conversation_id_count,
        peer_id_count: lastScan.peer_id_count,
        network_identity_count: collector.records.length,
        response_seen: collector.responseSeen,
        relevant_response_count: collector.relevantResponses,
        last_scroll: lastScroll,
      });
      throw protocolError("BROWSER_SELECTOR_CHANGED", "conversation panel returned no stable conversation records", false, {
        candidate_count: lastScan.candidate_count,
        conversation_id_count: lastScan.conversation_id_count,
        peer_id_count: lastScan.peer_id_count,
        network_identity_count: collector.records.length,
        response_seen: collector.responseSeen,
      });
    }
    const start = cursor ? cursorIndex + 1 : 0;
    const items = values.slice(start, start + limit);
    const next = start + items.length < values.length ? items.at(-1)?.platform_conversation_id || null : null;
    debugLog("conversations_scan_finished", {
      item_count: items.length,
      total_count: values.length,
      named_count: values.filter((item) => item.peer_display_name && item.peer_display_name !== "群聊").length,
      avatar_count: values.filter((item) => item.peer_avatar_url).length,
      streak_known_count: values.filter((item) => Number.isInteger(item.streak_days)).length,
      streak_nonzero_count: values.filter((item) => Number.isInteger(item.streak_days) && item.streak_days > 0).length,
      streak_activated_today_count: values.filter((item) => item.streak_activated_today === true).length,
      streak_not_activated_today_count: values.filter((item) => item.streak_activated_today === false).length,
      streak_activation_unknown_count: values.filter((item) => item.streak_activated_today === null || item.streak_activated_today === undefined).length,
      group_avatar_count: values.filter((item) => item.conversation_type === "group" && item.peer_avatar_url).length,
      named_group_id_matches: [...namedGroupIDs].filter((conversationID) => authoritativeGroupIDs.has(conversationID)).length,
      has_next: Boolean(next),
      group_only: groupOnly,
      conversation_type_counts: conversationTypeCounts(values),
    });
    values.forEach((item, index) => debugLog("conversation_inventory_item", {
      index,
      conversation_id_hash: textHash(item.platform_conversation_id),
      peer_id_hash: textHash(item.peer_platform_user_id),
      title_hash: textHash(item.peer_display_name),
      title_length: String(item.peer_display_name || "").length,
      avatar_present: Boolean(item.peer_avatar_url),
      conversation_type: conversationTypeFromValue(item.conversation_type),
      streak_days: item.streak_days,
      streak_activated_today: item.streak_activated_today ?? null,
      quality: qualityByConversationID.get(item.platform_conversation_id) || 0,
    }));
    return { items, next_cursor: next };
  });
}

async function clickConversation(page, conversationID, peerID) {
  return clickConversationListRowByIdentity(page, conversationID, peerID);
}

async function sendText(input) {
  const target = input?.target;
  const message = input?.message;
  if (!target || typeof target.platform_conversation_id !== "string" || !message || typeof message.text !== "string" || !message.text.trim()) {
    throw protocolError("INVALID_REQUEST", "target and message.text are required");
  }
  return withSession(input, async (page) => {
    if (!await openConversationRoute(page)) throw protocolError("BROWSER_SELECTOR_CHANGED", "conversation list is unavailable on the chat route");
    if (!await clickConversation(page, target.platform_conversation_id, target.platform_user_id)) {
      throw protocolError("CONVERSATION_NOT_FOUND", "conversation was not found");
    }
    const editor = page.locator("[contenteditable='true'], textarea, [role='textbox']");
    let inputBox = null;
    for (let attempt = 0; attempt < 10 && !inputBox; attempt += 1) {
      const count = Math.min(await editor.count(), 8);
      for (let index = 0; index < count; index += 1) {
        if (await editor.nth(index).isVisible().catch(() => false)) { inputBox = editor.nth(index); break; }
      }
      if (!inputBox) await page.waitForTimeout(300);
    }
    if (!inputBox) throw protocolError("BROWSER_SELECTOR_CHANGED", "message editor is unavailable");
    const result = await sendTextAndConfirm(page, inputBox, message.text.trim());
    debugLog("message_send_confirmed", {
      confirmation_source: result.confirmation_source,
      platform_message_id_present: Boolean(result.platform_message_id),
    });
    return result;
  });
}

async function archiveConversation(input) {
  const target = input?.target;
  if (!target || typeof target.platform_conversation_id !== "string" || typeof input.archived !== "boolean") {
    throw protocolError("INVALID_REQUEST", "target and archived are required");
  }
  return withSession(input, async (page) => {
    if (!await openConversationRoute(page)) throw protocolError("BROWSER_SELECTOR_CHANGED", "conversation list is unavailable on the chat route");
    if (!await clickConversation(page, target.platform_conversation_id, target.platform_user_id)) throw protocolError("CONVERSATION_NOT_FOUND", "conversation was not found");
    const menu = page.locator("button[aria-label*='更多'], [aria-label*='更多'], [title*='更多'], button");
    const count = Math.min(await menu.count(), 20);
    let opened = false;
    for (let index = 0; index < count; index += 1) if (await menu.nth(index).isVisible().catch(() => false)) {
      const label = await menu.nth(index).getAttribute("aria-label").catch(() => "");
      const title = await menu.nth(index).getAttribute("title").catch(() => "");
      if ((label || title || "").includes("更多")) { await menu.nth(index).click({ force: true }).catch(() => {}); opened = true; break; }
    }
    if (!opened) throw protocolError("BROWSER_SELECTOR_CHANGED", "conversation action menu is unavailable");
    const action = page.getByText(input.archived ? "归档" : "取消归档", { exact: true });
    if (!await action.first().isVisible().catch(() => false)) throw protocolError("BROWSER_SELECTOR_CHANGED", "conversation archive action is unavailable");
    await action.first().click({ force: true });
    await page.waitForTimeout(700);
    const confirmed = await page.evaluate(({ id, archived }) => {
      const row = [...document.querySelectorAll("[data-conversation-id], [data-id]")].find((item) => (item.getAttribute("data-conversation-id") || item.getAttribute("data-id")) === id);
      if (!row) return false;
      const value = row.getAttribute("data-archived");
      return value === String(archived) || (archived && !document.body.innerText.includes("归档"));
    }, { id: target.platform_conversation_id, archived: input.archived });
    if (!confirmed) throw protocolError("ADAPTER_INCOMPATIBLE", "archive receipt was not confirmed", false, { outcome: "unknown" });
    return { confirmed: true, platform_conversation_id: target.platform_conversation_id, archived: input.archived };
  });
}

async function sendSticker(input) {
  const target = input?.target;
  const stickerID = input?.message?.sticker_id;
  if (!target || typeof target.platform_conversation_id !== "string" || typeof stickerID !== "string" || !stickerID.trim()) throw protocolError("INVALID_REQUEST", "target and message.sticker_id are required");
  return withSession(input, async (page) => {
    if (!await openConversationRoute(page)) throw protocolError("BROWSER_SELECTOR_CHANGED", "conversation list is unavailable on the chat route");
    if (!await clickConversation(page, target.platform_conversation_id, target.platform_user_id)) throw protocolError("CONVERSATION_NOT_FOUND", "conversation was not found");
    await clickText(page, ["表情", "emoji"]);
    const clicked = await page.evaluate((wanted) => {
      const nodes = [...document.querySelectorAll("[data-sticker-id], [data-stickerid], [data-sticker-key]")];
      const node = nodes.find((item) => [item.getAttribute("data-sticker-id"), item.getAttribute("data-stickerid"), item.getAttribute("data-sticker-key")].includes(wanted));
      if (!node) return false;
      node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    }, stickerID.trim());
    if (!clicked) throw protocolError("BROWSER_SELECTOR_CHANGED", "sticker resource is unavailable");
    await page.waitForTimeout(1000);
    const receipt = await page.evaluate(() => [...document.querySelectorAll("[data-message-id], [data-msg-id], [data-messageid]")].at(-1)?.getAttribute("data-message-id") || "");
    if (!receipt) throw protocolError("ADAPTER_INCOMPATIBLE", "sticker receipt was not confirmed", false, { outcome: "unknown" });
    return { confirmed: true, platform_message_id: receipt };
  });
}

async function handle(request) {
  if (request.op === "health.check") {
    return {
      status: "healthy",
      adapter: ADAPTER,
      version: ADAPTER_VERSION,
      capabilities: ["login.qr", "login.sms", "session.validate", "conversations.sync", "message.send.text.existing", "message.send.sticker.existing"],
    };
  }
  if (request.op === "login.qr.start") return startQr(request.input);
  if (request.op === "login.qr.poll") return pollQr(request.input);
  if (request.op === "login.qr.cancel") return cancelLogin(request.input);
  if (request.op === "login.sms.start") return startSms(request.input);
  if (request.op === "login.sms.verify") return verifySms(request.input);
  if (request.op === "session.validate") return validateSession(request.input);
  if (request.op === "conversations.list") return listConversations(request.input);
  if (request.op === "conversations.archive") return archiveConversation(request.input);
  if (request.op === "message.send_text" || request.op === "message.send_first") return sendText(request.input);
  if (request.op === "message.send_sticker") return sendSticker(request.input);
  throw protocolError("UNSUPPORTED_OPERATION", `unsupported op: ${request.op}`);
}

const readline = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of readline) {
  if (!line.trim()) continue;
  const started = nowMs();
  let request;
  try {
    request = parseRequest(line);
    debugLog("request_received", { request_id: request.request_id, op: request.op });
    const result = await handle(request);
    debugLog("request_succeeded", { request_id: request.request_id, op: request.op, duration_ms: nowMs() - started });
    process.stdout.write(`${JSON.stringify(success(request, result, started))}\n`);
  } catch (error) {
    debugLog("request_failed", {
      request_id: request?.request_id || "invalid-request",
      op: request?.op || "",
      code: error.code || "SIDECAR_INTERNAL_ERROR",
      message: error.code ? error.message : "internal error",
      internal_error: error.code ? undefined : String(error?.message || error?.name || error),
      stack: error.code ? undefined : String(error?.stack || "").split("\n").slice(0, 4).join("\n"),
      duration_ms: nowMs() - started,
    });
    process.stdout.write(`${JSON.stringify(failure(request, error, started))}\n`);
  }
}

for (const item of loginSessions.values()) await item.context.close().catch(() => {});
