"""Browser-backed SMS login adapter for Sidecar Protocol v1.

The Go worker owns the long-running Job and sends the one-time code through a
short-lived request. This module keeps only the Playwright context and login
handle in memory; it never writes the phone number or verification code to
disk.
"""

import os
import threading
import uuid
from datetime import datetime, timedelta, timezone

import browser
import qr_login
import protocol


HOME_URL = "https://www.douyin.com/"
LOGIN_BUTTONS = (
    "button.semi-button-primary:has-text('登录')",
    ".header-ui button:has-text('登录')",
    "header button:has-text('登录')",
    "nav button:has-text('登录')",
)
SMS_TAB_TEXTS = ("验证码登录", "手机登录", "手机号登录")
PHONE_SELECTORS = (
    "input[type='tel']",
    "input[placeholder*='手机号']",
    "input[placeholder*='手机']",
)
CODE_SELECTORS = (
    "input[placeholder*='验证码']",
    "input[placeholder*='验证']",
    "input[type='number']",
)
SEND_CODE_TEXTS = ("获取验证码", "发送验证码")
SUBMIT_TEXTS = ("登录", "确认")
INVALID_CODE_TEXTS = ("验证码错误", "验证码不正确", "验证码已失效", "验证码过期")

_lock = threading.Lock()
_sessions = {}


class SMSLogin:
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
    return protocol.ProtocolError(code, message, retryable=retryable)


def _input_object(input_data):
    if not isinstance(input_data, dict):
        raise _error(protocol.ERR_INVALID_REQUEST, "input must be an object")
    return input_data


def _profile_dir(input_data):
    value = input_data.get("profile_dir")
    if not isinstance(value, str) or not value or not os.path.isabs(value):
        raise _error(protocol.ERR_INVALID_REQUEST, "profile_dir must be an absolute path")
    if value in ("/", "/tmp", "/run"):
        raise _error(protocol.ERR_INVALID_REQUEST, "profile_dir is too broad")
    os.makedirs(value, mode=0o700, exist_ok=True)
    os.chmod(value, 0o700)
    return value


def _export_file(input_data):
    value = input_data.get("export_session_file")
    if not isinstance(value, str) or not value or not os.path.isabs(value):
        raise _error(protocol.ERR_INVALID_REQUEST, "export_session_file must be an absolute path")
    parent = os.path.dirname(value)
    os.makedirs(parent, mode=0o700, exist_ok=True)
    os.chmod(parent, 0o700)
    return value


def _visible_text(page, values):
    for value in values:
        try:
            locator = page.get_by_text(value, exact=False)
            if locator.count() and locator.first.is_visible():
                return True
        except Exception:
            continue
    return False


def _click_first(page, selectors):
    for selector in selectors:
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


def _click_text(page, values):
    for value in values:
        try:
            locator = page.get_by_text(value, exact=True)
            if locator.count() and locator.first.is_visible():
                locator.first.click(timeout=5000)
                return True
        except Exception:
            continue
    return False


def _first_visible(page, selectors):
    for selector in selectors:
        try:
            locator = page.locator(selector)
            for index in range(min(locator.count(), 4)):
                candidate = locator.nth(index)
                if candidate.is_visible():
                    return candidate
        except Exception:
            continue
    return None


def start(input_data):
    input_data = _input_object(input_data)
    profile_dir = _profile_dir(input_data)
    phone = str(input_data.get("phone") or "").strip()
    if len(phone) < 5 or len(phone) > 32:
        raise _error(protocol.ERR_INVALID_REQUEST, "phone must be 5..32 characters")
    locale = input_data.get("locale", "zh-CN")
    if not isinstance(locale, str) or not locale:
        raise _error(protocol.ERR_INVALID_REQUEST, "locale must be a non-empty string")

    manager = browser.launch(user_data_dir=profile_dir, locale=locale)
    entered = False
    try:
        _pw, _browser, context, page = manager.__enter__()
        entered = True
        page.goto(HOME_URL, wait_until="domcontentloaded", timeout=30_000)
        if not qr_login._cookies_have_session(context):
            _click_first(page, LOGIN_BUTTONS)
        _click_text(page, SMS_TAB_TEXTS)
        phone_input = _first_visible(page, PHONE_SELECTORS)
        if phone_input is None:
            raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "SMS phone input is unavailable")
        phone_input.fill(phone)
        if not _click_text(page, SEND_CODE_TEXTS):
            raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "SMS code button is unavailable")
        handle = "sms_" + uuid.uuid4().hex
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=300)
        item = SMSLogin(handle, manager, context, page, profile_dir, expires_at)
        with _lock:
            _sessions[handle] = item
        return {"login_handle": handle, "expires_at": expires_at.isoformat()}
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


def verify(input_data):
    input_data = _input_object(input_data)
    handle = input_data.get("login_handle")
    code = str(input_data.get("code") or "").strip()
    if not isinstance(handle, str) or not handle:
        raise _error(protocol.ERR_INVALID_REQUEST, "login_handle is required")
    if not code.isdigit() or not 4 <= len(code) <= 8:
        raise _error(protocol.ERR_INVALID_REQUEST, "code must be 4..8 digits")
    with _lock:
        item = _sessions.get(handle)
    if item is None:
        raise _error(protocol.ERR_LOGIN_HANDLE_NOT_FOUND, "login handle is unavailable")
    if datetime.now(timezone.utc) >= item.expires_at:
        with _lock:
            _sessions.pop(handle, None)
        item.close()
        raise _error(protocol.ERR_SMS_CODE_EXPIRED, "SMS verification session expired")
    if qr_login._challenge_visible(item.page):
        with _lock:
            _sessions.pop(handle, None)
        item.close()
        return {"state": "challenge_required"}
    code_input = _first_visible(item.page, CODE_SELECTORS)
    if code_input is None:
        raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "SMS code input is unavailable")
    code_input.fill(code)
    if not _click_text(item.page, SUBMIT_TEXTS):
        raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "SMS submit button is unavailable")
    item.page.wait_for_timeout(1_000)
    if _visible_text(item.page, INVALID_CODE_TEXTS):
        raise _error(protocol.ERR_SMS_CODE_INVALID, "SMS verification code is invalid")
    if qr_login._challenge_visible(item.page):
        with _lock:
            _sessions.pop(handle, None)
        item.close()
        return {"state": "challenge_required"}
    if qr_login._cookies_have_session(item.context) and qr_login._login_success_visible(item.page):
        export_path = _export_file(input_data)
        browser.export_state(item.context, export_path)
        identity = qr_login._identity(item.page, item.context)
        with _lock:
            _sessions.pop(handle, None)
        item.close()
        return {"state": "authenticated", "identity": identity, "session_exported": True}
    return {"state": "waiting", "session_exported": False}
