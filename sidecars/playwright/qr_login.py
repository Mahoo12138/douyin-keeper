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
    "#animate_qrcode_container img, #animate_qrcode_container canvas",
    "#douyin_login_comp_scan_code img, #douyin_login_comp_scan_code canvas",
    "img[class*='qrcode' i], img[id*='qrcode' i], canvas[class*='qrcode' i], canvas[id*='qrcode' i]",
)
SESSION_COOKIE_NAMES = ("sessionid", "sessionid_ss", "sid_tt")
CHALLENGE_TEXTS = ("安全验证", "滑动验证", "人机验证", "身份验证")
CHALLENGE_TITLES = ("验证码中间页", "安全验证", "人机验证")
LOGIN_PANEL_SELECTOR = "#douyin_login_comp_flat_panel"
AUTHENTICATED_SELECTORS = (
    '[data-e2e="user-info"]',
    '[class*="userName"]',
)
GENERIC_IDENTITY_TEXT = {"我的", "抖音", "登录", "登录 / 注册", "登录注册"}

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


def _platform_challenge_visible(page):
    return _verification_interstitial_visible(page) or _challenge_visible(page)


def _login_success_visible(page, context=None):
    """Accept a valid session cookie when the login layer has disappeared."""
    try:
        panel = page.locator(LOGIN_PANEL_SELECTOR)
        if panel.count() and panel.first.is_visible():
            return False
    except Exception:
        return False
    for selector in AUTHENTICATED_SELECTORS:
        try:
            locator = page.locator(selector)
            if not locator.count() or not locator.first.is_visible():
                continue
            try:
                identity_text = (locator.first.text_content() or "").strip()
            except Exception:
                identity_text = ""
            if identity_text and identity_text not in GENERIC_IDENTITY_TEXT and len(identity_text) <= 128:
                return True
        except Exception:
            continue
    if context is None or not _cookies_have_session(context):
        return False
    try:
        url = str(getattr(page, "url", "") or "").lower()
        if "login" in url or "passport" in url:
            return False
    except Exception:
        pass
    if _platform_challenge_visible(page) or _qr_visible(page):
        return False
    return True
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
              const specificNodes = Array.from(document.querySelectorAll(
                '#animate_qrcode_container img, #animate_qrcode_container canvas,' +
                ' #douyin_login_comp_scan_code img, #douyin_login_comp_scan_code canvas,' +
                ' img[class*="qrcode" i], img[id*="qrcode" i],' +
                ' canvas[class*="qrcode" i], canvas[id*="qrcode" i]'
              ));
              const fallbackNodes = Array.from(document.querySelectorAll('img, canvas'))
                .filter((node) => !specificNodes.includes(node));
              const nodes = [...specificNodes, ...fallbackNodes];
              for (const node of nodes) {
                const rect = node.getBoundingClientRect();
                const width = Math.max(rect.width || 0, node.naturalWidth || 0, node.width || 0);
                const height = Math.max(rect.height || 0, node.naturalHeight || 0, node.height || 0);
                if (width < 100 || height < 100) continue;
                const ratio = width / height;
                if (ratio < 0.75 || ratio > 1.33) continue;
                if (node.tagName === 'CANVAS' && node.toDataURL) {
                  try { const data = node.toDataURL('image/png'); if (data.length > 200) return data; } catch (_) {}
                }
                const src = node.currentSrc || node.src || '';
                if (src.startsWith('data:image') && src.length > 200) return src;
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


def _wait_for_qr_or_challenge(page, attempts=20, wait_ms=250):
    """Give the login layer time to expose its QR before reporting a challenge.

    Douyin can briefly render verification text while the login layer is still
    mounting. The QR is the primary user action, so keep checking for it
    before converting that transient page state into ``challenge_required``.
    """
    challenge_seen = False
    for _ in range(max(1, attempts)):
        qr = _qr_data_url(page)
        if qr:
            return qr, False
        if _platform_challenge_visible(page):
            challenge_seen = True
        try:
            page.wait_for_timeout(wait_ms)
        except Exception:
            pass
    return "", challenge_seen


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
        challenge_required = _platform_challenge_visible(page)
        if not challenge_required and not _cookies_have_session(context):
            _click_login(page)
        qr, challenge_required = _wait_for_qr_or_challenge(page)
        if not qr and not challenge_required:
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
            "state": "challenge_required" if challenge_required else "waiting",
            "qr": {"format": "none" if challenge_required else "data_url", "value": qr, "expires_at": expires_at.isoformat()},
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


def cancel(input_data):
    input_data = _input_object(input_data)
    if set(input_data) - {"login_handle"}:
        raise _error("INVALID_REQUEST", "input contains unknown fields")
    handle = input_data.get("login_handle")
    if not isinstance(handle, str) or not handle or len(handle) > 128:
        raise _error("INVALID_REQUEST", "login handle is required")
    with _lock:
        item = _sessions.pop(handle, None)
    if item is not None:
        item.close()
    return {"state": "cancelled"}


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
    if _platform_challenge_visible(item.page):
        return {"state": "challenge_required"}
    if _cookies_have_session(item.context) and _login_success_visible(item.page, item.context):
        export_path = _export_file(input_data)
        browser.export_state(item.context, export_path)
        identity = _identity(item.page, item.context)
        with _lock:
            _sessions.pop(handle, None)
        item.close()
        return {"state": "authenticated", "identity": identity, "session_exported": True}
    if not _qr_visible(item.page):
        _click_login(item.page)
        return {"state": "waiting"}
    return {"state": "waiting"}
