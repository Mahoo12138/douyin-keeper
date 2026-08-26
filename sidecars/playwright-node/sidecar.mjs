#!/usr/bin/env node

/**
 * Node.js Playwright sidecar.
 *
 * Go remains the control plane and source of truth. This process owns only
 * browser contexts, platform operations, and the v1 NDJSON protocol.
 */

import { chmod, mkdir, readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const PROTOCOL_VERSION = 1;
const ADAPTER = "browser.consumer";
const ADAPTER_VERSION = "node-0.1.0";
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
];
const QR_SELECTORS = [
  "#animate_qrcode_container img, #animate_qrcode_container canvas",
  "#douyin_login_comp_scan_code img, #douyin_login_comp_scan_code canvas",
  "img[class*='qrcode' i], img[id*='qrcode' i], canvas[class*='qrcode' i], canvas[id*='qrcode' i]",
];
const SMS_PHONE_SELECTORS = ["input[type='tel']", "input[placeholder*='手机号']", "input[placeholder*='手机']"];
const SMS_CODE_SELECTORS = ["input[autocomplete='one-time-code']", "input[placeholder*='验证码']", "input[inputmode='numeric']"];
const loginSessions = new Map();

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
  const current = await context.cookies();
  if (hasSessionCookie(current)) return;
  const state = await sessionState(statePath);
  if (state.cookies.length) await context.addCookies(state.cookies);
}

async function launchProfile(directory, statePath) {
  const profile = await privateDirectory(directory);
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH?.trim() || undefined;
  const context = await chromium.launchPersistentContext(profile, {
    headless: headless(),
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    viewport: { width: 1280, height: 720 },
  });
  try {
    await seedProfile(context, statePath);
  } catch (error) {
    await context.close();
    throw error;
  }
  const page = context.pages()[0] || await context.newPage();
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
  for (const selector of LOGIN_BUTTONS) {
    try {
      const locator = page.locator(selector);
      const count = Math.min(await locator.count(), 4);
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        if (await candidate.isVisible()) {
          await candidate.click({ timeout: 5000 });
          return true;
        }
      }
    } catch {
      // Selector drift is expected; try the next supported shape.
    }
  }
  return false;
}

async function qrDataUrl(page) {
  try {
    const value = await page.evaluate(() => {
      const selectors = [
        "#animate_qrcode_container img, #animate_qrcode_container canvas",
        "#douyin_login_comp_scan_code img, #douyin_login_comp_scan_code canvas",
        "img[class*='qrcode' i], img[id*='qrcode' i], canvas[class*='qrcode' i], canvas[id*='qrcode' i]",
      ];
      const specific = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
      const fallback = [...document.querySelectorAll("img, canvas")].filter((node) => !specific.includes(node));
      for (const node of [...specific, ...fallback]) {
        const rect = node.getBoundingClientRect();
        const width = Math.max(rect.width || 0, node.naturalWidth || 0, node.width || 0);
        const height = Math.max(rect.height || 0, node.naturalHeight || 0, node.height || 0);
        if (width < 100 || height < 100 || width / height < 0.75 || width / height > 1.33) continue;
        if (node.tagName === "CANVAS" && node.toDataURL) {
          try {
            const data = node.toDataURL("image/png");
            if (data.length > 200) return data;
          } catch {}
        }
        const src = node.currentSrc || node.src || "";
        if (src.startsWith("data:image") && src.length > 200) return src;
      }
      return "";
    });
    return value || "";
  } catch {
    return "";
  }
}

async function waitForQrOrChallenge(page) {
  let challenge = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const qr = await qrDataUrl(page);
    if (qr) return { qr, challenge: false };
    challenge ||= await challengeVisible(page);
    await page.waitForTimeout(250);
  }
  return { qr: "", challenge };
}

function cleanIdentity(value) {
  const text = String(value || "").replace(/[\u200b\u200c\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim().replace(/^@+/, "");
  if (!text || text.length > 64 || new Set(["我的", "抖音", "登录", "登录 / 注册", "登录注册"]).has(text)) return "";
  if (["登录", "注册", "关注", "粉丝", "获赞", "作品", "喜欢", "收藏", "观看历史"].some((token) => text.includes(token))) return "";
  return text;
}

async function identity(page) {
  let result = await readIdentity(page);
  let nickname = result.candidates.map((candidate) => cleanIdentity(candidate.text)).find(Boolean) || "";
  if (!nickname) {
    try {
      await page.goto(SELF_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    } catch {}
    result = await readIdentity(page);
    nickname = result.candidates.map((candidate) => cleanIdentity(candidate.text)).find(Boolean) || "";
  }
  const avatar = /^https?:\/\//.test(result.avatar_url || "") ? result.avatar_url : null;
  const cookies = await sessionCookies(page);
  const uid = cookies.find((cookie) => ["uid_tt", "uid_tt_ss", "sid_uid"].includes(cookie.name) && cookie.value)?.value || "";
  return { platform_user_id: String(uid).slice(0, 128), nickname: nickname.slice(0, 64), avatar_url: avatar };
}

async function readIdentity(page) {
  try {
    return await page.evaluate(() => {
      const normalize = (value) => String(value || "").replace(/[\u200b\u200c\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim();
      const candidates = [];
      const add = (value, source) => { const text = normalize(value); if (text) candidates.push({ text, source }); };
      add(document.querySelector('[data-e2e="user-title"]')?.innerText, "data-e2e=user-title");
      add(document.querySelector('[class*="userName"], [class*="UserName"], [class*="nickname"], [class*="Nickname"], h1')?.innerText, "profile-name-selector");
      add(document.title.split(/[｜|\-]/)[0], "document-title");
      add(document.querySelector('meta[property="og:title"]')?.content?.split(/[｜|\-]/)[0], "og:title");
      const selfLink = document.querySelector('a[href*="/user/self"]');
      if (selfLink) {
        const root = selfLink.closest("div")?.parentElement?.parentElement || selfLink;
        add(normalize(root.innerText).split(/关注|粉丝|获赞|我的喜欢|我的收藏|观看历史|稍后再看|我的作品|我的预约|我的订单|退出登录/)[0], "self-link-root");
      }
      const avatar = document.querySelector('[data-e2e="user-avatar"] img, [class*="avatar" i] img, meta[property="og:image"]');
      return { candidates, avatar_url: avatar?.content || avatar?.currentSrc || avatar?.src || "" };
    });
  } catch {
    return { candidates: [], avatar_url: "" };
  }
}

async function exportState(context, exportPath) {
  if (typeof exportPath !== "string" || !isAbsolute(exportPath) || ["/", "/tmp", "/run"].includes(exportPath)) {
    throw protocolError("INVALID_REQUEST", "export_session_file must be a private absolute path");
  }
  await mkdir(dirname(exportPath), { recursive: true, mode: 0o700 });
  await context.storageState({ path: exportPath });
  await chmod(exportPath, 0o600);
}

async function startQr(input) {
  const profile = await profileDirectory(input);
  const { context, page } = await launchProfile(profile);
  try {
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    if (!(await hasSessionCookie(await sessionCookies(page)))) await clickLogin(page);
    const result = await waitForQrOrChallenge(page);
    if (!result.qr && !result.challenge) {
      await context.close();
      throw protocolError("QR_NOT_READY", "login QR code is not available", true);
    }
    const handle = `qr_${randomUUID().replaceAll("-", "")}`;
    const expiresAt = new Date(nowMs() + 180000).toISOString();
    loginSessions.set(handle, { context, page, profile, expiresAt });
    return {
      login_handle: handle,
      state: result.challenge ? "challenge_required" : "waiting",
      qr: { format: result.qr ? "data_url" : "none", value: result.qr, expires_at: expiresAt },
    };
  } catch (error) {
    if (!loginSessions.values().some((item) => item.context === context)) await context.close().catch(() => {});
    throw error;
  }
}

async function pollQr(input) {
  const handle = input?.login_handle;
  const item = loginSessions.get(handle);
  if (!item) throw protocolError("LOGIN_HANDLE_NOT_FOUND", "login handle is unavailable");
  if (Date.now() >= Date.parse(item.expiresAt)) {
    loginSessions.delete(handle);
    await item.context.close().catch(() => {});
    throw protocolError("QR_EXPIRED", "login QR session expired");
  }
  if (await challengeVisible(item.page)) return { state: "challenge_required" };
  const cookies = await sessionCookies(item.page);
  if (hasSessionCookie(cookies) && !(await challengeVisible(item.page))) {
    if (input?.export_session_file) await exportState(item.context, input.export_session_file);
    const result = await identity(item.page);
    loginSessions.delete(handle);
    await item.context.close().catch(() => {});
    return { state: "authenticated", identity: result, session_exported: Boolean(input?.export_session_file) };
  }
  const qr = await qrDataUrl(item.page);
  if (!qr) await clickLogin(item.page);
  return { state: "waiting" };
}

async function cancelLogin(input) {
  const item = loginSessions.get(input?.login_handle);
  if (item) {
    loginSessions.delete(input.login_handle);
    await item.context.close().catch(() => {});
  }
  return { state: "cancelled" };
}

async function clickText(page, values) {
  for (const value of values) {
    const locator = page.getByText(value, { exact: false });
    const count = Math.min(await locator.count().catch(() => 0), 6);
    for (let index = 0; index < count; index += 1) {
      const item = locator.nth(index);
      if (await item.isVisible().catch(() => false)) {
        await item.click({ timeout: 5000, force: true }).catch(() => {});
        return true;
      }
    }
  }
  return false;
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

async function startSms(input) {
  if (typeof input?.phone !== "string" || input.phone.trim().length < 5 || input.phone.trim().length > 32) {
    throw protocolError("INVALID_REQUEST", "phone must be 5..32 characters");
  }
  const profile = await profileDirectory(input);
  const { context, page } = await launchProfile(profile);
  try {
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await clickLogin(page);
    await clickText(page, ["短信登录", "验证码登录", "手机登录"]);
    const phone = await firstVisible(page, SMS_PHONE_SELECTORS);
    if (!phone) throw protocolError("BROWSER_SELECTOR_CHANGED", "SMS phone input is unavailable");
    await phone.fill(input.phone.trim());
    if (!await clickText(page, ["获取验证码", "发送验证码", "发送验证码登录"])) throw protocolError("BROWSER_SELECTOR_CHANGED", "SMS code button is unavailable");
    const handle = `sms_${randomUUID().replaceAll("-", "")}`;
    const expiresAt = new Date(nowMs() + 300000).toISOString();
    loginSessions.set(handle, { context, page, profile, expiresAt, kind: "sms" });
    return { login_handle: handle, expires_at: expiresAt };
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}

async function verifySms(input) {
  const handle = input?.login_handle;
  const code = typeof input?.code === "string" ? input.code.trim() : "";
  if (!/^\d{4,8}$/.test(code)) throw protocolError("INVALID_REQUEST", "code must be 4..8 digits");
  const item = loginSessions.get(handle);
  if (!item || item.kind !== "sms") throw protocolError("LOGIN_HANDLE_NOT_FOUND", "login handle is unavailable");
  if (nowMs() >= Date.parse(item.expiresAt)) {
    loginSessions.delete(handle);
    await item.context.close().catch(() => {});
    throw protocolError("SMS_CODE_EXPIRED", "SMS verification session expired");
  }
  const inputBox = await firstVisible(item.page, SMS_CODE_SELECTORS);
  if (!inputBox) throw protocolError("BROWSER_SELECTOR_CHANGED", "SMS code input is unavailable");
  await inputBox.fill(code);
  if (!await clickText(item.page, ["登录", "确定", "提交"])) throw protocolError("BROWSER_SELECTOR_CHANGED", "SMS submit button is unavailable");
  await item.page.waitForTimeout(1000);
  if (await visibleText(item.page, ["验证码错误", "验证码无效", "验证码过期"])) throw protocolError("SMS_CODE_INVALID", "SMS verification code is invalid");
  if (await challengeVisible(item.page)) {
    loginSessions.delete(handle);
    await item.context.close().catch(() => {});
    return { state: "challenge_required" };
  }
  if (hasSessionCookie(await sessionCookies(item.page))) {
    if (input.export_session_file) await exportState(item.context, input.export_session_file);
    const result = await identity(item.page);
    loginSessions.delete(handle);
    await item.context.close().catch(() => {});
    return { state: "authenticated", identity: result, session_exported: Boolean(input.export_session_file) };
  }
  return { state: "waiting", session_exported: false };
}

async function validateSession(input) {
  const session = sessionInput(input);
  if (session.profile_dir) {
    const { context, page } = await launchProfile(session.profile_dir, session.path);
    try {
      const cookies = await sessionCookies(page);
      return { valid: hasSessionCookie(cookies), state: hasSessionCookie(cookies) ? "valid" : "expired" };
    } finally {
      await context.close();
    }
  }
  const state = await sessionState(session.path);
  return { valid: hasSessionCookie(state.cookies), state: hasSessionCookie(state.cookies) ? "valid" : "expired" };
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
    const cookies = await sessionCookies(runtime.page);
    if (!hasSessionCookie(cookies)) throw protocolError("SESSION_EXPIRED", "session is no longer valid");
    if (await challengeVisible(runtime.page)) throw protocolError("CHALLENGE_REQUIRED", "platform challenge is required");
    return await operation(runtime.page, runtime.context);
  } finally {
    await runtime.context.close().catch(() => {});
    if (runtime.browser) await runtime.browser.close().catch(() => {});
  }
}

async function visibleText(page, values) {
  try {
    const body = await page.locator("body").innerText({ timeout: 1500 });
    return values.some((value) => body.includes(value));
  } catch {
    return false;
  }
}

async function openMessagePanel(page) {
  const candidates = [
    page.getByText("消息", { exact: true }),
    page.locator("[aria-label*='消息'], [title*='消息']"),
  ];
  for (const locator of candidates) {
    try {
      const count = Math.min(await locator.count(), 5);
      for (let index = count - 1; index >= 0; index -= 1) {
        const item = locator.nth(index);
        if (await item.isVisible()) {
          await item.click({ timeout: 5000, force: true });
          await page.waitForTimeout(1000);
          return true;
        }
      }
    } catch {}
  }
  return false;
}

async function listFriends(input) {
  return withSession(input, async (page) => {
    await page.goto(SELF_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    const followers = page.getByText("粉丝", { exact: true });
    for (let index = Math.min(await followers.count(), 8) - 1; index >= 0; index -= 1) {
      const item = followers.nth(index);
      if (await item.isVisible().catch(() => false)) {
        await item.click({ timeout: 5000, force: true }).catch(() => {});
        break;
      }
    }
    await page.waitForTimeout(1500);
    const seen = new Map();
    let stable = 0;
    for (let round = 0; round < 120 && stable < 8; round += 1) {
      const rows = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll("[data-e2e*='user'], [class*='UserInfo'], [class*='user-info'], a[href*='/user/']")];
        return nodes.map((node) => {
          const root = node.closest("li, [class*='item'], [class*='Item']") || node;
          const links = [root, ...root.querySelectorAll?.("a[href]") || []];
          const href = links.map((item) => item.getAttribute?.("href") || "").find((value) => /\/user\//.test(value)) || "";
          const id = root.getAttribute?.("data-user-id") || root.getAttribute?.("data-uid") || href.match(/\/user\/([^/?#]+)/)?.[1] || "";
          const text = (node.innerText || root.innerText || "").replace(/\s+/g, " ").trim();
          const avatar = root.querySelector?.("img")?.currentSrc || root.querySelector?.("img")?.src || "";
          return { platform_user_id: id, nickname: text.slice(0, 128), display_name: text.slice(0, 128), avatar_url: avatar || null };
        });
      });
      const before = seen.size;
      for (const row of rows) if (row.platform_user_id && row.nickname) seen.set(row.platform_user_id, row);
      stable = seen.size === before ? stable + 1 : 0;
      await page.mouse.wheel(0, 900).catch(() => {});
      await page.waitForTimeout(700);
    }
    if (await visibleText(page, ["操作频繁", "请求过于频繁", "访问受限"])) throw protocolError("PLATFORM_RATE_LIMITED", "platform rate limit was detected");
    if (!seen.size) throw protocolError("BROWSER_SELECTOR_CHANGED", "friend list data is unavailable");
    return { friends: [...seen.values()].map((item) => ({ ...item, identity_status: "resolved", short_id: null, streak_days: 0, has_conversation: false, conversation: null })), complete: true };
  });
}

async function listConversations(input) {
  const limit = Number.isInteger(input?.limit) ? Math.min(Math.max(input.limit, 1), 100) : 100;
  const cursor = input?.cursor || null;
  return withSession(input, async (page) => {
    await page.goto("https://www.douyin.com/chat?isPopup=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    await openMessagePanel(page);
    const seen = new Map();
    let stable = 0;
    for (let round = 0; round < 24 && stable < 3; round += 1) {
      const rows = await page.evaluate(() => [...document.querySelectorAll("[class*='conversationConversationItem'], [data-conversation-id]")].map((row) => {
        const link = row.querySelector?.("a[href]");
        const conversation = row.getAttribute?.("data-conversation-id") || row.getAttribute?.("data-conversationid") || row.getAttribute?.("data-id") || link?.getAttribute?.("href")?.match(/conversation[_-]?id=([^&#]+)/)?.[1] || "";
        const peer = row.getAttribute?.("data-user-id") || row.getAttribute?.("data-uid") || link?.getAttribute?.("href")?.match(/(?:uid|user_id)=([^&#]+)/)?.[1] || "";
        const title = row.querySelector?.("[class*='title'], [class*='Title'], .conversationConversationItemtitle")?.textContent || row.textContent || "";
        return { platform_conversation_id: conversation, peer_platform_user_id: peer, peer_display_name: title.replace(/\s+/g, " ").trim().slice(0, 128), channel: "consumer", last_message_at: null };
      }).filter((row) => row.platform_conversation_id));
      const before = seen.size;
      for (const row of rows) seen.set(row.platform_conversation_id, row);
      stable = seen.size === before ? stable + 1 : 0;
      await page.mouse.wheel(0, 900).catch(() => {});
      await page.waitForTimeout(700);
    }
    const values = [...seen.values()];
    const start = cursor ? Math.max(values.findIndex((item) => item.platform_conversation_id === cursor) + 1, 0) : 0;
    const items = values.slice(start, start + limit);
    const next = values[start + limit]?.platform_conversation_id || null;
    if (!items.length && cursor) throw protocolError("INVALID_REQUEST", "conversation cursor is no longer available", false, { operation: "conversations.list", reason: "cursor_not_found" });
    return { items, next_cursor: next };
  });
}

async function clickConversation(page, conversationID, peerID) {
  return page.evaluate(({ conversationID: wantedConversation, peerID: wantedPeer }) => {
    const nodes = [...document.querySelectorAll("[class*='conversationConversationItem'], [data-conversation-id], [data-id]")];
    const node = nodes.find((item) => {
      const conversation = item.getAttribute("data-conversation-id") || item.getAttribute("data-conversationid") || item.getAttribute("data-id") || "";
      const peer = item.getAttribute("data-user-id") || item.getAttribute("data-uid") || "";
      return conversation === wantedConversation || (wantedPeer && peer === wantedPeer);
    });
    if (!node) return false;
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }, { conversationID, peerID });
}

async function sendText(input) {
  const target = input?.target;
  const message = input?.message;
  if (!target || typeof target.platform_conversation_id !== "string" || !message || typeof message.text !== "string" || !message.text.trim()) {
    throw protocolError("INVALID_REQUEST", "target and message.text are required");
  }
  return withSession(input, async (page) => {
    await page.goto("https://www.douyin.com/chat?isPopup=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    await openMessagePanel(page);
    if (!await clickConversation(page, target.platform_conversation_id, target.platform_user_id)) {
      throw protocolError("CONVERSATION_NOT_FOUND", "conversation was not found");
    }
    const editor = page.locator("[contenteditable='true'], textarea, [role='textbox']");
    const count = Math.min(await editor.count(), 8);
    let inputBox = null;
    for (let index = 0; index < count; index += 1) if (await editor.nth(index).isVisible().catch(() => false)) { inputBox = editor.nth(index); break; }
    if (!inputBox) throw protocolError("BROWSER_SELECTOR_CHANGED", "message editor is unavailable");
    await inputBox.fill(message.text.trim());
    const sendButton = page.getByText("发送", { exact: true });
    const sendCount = Math.min(await sendButton.count(), 5);
    for (let index = 0; index < sendCount; index += 1) if (await sendButton.nth(index).isVisible().catch(() => false)) { await sendButton.nth(index).click({ force: true }); break; }
    await page.waitForTimeout(1200);
    const receipt = await page.evaluate((text) => {
      const nodes = [...document.querySelectorAll("[data-message-id], [data-msg-id], [data-messageid]")].reverse();
      const node = nodes.find((item) => (item.textContent || "").includes(text));
      return node?.getAttribute("data-message-id") || node?.getAttribute("data-msg-id") || node?.getAttribute("data-messageid") || "";
    }, message.text.trim());
    if (!receipt) throw protocolError("ADAPTER_INCOMPATIBLE", "message receipt was not confirmed", false, { outcome: "unknown" });
    return { confirmed: true, platform_message_id: receipt };
  });
}

async function archiveConversation(input) {
  const target = input?.target;
  if (!target || typeof target.platform_conversation_id !== "string" || typeof input.archived !== "boolean") {
    throw protocolError("INVALID_REQUEST", "target and archived are required");
  }
  return withSession(input, async (page) => {
    await page.goto("https://www.douyin.com/chat?isPopup=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1200);
    await openMessagePanel(page);
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
    await page.goto("https://www.douyin.com/chat?isPopup=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1200);
    await openMessagePanel(page);
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
      capabilities: ["login.qr", "login.sms", "session.validate", "friends.sync", "conversations.sync", "message.send.text.existing", "message.send.sticker.existing"],
    };
  }
  if (request.op === "login.qr.start") return startQr(request.input);
  if (request.op === "login.qr.poll") return pollQr(request.input);
  if (request.op === "login.qr.cancel") return cancelLogin(request.input);
  if (request.op === "login.sms.start") return startSms(request.input);
  if (request.op === "login.sms.verify") return verifySms(request.input);
  if (request.op === "session.validate") return validateSession(request.input);
  if (request.op === "friends.list") return listFriends(request.input);
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
    const result = await handle(request);
    process.stdout.write(`${JSON.stringify(success(request, result, started))}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(failure(request, error, started))}\n`);
  }
}

for (const item of loginSessions.values()) await item.context.close().catch(() => {});
