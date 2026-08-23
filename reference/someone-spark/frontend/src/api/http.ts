import axios from "axios";
type ApiError = { code?: string; message?: string };
const CSRF_COOKIE = "huohua_csrf";
const CSRF_HEADER = "X-CSRF-Token";
const http = axios.create({
  baseURL: "",
  withCredentials: true,
  timeout: 15000,
  xsrfCookieName: CSRF_COOKIE,
  xsrfHeaderName: CSRF_HEADER
});
let csrfToken = "";
let csrfInflight: Promise<string> | null = null;
function readCookie(name: string): string {
  const m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&") + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : "";
}
function attachCsrf(headers: { set?: (k: string, v: string) => void } & Record<string, unknown>, token: string) {
  if (typeof headers.set === "function") {
    headers.set(CSRF_HEADER, token);
    return;
  }
  headers[CSRF_HEADER] = token;
}
export async function ensureCsrf(force = false): Promise<string> {
  if (!force) {
    const fromCookie = readCookie(CSRF_COOKIE);
    if (fromCookie) {
      csrfToken = fromCookie;
      return fromCookie;
    }
    if (csrfToken) return csrfToken;
  }
  if (csrfInflight) return csrfInflight;
  csrfInflight = http
    .get("/api/v1/csrf")
    .then(({ data }) => {
      csrfToken = String(data?.data?.csrf || readCookie(CSRF_COOKIE) || "");
      return csrfToken;
    })
    .finally(() => {
      csrfInflight = null;
    });
  return csrfInflight;
}
http.interceptors.request.use(async (config) => {
  const method = (config.method || "get").toLowerCase();
  if (method !== "get" && method !== "head" && method !== "options") {
    const token = await ensureCsrf();
    if (token) {
      config.headers = config.headers || {};
      attachCsrf(config.headers as { set?: (k: string, v: string) => void } & Record<string, unknown>, token);
    }
  }
  return config;
});
export type ApiOk<T> = { ok: true; data: T };
export type ApiFail = { ok: false; error: ApiError };
export function errMessage(e: unknown, fallback = "请求失败"): string {
  const ax = e as { response?: { data?: ApiFail } };
  return ax.response?.data?.error?.message || fallback;
}
export function errCode(e: unknown): string {
  const ax = e as { response?: { data?: ApiFail; status?: number } };
  return ax.response?.data?.error?.code || "";
}
export function errStatus(e: unknown): number {
  const ax = e as { response?: { status?: number } };
  return ax.response?.status || 0;
}
export function loginFailText(msg: string, fallback = "登录失败"): string {
  const s = (msg || "").trim();
  if (!s) return fallback;
  if (/服务器缺少 Chromium 系统库/.test(s)) return s;
  if (/libnspr4|libnss3|cannot open shared object file|error while loading shared libraries/i.test(s)) {
    return "服务器缺少 Chromium 系统库，请管理员在服务器执行 playwright install-deps chromium（或 apt 安装 libnspr4 libnss3 等）";
  }
  if (/--no-sandbox|--disable-gpu|chrome-headless-shell/i.test(s)) {
    return "浏览器启动失败，请管理员查看 Worker 日志";
  }
  return s;
}
export default http;
