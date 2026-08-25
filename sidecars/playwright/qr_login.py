"""Browser-backed QR login adapter for Sidecar Protocol v1.

The Sidecar owns only the temporary Playwright context. The Go Worker owns
the Job state machine and later encrypts the exported storage state.
"""

import base64
import os
import threading
import uuid
from datetime import datetime, timedelta, timezone

import browser

HOME_URL = "https://www.douyin.com/"
LOGIN_BUTTONS = (
    "button.semi-button-primary:has-text('登录')",
    ".header-ui button:has-text('登录')",
    "header button:has-text('登录')",
    "nav button:has-text('登录')",
    "div[role='button']:has-text('登录')",
)
QR_SELECTORS = (
    "#animate_qrcode_container img",
    "#douyin_login_comp_scan_code img",
    "#animate_qrcode_container canvas",
    "img[src^='data:image']",
    "img[class*='qrcode']",
)
SESSION_COOKIE_NAMES = ("sessionid", "sessionid_ss", "sid_tt")
CHALLENGE_TEXTS = ("安全验证", "滑动验证", "人机验证", "身份验证")
CHALLENGE_TITLES = ("验证码中间页", "安全验证", "人机验证")
LOGIN_PANEL_SELECTOR = "#douyin_login_comp_flat_panel"
AUTHENTICATED_SELECTORS = (
    '[data-e2e="user-info"]',
    '[class*="userName"]',
    '[class*="avatar"]',
)

_lock = threading.Lock()
_sessions = {}


class QRLogin:
    def __init__(self, handle, manager, context, page, profile_dir, expires_at):
        self.handle = handle
        self.manager = manager
        self.context = context
        self.page = page
        self.profile_dir = profile_dir
        self.expires_at = expires_at

    def close(self):
        try:
            self.manager.__exit__(None, None, None)
        except Exception:
            pass


def _error(code, message, retryable=False):
    from protocol import ProtocolError

    return ProtocolError(code, message, retryable=retryable)


def _input_object(input_data):
    if not isinstance(input_data, dict):
        raise _error("INVALID_REQUEST", "input must be an object")
    return input_data


def _profile_dir(input_data):
    value = input_data.get("profile_dir")
    if not isinstance(value, str) or not value or len(value) > 4096 or not os.path.isabs(value):
        raise _error("INVALID_REQUEST", "profile_dir must be an absolute path")
    if value in ("/", "/tmp", "/run"):
        raise _error("INVALID_REQUEST", "profile_dir is too broad")
    os.makedirs(value, mode=0o700, exist_ok=True)
    os.chmod(value, 0o700)
    return value


def _export_file(input_data):
    value = input_data.get("export_session_file")
    if not isinstance(value, str) or not value or len(value) > 4096 or not os.path.isabs(value):
        raise _error("INVALID_REQUEST", "export_session_file must be an absolute path")
    parent = os.path.dirname(value)
    if not parent:
        raise _error("INVALID_REQUEST", "export_session_file parent is required")
    os.makedirs(parent, mode=0o700, exist_ok=True)
    os.chmod(parent, 0o700)
    return value


def _cookies_have_session(context):
    try:
        cookies = context.cookies()
    except Exception:
        cookies = []
    return any(
        isinstance(cookie, dict)
        and cookie.get("name") in SESSION_COOKIE_NAMES
        and str(cookie.get("value") or "").strip()
        for cookie in cookies
    )


def _challenge_visible(page):
    for text in CHALLENGE_TEXTS:
        try:
            locator = page.get_by_text(text, exact=False)
            if locator.count() and locator.first.is_visible():
                return True
        except Exception:
            continue
    return False


def _verification_interstitial_visible(page):
    """Detect the platform's verification interstitial before QR rendering."""
    try:
        title = (page.title() or "").strip()
        if any(text in title for text in CHALLENGE_TITLES):
            return True
    except Exception:
        pass
    return False


def _login_success_visible(page):
    """Require a page-level signal in addition to session cookies."""
    try:
        panel = page.locator(LOGIN_PANEL_SELECTOR)
        if panel.count() and panel.first.is_visible():
            return False
    except Exception:
        return False
    for selector in AUTHENTICATED_SELECTORS:
        try:
            locator = page.locator(selector)
            if locator.count() and locator.first.is_visible():
                return True
        except Exception:
            continue
    return False


def _click_login(page):
    for selector in LOGIN_BUTTONS:
        try:
            locator = page.locator(selector)
            for index in range(min(locator.count(), 4)):
                candidate = locator.nth(index)
                if candidate.is_visible():
                    candidate.click(timeout=5000)
                    return True
        except Exception:
            continue
    return False


def _qr_data_url(page):
    try:
        value = page.evaluate(
            """() => {
              const roots = [
                document.querySelector('#animate_qrcode_container'),
                document.querySelector('#douyin_login_comp_scan_code'),
                document.body,
              ];
              for (const root of roots) {
                if (!root) continue;
                for (const node of root.querySelectorAll('img,canvas')) {
                  if (node.tagName === 'CANVAS' && node.toDataURL) {
                    try { const data = node.toDataURL('image/png'); if (data.length > 200) return data; } catch (_) {}
                  }
                  const src = node.currentSrc || node.src || '';
                  if (src.startsWith('data:image') && src.length > 200) return src;
                }
              }
              return '';
            }"""
        ) or ""
        if value:
            return value
    except Exception:
        pass
    for selector in QR_SELECTORS:
        try:
            locator = page.locator(selector)
            for index in range(min(locator.count(), 6)):
                node = locator.nth(index)
                if not node.is_visible():
                    continue
                box = node.bounding_box()
                if not box or box.get("width", 0) < 100 or box.get("height", 0) < 100:
                    continue
                data = node.screenshot(type="png")
                if data:
                    return "data:image/png;base64," + base64.b64encode(data).decode("ascii")
        except Exception:
            continue
    return ""


def _qr_visible(page):
    for selector in QR_SELECTORS:
        try:
            locator = page.locator(selector)
            if locator.count() and locator.first.is_visible():
                return True
        except Exception:
            continue
    return False


def _identity(page, context):
    platform_user_id = ""
    try:
        for cookie in context.cookies():
            if cookie.get("name") in ("uid_tt", "uid_tt_ss", "sid_uid"):
                platform_user_id = str(cookie.get("value") or "").strip()
                if platform_user_id:
                    break
    except Exception:
        pass
    nickname = ""
    try:
        nickname = page.evaluate(
            """() => {
              for (const selector of ['[class*="userName"]','[class*="nickname"]','[data-e2e="user-info"]']) {
                const node = document.querySelector(selector);
                const text = (node?.textContent || '').trim();
                if (text && text.length < 64 && text !== '我的' && text !== '抖音') return text;
              }
              return '';
            }"""
        ) or ""
    except Exception:
        pass
    return {"platform_user_id": platform_user_id[:128], "nickname": str(nickname).strip()[:64], "avatar_url": None}


def start(input_data):
    input_data = _input_object(input_data)
    if set(input_data) - {"profile_dir", "locale"}:
        raise _error("INVALID_REQUEST", "input contains unknown fields")
    profile_dir = _profile_dir(input_data)
    locale = input_data.get("locale", "zh-CN")
    if not isinstance(locale, str) or not locale or len(locale) > 32:
        raise _error("INVALID_REQUEST", "locale must be a non-empty string")

    manager = browser.launch(user_data_dir=profile_dir, locale=locale)
    entered = False
    try:
        _pw, _browser, context, page = manager.__enter__()
        entered = True
        page.goto(HOME_URL, wait_until="domcontentloaded", timeout=30000)
        if _verification_interstitial_visible(page) or _challenge_visible(page):
            manager.__exit__(None, None, None)
            entered = False
            raise _error("CHALLENGE_REQUIRED", "platform verification is required")
        if not _cookies_have_session(context):
            _click_login(page)
        qr = ""
        for _ in range(20):
            if _verification_interstitial_visible(page) or _challenge_visible(page):
                manager.__exit__(None, None, None)
                entered = False
                raise _error("CHALLENGE_REQUIRED", "platform verification is required")
            qr = _qr_data_url(page)
            if qr:
                break
            page.wait_for_timeout(250)
        if not qr:
            manager.__exit__(None, None, None)
            entered = False
            raise _error("QR_NOT_READY", "login QR code is not available", retryable=True)
        handle = "qr_" + uuid.uuid4().hex
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=180)
        item = QRLogin(handle, manager, context, page, profile_dir, expires_at)
        with _lock:
            _sessions[handle] = item
        return {
            "login_handle": handle,
            "qr": {"format": "data_url", "value": qr, "expires_at": expires_at.isoformat()},
        }
    except Exception:
        if entered:
            try:
                manager.__exit__(None, None, None)
            except Exception:
                pass
        raise


def cleanup_expired(now=None):
    if now is None:
        now = datetime.now(timezone.utc)
    with _lock:
        expired = [handle for handle, item in _sessions.items() if now >= item.expires_at]
        items = [_sessions.pop(handle) for handle in expired]
    for item in items:
        item.close()
    return len(items)


def poll(input_data):
    input_data = _input_object(input_data)
    if set(input_data) - {"login_handle", "export_session_file"}:
        raise _error("INVALID_REQUEST", "input contains unknown fields")
    handle = input_data.get("login_handle")
    if not isinstance(handle, str) or not handle or len(handle) > 128:
        raise _error("INVALID_REQUEST", "login_handle is required")
    with _lock:
        item = _sessions.get(handle)
    if item is None:
        raise _error("LOGIN_HANDLE_NOT_FOUND", "login handle is unavailable")
    if datetime.now(timezone.utc) >= item.expires_at:
        with _lock:
            _sessions.pop(handle, None)
        item.close()
        raise _error("QR_EXPIRED", "login QR session expired")
    if _challenge_visible(item.page):
        with _lock:
            _sessions.pop(handle, None)
        item.close()
        return {"state": "challenge_required"}
    if _cookies_have_session(item.context) and _login_success_visible(item.page):
        export_path = _export_file(input_data)
        browser.export_state(item.context, export_path)
        identity = _identity(item.page, item.context)
        with _lock:
            _sessions.pop(handle, None)
        item.close()
        return {"state": "authenticated", "identity": identity, "session_exported": True}
    if not _qr_visible(item.page):
        return {"state": "scanned"}
    return {"state": "waiting"}
