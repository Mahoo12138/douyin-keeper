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
import { isAuthenticatedPage } from "./auth-state.mjs";
import { canCommitFriendSync } from "./friend-scan.mjs";
import { qrLoginState } from "./login-state.mjs";

const PROTOCOL_VERSION = 1;
const ADAPTER = "browser.consumer";
const ADAPTER_VERSION = "node-0.1.0";
const HOME_URL = "https://www.douyin.com/";
const CREATOR_HOME_URL = "https://creator.douyin.com/";
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

async function identity(page, { allowSelfFallback = true } = {}) {
  let result = await readIdentity(page);
  let nickname = result.candidates.map((candidate) => cleanIdentity(candidate.text)).find(Boolean) || "";
  if (!nickname && allowSelfFallback) {
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
  return { platform_user_id: String(uid || result.platform_user_id || "").slice(0, 128), nickname: nickname.slice(0, 64), avatar_url: avatar };
}

async function readIdentity(page) {
  try {
    return await page.evaluate(() => {
      const normalize = (value) => String(value || "").replace(/[\u200b\u200c\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim();
      const candidates = [];
      const add = (value, source) => { const text = normalize(value); if (text) candidates.push({ text, source }); };
      const xpathText = (path) => {
        const node = document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        return node?.textContent || "";
      };
      const creatorUserID = xpathText('//*[contains(@id, "garfish_app_for_douyin_creator_pc_home")]/div/div[2]/div/div[2]/div[1]/div[2]/div[1]/div[3]');
      add(xpathText('//*[contains(@id, "garfish_app_for_douyin_creator_pc_home")]/div/div[2]/div/div[2]/div[1]/div[2]/div[1]/div[1]/div[1]'), "creator-user-name");
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
      return { candidates, platform_user_id: normalize(creatorUserID), avatar_url: avatar?.content || avatar?.currentSrc || avatar?.src || "" };
    });
  } catch {
    return { candidates: [], platform_user_id: "", avatar_url: "" };
  }
}

async function readCreatorLoginState(page) {
  try {
    return await page.evaluate(() => {
      const visible = (node) => {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const ready = document.evaluate(
        '//*[contains(@id, "garfish_app_for_douyin_creator_pc_home")]/div/div[2]/div/div[2]/div[1]',
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      ).singleNodeValue;
      const uniqueId = document.evaluate(
        '//*[contains(@id, "garfish_app_for_douyin_creator_pc_home")]/div/div[2]/div/div[2]/div[1]/div[2]/div[1]/div[3]',
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      ).singleNodeValue;
      const name = document.evaluate(
        '//*[contains(@id, "garfish_app_for_douyin_creator_pc_home")]/div/div[2]/div/div[2]/div[1]/div[2]/div[1]/div[1]/div[1]',
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      ).singleNodeValue;
      return {
        authenticated: /\/creator-micro\//.test(location.href) || visible(ready),
        identityReady: Boolean(uniqueId?.textContent?.trim()) && Boolean(name?.textContent?.trim()),
        url: location.href,
      };
    });
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
}

async function startQr(input) {
  const profile = await profileDirectory(input);
  const { context, page } = await launchProfile(profile);
  try {
    if (input?.force_login === true) await context.clearCookies();
    await page.goto(CREATOR_HOME_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    if (input?.force_login === true || !(await hasSessionCookie(await sessionCookies(page)))) await clickLogin(page);
    const result = await waitForQrOrChallenge(page);
    if (!result.qr && !result.challenge) {
      await context.close();
      throw protocolError("QR_NOT_READY", "login QR code is not available", true);
    }
    const handle = `qr_${randomUUID().replaceAll("-", "")}`;
    const expiresAt = new Date(nowMs() + 180000).toISOString();
    loginSessions.set(handle, { context, page, profile, expiresAt, qrSeen: Boolean(result.qr) });
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
  const creatorState = await readCreatorLoginState(item.page);
  const cookies = await sessionCookies(item.page);
  const sessionCookie = hasSessionCookie(cookies);
  const qr = await qrDataUrl(item.page);
  if (qr) item.qrSeen = true;
  const state = qrLoginState({
    creatorAuthenticated: creatorState.authenticated,
    identityReady: creatorState.identityReady,
    sessionCookie,
    qrSeen: item.qrSeen,
    qrVisible: Boolean(qr),
  });
  if (state === "authenticated") {
    const result = await identity(item.page, { allowSelfFallback: false });
    if (!result.platform_user_id || !result.nickname) return { state: "scanned" };
    if (input?.export_session_file) await exportState(item.context, input.export_session_file);
    loginSessions.delete(handle);
    await item.context.close().catch(() => {});
    return { state: "authenticated", identity: result, session_exported: Boolean(input?.export_session_file) };
  }
  return { state };
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
    await page.goto(CREATOR_HOME_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
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
    try {
      await ensureAuthenticatedPage(item.page);
    } catch (error) {
      if (error.code === "CHALLENGE_REQUIRED") return { state: "challenge_required" };
      throw error;
    }
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
  try {
    const body = await page.locator("body").innerText({ timeout: 1500 });
    return values.some((value) => body.includes(value));
  } catch {
    return false;
  }
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
  if (!hasSessionCookie(await sessionCookies(page))) {
    throw protocolError("SESSION_EXPIRED", "session is no longer valid");
  }
  await page.goto(SELF_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  const deadline = nowMs() + 12000;
  let snapshot = { url: page.url(), hasProfileSignal: false, hasLoginSignal: false, bodyText: "" };
  while (nowMs() < deadline) {
    if (await challengeVisible(page)) {
      throw protocolError("CHALLENGE_REQUIRED", "platform challenge is required");
    }
    snapshot = await readAuthSnapshot(page);
    if (isAuthenticatedPage(snapshot)) return snapshot;
    await page.waitForTimeout(500);
  }
  throw protocolError("SESSION_EXPIRED", "session page is not authenticated", false, {
    reason: "logged_out_page",
    url: snapshot.url,
  });
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

function relationFriend(row) {
  if (!row || typeof row !== "object") return null;
  if (String(row.follow_status ?? "") !== "2") return null;
  const platformUserID = String(row.sec_uid || row.uid || "").trim();
  const displayName = String(row.remark_name || row.nickname || "").trim();
  if (!platformUserID || !displayName || displayName.length > 128) return null;
  const avatar = row.avatar_thumb || row.avatar_medium || row.avatar_larger;
  const avatarURL = typeof avatar === "string" ? avatar.trim() : avatar?.url_list?.[0]?.trim?.() || null;
  return {
    platform_user_id: platformUserID.slice(0, 256),
    identity_status: "resolved",
    display_name: displayName,
    nickname: String(row.nickname || displayName).trim().slice(0, 128),
    short_id: String(row.short_id || "").trim().slice(0, 128) || null,
    avatar_url: avatarURL || null,
    streak_days: 0,
    has_conversation: false,
    conversation: null,
  };
}

function attachFollowerCollector(page) {
  const collector = { friends: new Map(), hasMore: null, responseSeen: false, pending: new Set() };
  const consume = async (response) => {
    try {
      if (response.request().resourceType() !== "xhr" && response.request().resourceType() !== "fetch") return;
      const url = response.url().split("?", 1)[0];
      if (!url.endsWith("/aweme/v1/web/user/follower/list/")) return;
      const payload = await response.json();
      if (!payload || typeof payload !== "object") return;
      collector.responseSeen = true;
      const hasMore = payload.has_more ?? payload.data?.has_more;
      if (hasMore !== undefined && hasMore !== null) collector.hasMore = [1, "1", true, "true", "yes"].includes(hasMore);
      const walk = (value, depth = 0) => {
        if (depth > 6 || value === null || value === undefined) return;
        if (Array.isArray(value)) {
          for (const item of value.slice(0, 100)) walk(item, depth + 1);
          return;
        }
        if (typeof value !== "object") return;
        const friend = relationFriend(value);
        if (friend) collector.friends.set(friend.platform_user_id, friend);
        for (const child of Object.values(value)) walk(child, depth + 1);
      };
      walk(payload);
    } catch {
      // A response may disappear before its body is readable; the scan below
      // still requires a complete, non-empty collector before succeeding.
    }
  };
  page.on("response", (response) => {
    const pending = consume(response).finally(() => collector.pending.delete(pending));
    collector.pending.add(pending);
  });
  return collector;
}

async function flushFollowerCollector(collector) {
  if (collector.pending.size) await Promise.allSettled([...collector.pending]);
}

async function scrollFollowerList(page) {
  try {
    return await page.evaluate(() => {
      const visible = (node) => {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const scrollable = (node) => {
        const style = window.getComputedStyle(node);
        return /(auto|scroll)/.test(style.overflowY || "") && node.scrollHeight > node.clientHeight + 20;
      };
      const dialogs = [...document.querySelectorAll('[role="dialog"], [class*="modal" i], [class*="drawer" i]')].filter(visible);
      const scope = dialogs.at(-1) || document;
      const documentScroller = document.scrollingElement;
      const candidates = [
        ...(scope === document ? [] : [scope]),
        ...(scope.querySelectorAll ? [...scope.querySelectorAll("*")] : []),
        documentScroller,
      ].filter((node, index, all) => node && all.indexOf(node) === index && visible(node) && scrollable(node));
      const target = candidates.sort((left, right) =>
        (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight),
      ).at(0);
      if (!target) {
        window.scrollTo(0, documentScroller?.scrollHeight || 0);
        return { moved: false, atBottom: true };
      }
      const before = target.scrollTop;
      const next = Math.min(target.scrollHeight, before + Math.max(900, Math.floor(target.clientHeight * 0.9)));
      target.scrollTop = next;
      target.dispatchEvent(new Event("scroll", { bubbles: true }));
      return { moved: target.scrollTop > before, atBottom: target.scrollTop + target.clientHeight >= target.scrollHeight - 8 };
    });
  } catch {
    await page.mouse.wheel(0, 1200).catch(() => {});
    return { moved: true, atBottom: false };
  }
}

async function listFriends(input) {
  return withSession(input, async (page) => {
    await page.goto(SELF_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1800);
    const collector = attachFollowerCollector(page);
    const followers = page.locator("a").filter({ hasText: "粉丝" });
    let opened = false;
    for (let index = Math.min(await followers.count(), 8) - 1; index >= 0; index -= 1) {
      const item = followers.nth(index);
      if (await item.isVisible().catch(() => false)) {
        opened = await item.click({ timeout: 5000, force: true }).then(() => true).catch(() => false);
        if (opened) break;
      }
    }
    if (!opened) {
      const fallback = page.getByText("粉丝", { exact: true });
      for (let index = Math.min(await fallback.count(), 8) - 1; index >= 0; index -= 1) {
        const item = fallback.nth(index);
        if (await item.isVisible().catch(() => false)) {
          opened = await item.click({ timeout: 5000, force: true }).then(() => true).catch(() => false);
          if (opened) break;
        }
      }
    }
    if (!opened) throw protocolError("BROWSER_SELECTOR_CHANGED", "friend follower entry is unavailable");
    await page.waitForTimeout(4000);
    let stable = 0;
    let stuck = 0;
    let atBottom = false;
    let complete = false;
    let previousCount = 0;
    for (let round = 0; round < 120; round += 1) {
      await flushFollowerCollector(collector);
      if (collector.friends.size === previousCount) stable += 1;
      else stable = 0;
      previousCount = collector.friends.size;
      if (collector.responseSeen && collector.hasMore === false && stable >= 4) { complete = true; break; }
      if (collector.responseSeen && collector.hasMore === null && atBottom && stable >= 4) { complete = true; break; }
      if (collector.responseSeen && atBottom && stable >= 8) { complete = true; break; }
      const state = await scrollFollowerList(page);
      atBottom = Boolean(state?.atBottom);
      if (state?.moved) stuck = 0; else stuck += 1;
      if (!collector.responseSeen && stuck >= 8) break;
      if (stuck >= 8) atBottom = true;
      await page.waitForTimeout(900);
    }
    await flushFollowerCollector(collector);
    if (await visibleText(page, ["操作频繁", "请求过于频繁", "访问受限"])) throw protocolError("PLATFORM_RATE_LIMITED", "platform rate limit was detected");
    if (!canCommitFriendSync({ responseSeen: collector.responseSeen, friendCount: collector.friends.size, complete })) {
      throw protocolError("BROWSER_SELECTOR_CHANGED", "friend follower data was not completely loaded", false, {
        response_seen: collector.responseSeen,
        friend_count: collector.friends.size,
        has_more: collector.hasMore,
        at_bottom: atBottom,
      });
    }
    return { friends: [...collector.friends.values()], complete: true };
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
