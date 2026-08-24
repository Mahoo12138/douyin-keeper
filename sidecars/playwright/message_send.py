"""Existing-conversation text sender for Sidecar Protocol v1."""

import browser
import protocol


CHAT_URL = "https://www.douyin.com/chat"
EDITOR_SELECTORS = (
    "textarea",
    "[contenteditable='true']",
    "div[role='textbox']",
)
SESSION_COOKIE_NAMES = ("sessionid", "sessionid_ss", "sid_tt")
CHALLENGE_TEXTS = ("安全验证", "滑动验证", "人机验证", "身份验证")
RATE_LIMIT_TEXTS = ("操作频繁", "请求过于频繁", "访问受限")


def _error(code, message, retryable=False, detail=None):
    return protocol.ProtocolError(code, message, retryable=retryable, detail=detail)


def _session_path(input_data):
    if not isinstance(input_data, dict):
        raise _error(protocol.ERR_INVALID_REQUEST, "input must be an object")
    return protocol._session_file(input_data)


def _visible_text(page, values):
    for value in values:
        try:
            locator = page.get_by_text(value, exact=False)
            if locator.count() and locator.first.is_visible():
                return True
        except Exception:
            continue
    return False


def _session_present(context):
    try:
        cookies = context.cookies()
    except Exception:
        return False
    return any(
        isinstance(cookie, dict)
        and cookie.get("name") in SESSION_COOKIE_NAMES
        and str(cookie.get("value") or "").strip()
        for cookie in cookies
    )


def _click_conversation(page, conversation_id):
    try:
        return bool(page.evaluate(
            """(wanted) => {
              const nodes = Array.from(document.querySelectorAll('[data-conversation-id], [data-conversationid]'));
              for (const node of nodes) {
                const value = node.getAttribute('data-conversation-id') || node.getAttribute('data-conversationid');
                if (value === wanted) { node.click(); return true; }
              }
              return false;
            }""",
            conversation_id,
        ))
    except Exception:
        return False


def _current_peer_id(page):
    try:
        return page.evaluate(
            """() => {
              const nodes = Array.from(document.querySelectorAll('[data-user-id], [data-uid], a[href*="/user/"]'));
              for (const node of nodes) {
                const direct = node.getAttribute('data-user-id') || node.getAttribute('data-uid');
                if (direct) return direct;
                const href = node.getAttribute('href') || '';
                const match = href.match(/\/user\/([^/?#]+)/);
                if (match) return match[1];
              }
              return '';
            }"""
        ) or ""
    except Exception:
        return ""


def _editor(page):
    for selector in EDITOR_SELECTORS:
        try:
            locator = page.locator(selector)
            for index in range(min(locator.count(), 4)):
                candidate = locator.nth(index)
                if candidate.is_visible():
                    return candidate
        except Exception:
            continue
    return None


def _editor_text(editor):
    try:
        return editor.input_value()
    except Exception:
        try:
            return editor.inner_text()
        except Exception:
            return ""


def _message_ids(page, text):
    try:
        values = page.evaluate(
            """(wanted) => {
              const nodes = Array.from(document.querySelectorAll('[data-msg-id], [data-message-id], [class*="MessageItem"]'));
              return nodes
                .filter((node) => (node.innerText || '').includes(wanted))
                .map((node) => node.getAttribute('data-msg-id') || node.getAttribute('data-message-id') || '')
                .filter((value) => value);
            }""",
            text,
        ) or []
        if not isinstance(values, list):
            return []
        return [value for value in values if isinstance(value, str) and value]
    except Exception:
        return []


def _new_message_id(page, text, before_ids):
    before = set(before_ids or ())
    for message_id in reversed(_message_ids(page, text)):
        if message_id not in before:
            return message_id
    return ""


def send_text(input_data):
    if not isinstance(input_data, dict):
        raise _error(protocol.ERR_INVALID_REQUEST, "input must be an object")
    if set(input_data) - {"session", "target", "message"}:
        raise _error(protocol.ERR_INVALID_REQUEST, "input contains unknown fields")
    session_path = _session_path(input_data)
    target = input_data.get("target")
    message = input_data.get("message")
    if not isinstance(target, dict) or not isinstance(message, dict):
        raise _error(protocol.ERR_INVALID_REQUEST, "target and message are required")
    if set(target) - {"platform_conversation_id", "platform_user_id"}:
        raise _error(protocol.ERR_INVALID_REQUEST, "target contains unknown fields")
    if set(message) - {"text"}:
        raise _error(protocol.ERR_INVALID_REQUEST, "message contains unknown fields")
    conversation_id = target.get("platform_conversation_id")
    platform_user_id = target.get("platform_user_id")
    text = message.get("text")
    if not isinstance(conversation_id, str) or not conversation_id.strip() or len(conversation_id) > 512:
        raise _error(protocol.ERR_INVALID_REQUEST, "platform_conversation_id must be 1..512 characters")
    if not isinstance(platform_user_id, str) or not platform_user_id.strip() or len(platform_user_id) > 256:
        raise _error(protocol.ERR_INVALID_REQUEST, "platform_user_id must be 1..256 characters")
    if not isinstance(text, str) or not text.strip() or len(text) > 2000:
        raise _error(protocol.ERR_INVALID_REQUEST, "message.text must be 1..2000 characters")

    with browser.launch(state_in=session_path) as (_pw, _browser, context, page):
        page.goto(CHAT_URL, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(1_500)
        if _visible_text(page, CHALLENGE_TEXTS):
            raise _error(protocol.ERR_CHALLENGE_REQUIRED, "platform challenge is required")
        if not _session_present(context):
            raise _error(protocol.ERR_SESSION_EXPIRED, "session is no longer valid")
        if _visible_text(page, RATE_LIMIT_TEXTS):
            raise _error(protocol.ERR_PLATFORM_RATE_LIMITED, "platform rate limit was detected")
        if not _click_conversation(page, conversation_id):
            raise _error(protocol.ERR_CONVERSATION_NOT_FOUND, "conversation is unavailable")
        page.wait_for_timeout(800)
        peer_id = _current_peer_id(page)
        if peer_id != platform_user_id:
            raise _error(protocol.ERR_TARGET_IDENTITY_MISMATCH, "conversation peer does not match target")
        editor = _editor(page)
        if editor is None:
            raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "message editor is unavailable")
        before_message_ids = set(_message_ids(page, text))
        editor.click()
        try:
            editor.fill(text)
        except Exception:
            page.keyboard.press("Control+A")
            page.keyboard.press("Delete")
            page.keyboard.type(text, delay=20)
        if text not in _editor_text(editor):
            raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "message text was not entered")
        page.keyboard.press("Enter")
        page.wait_for_timeout(1_000)
        if text in _editor_text(editor):
            raise _error(protocol.ERR_ADAPTER_INCOMPATIBLE, "message send was not confirmed", detail={"outcome": "unknown"})
        message_id = _new_message_id(page, text, before_message_ids)
        if not message_id:
            raise _error(protocol.ERR_ADAPTER_INCOMPATIBLE, "platform message id was not observed", detail={"outcome": "unknown"})
        return {"confirmed": True, "platform_message_id": message_id}
