import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { Blob } from "node:buffer";

const USER_AGENT =
  process.env.HUOHUA_PROTOCOL_UA ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CREATOR_CHAT = "https://creator.douyin.com/creator-micro/data/following/chat";
const TOKEN_URL = "https://creator.douyin.com/aweme/v1/creator/im/user_token/";
const IDENTITY_URL = "https://creator.douyin.com/passport/safe/get_identity_security_token/";
const IM_API = "https://imapi.douyin.com";
const IM_WS = "wss://frontier-im.douyin.com/ws/v2";

// 创作者中心 webpack 包。哈希会过期，加载失败时回落浏览器通道，不要当作永久依赖。
const SDK_BUNDLES = [
  "https://lf-fe-creator.douyinstatic.com/obj/douyn-creator-scm-cdn/douyin-creator-mono-pc-data/static/js/lib-polyfill.f81f86eb.js",
  "https://lf-fe-creator.douyinstatic.com/obj/douyn-creator-scm-cdn/douyin-creator-mono-pc-data/static/js/lib-router.5ab9ff10.js",
  "https://lf-fe-creator.douyinstatic.com/obj/douyn-creator-scm-cdn/douyin-creator-mono-pc-data/static/js/2105.f8d74876.js",
  "https://lf-fe-creator.douyinstatic.com/obj/douyn-creator-scm-cdn/douyin-creator-mono-pc-data/static/js/douyin_creator_data_old.2f971672.js",
  "https://lf-fe-creator.douyinstatic.com/obj/douyn-creator-scm-cdn/douyin-creator-mono-pc-data/static/js/async/pages-chat.c817de31.js",
];

function cookieParts(state) {
  const cookies = state?.cookies || [];
  const map = {};
  const parts = [];
  for (const item of cookies) {
    if (!item?.name) continue;
    map[item.name] = item.value ?? "";
    parts.push(`${item.name}=${item.value ?? ""}`);
  }
  return { map, header: parts.join("; ") };
}

function creatorHeaders(cookieHeader, cookieMap) {
  return {
    "User-Agent": USER_AGENT,
    Referer: CREATOR_CHAT,
    Origin: "https://creator.douyin.com",
    Accept: "application/json, text/javascript",
    Cookie: cookieHeader,
    "x-tt-passport-csrf-token": cookieMap.passport_csrf_token || cookieMap.passport_csrf_token_default || "",
  };
}

async function readJSON(url, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  const res = await fetch(url, { headers, signal: ctrl.signal });
  clearTimeout(timer);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { res, text, data };
}

export function loadState(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw Object.assign(new Error("缺少登录态文件"), { code: "no_session" });
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export async function fetchIdentity(cookieHeader, cookieMap) {
  const qs = new URLSearchParams({
    aid: "2906",
    app_name: "aweme_creator_platform",
    device_platform: "web",
    user_agent: USER_AGENT,
    cookie_enabled: "true",
  });
  const { res, data } = await readJSON(`${TOKEN_URL}?${qs}`, creatorHeaders(cookieHeader, cookieMap));
  if (!res.ok || data?.status_code !== 0 || !data?.user_id) {
    throw Object.assign(new Error("创作者 IM token 拉取失败"), { code: "protocol_unavailable" });
  }
  return { userId: String(data.user_id), token: String(data.token || "") };
}

async function fetchSecurity(cookieHeader, cookieMap) {
  const qs = new URLSearchParams({
    scene: "im_send_msg",
    aid: "2906",
    language: "zh",
    id_token_version: "2.1.5",
  });
  const { data } = await readJSON(`${IDENTITY_URL}?${qs}`, creatorHeaders(cookieHeader, cookieMap));
  if (data?.message !== "success" || !data?.data?.identity_security_token) {
    return { header: "", deviceId: "" };
  }
  return {
    header: JSON.stringify({ token: data.data.identity_security_token }),
    deviceId: String(data.data.device_id || ""),
  };
}

async function ensureBundles(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
  for (const url of SDK_BUNDLES) {
    const name = url.split("/").pop();
    const dest = path.join(dir, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 100) continue;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      throw Object.assign(new Error("创作者 SDK 资源已过期或不可达"), { code: "protocol_unavailable" });
    }
    await fs.promises.writeFile(dest, await res.text(), "utf8");
  }
}

function bootWebpack(bundleDir, cookieHeader) {
  const modules = {};
  const cache = {};
  function req(id) {
    if (cache[id]) return cache[id].exports;
    if (!modules[id]) throw new Error("missing " + id);
    const mod = { exports: {} };
    cache[id] = mod;
    modules[id].call(mod.exports, mod, mod.exports, req);
    return mod.exports;
  }
  req.d = (exp, def) => {
    for (const k of Object.keys(def)) {
      if (!Object.prototype.hasOwnProperty.call(exp, k)) Object.defineProperty(exp, k, { enumerable: true, get: def[k] });
    }
  };
  req.o = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);
  req.r = (exp) => {
    Object.defineProperty(exp, "__esModule", { value: true });
  };
  req.n = (mod) => {
    const g = mod && mod.__esModule ? () => mod.default : () => mod;
    req.d(g, { a: g });
    return g;
  };
  req.g = globalThis;
  const chunks = [];
  chunks.push = (chunk) => Object.assign(modules, chunk[1]);
  const fakeEl = () => ({
    style: {},
    setAttribute() {},
    appendChild() {},
    removeChild() {},
    addEventListener() {},
    removeEventListener() {},
    getContext: () => ({}),
  });
  const sandbox = {
    self: { webpackChunkdouyin_creator_data: chunks },
    window: {},
    globalThis: null,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Buffer,
    TextDecoder,
    TextEncoder,
    Blob,
    document: {
      cookie: cookieHeader,
      referrer: CREATOR_CHAT,
      createElement: fakeEl,
      getElementsByTagName: () => [],
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      removeEventListener() {},
      body: { appendChild() {}, removeChild() {} },
      head: { appendChild() {}, removeChild() {} },
      documentElement: { style: {} },
    },
    navigator: { userAgent: USER_AGENT, language: "zh-CN", cookieEnabled: true, onLine: true, platform: "Win32" },
    location: {
      href: CREATOR_CHAT,
      protocol: "https:",
      pathname: "/creator-micro/data/following/chat",
      hostname: "creator.douyin.com",
      search: "",
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    performance: { now: () => Date.now() },
    fetch,
    XMLHttpRequest: function () {
      this.open = () => {};
      this.setRequestHeader = () => {};
      this.send = () => {};
    },
    WebSocket: function () {
      this.readyState = 1;
      this.send = () => {};
      this.close = () => {};
    },
    URL,
    URLSearchParams,
    atob: (v) => Buffer.from(v, "base64").toString("binary"),
    btoa: (v) => Buffer.from(v, "binary").toString("base64"),
    crypto,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  for (const name of fs.readdirSync(bundleDir).filter((n) => n.endsWith(".js")).sort()) {
    try {
      vm.runInNewContext(fs.readFileSync(path.join(bundleDir, name), "utf8"), sandbox, { filename: name });
    } catch {
      // 部分入口在注册模块后会走浏览器专用代码，忽略即可
    }
  }
  return { req, modules };
}

function pickExport(req, modules, test) {
  for (const id of Object.keys(modules)) {
    try {
      const exp = req(id);
      if (exp && test(exp)) return exp;
    } catch {
      // skip broken modules
    }
  }
  return null;
}

function asId(v) {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v.toString === "function") return v.toString();
  return "";
}

function peerOf(conversation, selfId) {
  const list = conversation?.participants || conversation?.participant || [];
  for (const p of list) {
    const id = asId(p?.user_id);
    if (id && id !== selfId) return p;
  }
  return null;
}

async function openClient(bundleDir, cookieHeader, userId) {
  const { req, modules } = bootWebpack(bundleDir, cookieHeader);
  const sdk = pickExport(req, modules, (e) => e.BasePlugin && e.IMHttpClient && e.im_proto);
  const im = pickExport(req, modules, (e) => e.BytedIM);
  if (!sdk || !im?.BytedIM) {
    throw Object.assign(new Error("创作者 IM SDK 未加载到 BytedIM"), { code: "protocol_unavailable" });
  }
  class Extra extends sdk.BasePlugin {
    install() {}
    async sendPacket(packet) {
      packet.device_id = 0;
      packet.device_platform = "douyin_creator";
      packet.headers = { ...(packet.headers || {}), aid_new: 2906, app_name: "douyin_creator" };
      return packet;
    }
  }
  class Http extends sdk.IMHttpClient {
    async send(url, method, body) {
      const full = /^https?:/i.test(url) ? url : `${String(this.option.apiUrl).replace(/\/$/, "")}/${String(url).replace(/^\//, "")}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(full, {
        method,
        headers: this.headers,
        body: body ? Buffer.from(body) : undefined,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      return res.arrayBuffer();
    }
    sendByBeacon() {
      return false;
    }
  }
  const client = new im.BytedIM(
    {
      appId: 2906,
      fpId: 9,
      appKey: "e1bd35ec9db7b8d846de66ed140b1ad9",
      service: 5,
      apiUrl: IM_API,
      frontierUrl: IM_WS,
      inboxType: 1,
      token: "",
      userId,
      deviceId: userId,
      authType: sdk.im_proto.AuthType.SESSION_AUTH,
      devicePlatform: "douyin_pc",
      timeout: 20000,
      acceptIncorrectInboxType: true,
      biz: "douyin_creator",
      withCredentials: false,
      httpHeaders: { "User-Agent": USER_AGENT, Referer: CREATOR_CHAT, Origin: "https://creator.douyin.com", Cookie: cookieHeader },
      headers: {},
      webSocketLevel: sdk.WebSocketLevel?.PushOnly ?? 0,
      debug: false,
      http: (ctx) => new Http(ctx),
    },
    [Extra],
  );
  const init = await client.init();
  if (sdk.InitResult && init !== sdk.InitResult.Succeeded) {
    throw Object.assign(new Error("创作者 IM 初始化失败"), { code: "protocol_unavailable" });
  }
  return { client, sdk };
}

export async function listConversations(statePath) {
  const state = loadState(statePath);
  const { header, map } = cookieParts(state);
  const ident = await fetchIdentity(header, map);
  const cacheDir = path.join(path.dirname(statePath), "protocol-sdk");
  await ensureBundles(cacheDir);
  const { client } = await openClient(cacheDir, header, ident.userId);
  const list = await client.getConversationListOnline();
  const out = [];
  for (const c of list || []) {
    if (c?.type !== 1) continue;
    const peer = peerOf(c, ident.userId);
    if (!peer) continue;
    out.push({
      conversation_id: asId(c.id),
      peer_user_id: asId(peer.user_id),
      nickname: String(peer.nickname || peer.nick_name || "").trim(),
    });
  }
  return out;
}

export async function sendText(statePath, friendName, body, dryRun) {
  const want = String(friendName || "").trim();
  if (!want || !body) {
    throw Object.assign(new Error("缺少好友或正文"), { code: "bad_request" });
  }
  const state = loadState(statePath);
  const { header, map } = cookieParts(state);
  const ident = await fetchIdentity(header, map);
  const cacheDir = path.join(path.dirname(statePath), "protocol-sdk");
  await ensureBundles(cacheDir);
  const { client } = await openClient(cacheDir, header, ident.userId);
  const list = await client.getConversationListOnline();
  let conversation = null;
  for (const c of list || []) {
    if (c?.type !== 1) continue;
    const peer = peerOf(c, ident.userId);
    const nick = String(peer?.nickname || peer?.nick_name || "").trim();
    if (nick === want) {
      conversation = client.getConversation({ conversationId: c.id }) || c;
      break;
    }
  }
  if (!conversation) {
    throw Object.assign(new Error("协议通道未找到该会话"), { code: "conversation_not_found" });
  }
  if (dryRun) {
    return { ok: true, confirmed: true, dry_run: true, platform_msg_id: "" };
  }
  const security = await fetchSecurity(header, map);
  if (security.header && typeof client.updateSendMessageHeaders === "function") {
    client.updateSendMessageHeaders({
      identity_security_token: security.header,
      identity_security_device_id: security.deviceId,
      identity_security_aid: "2906",
    });
  }
  const message = await client.createMessage({
    type: 7,
    content: JSON.stringify({ text: body, aweType: 774 }),
    conversation,
    insert: false,
  });
  const sent = await client.sendMessage({ message });
  const status = sent?.statusCode ?? sent?.status ?? -1;
  const mid = String(sent?.serverId || sent?.messageId || sent?.clientId || message?.serverId || message?.messageId || "");
  if (status !== 0 && sent?.success !== true) {
    throw Object.assign(new Error(sent?.statusMsg || "协议发送未确认"), { code: "protocol_unavailable" });
  }
  return { ok: true, confirmed: true, platform_msg_id: mid || "im:0" };
}
