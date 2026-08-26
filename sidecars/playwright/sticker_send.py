"""Existing-conversation sticker sender for Sidecar Protocol v1.

Sticker IDs are platform resources, not image URLs or display names. The
adapter only reports success after the page exposes a new platform message
ID; clicking a sticker or waiting a fixed amount of time is not a receipt.
"""

import browser
import message_send
import protocol


STICKER_TRIGGER_SELECTORS = (
    '[class*="messageMsgInputiconAction"]',
    '[class*="componentsemojiemojiPanel"]',
    '[class*="emojiBtn"]',
    '[class*="EmojiBtn"]',
    '[aria-label*="表情"]',
    '[title*="表情"]',
)
STICKER_PANEL_SELECTORS = (
    '[class*="emojiEmojisModal"]',
    '[class*="emojiPanel"]',
    '[class*="stickerPanel"]',
    '[class*="EmojiModal"]',
    '[role="dialog"][class*="emoji"]',
)
STICKER_ITEM_SELECTORS = (
    '[data-sticker-id]',
    '[data-stickerid]',
    '[data-sticker-key]',
    '[data-key]',
)
STICKER_ITEM_SELECTOR = ", ".join(STICKER_ITEM_SELECTORS)


def _error(code, message, retryable=False, detail=None):
    return protocol.ProtocolError(code, message, retryable=retryable, detail=detail)


def _validate_input(input_data):
    if not isinstance(input_data, dict):
        raise _error(protocol.ERR_INVALID_REQUEST, "input must be an object")
    if set(input_data) - {"session", "target", "message"}:
        raise _error(protocol.ERR_INVALID_REQUEST, "input contains unknown fields")
    state_path = protocol._session_file(input_data)
    target = input_data.get("target")
    message = input_data.get("message")
    if not isinstance(target, dict) or not isinstance(message, dict):
        raise _error(protocol.ERR_INVALID_REQUEST, "target and message are required")
    if set(target) - {"platform_conversation_id", "platform_user_id"}:
        raise _error(protocol.ERR_INVALID_REQUEST, "target contains unknown fields")
    if set(message) - {"sticker_id"}:
        raise _error(protocol.ERR_INVALID_REQUEST, "message contains unknown fields")
    conversation_id = target.get("platform_conversation_id")
    platform_user_id = target.get("platform_user_id")
    sticker_id = message.get("sticker_id")
    if not isinstance(conversation_id, str) or not conversation_id.strip() or len(conversation_id) > 512:
        raise _error(protocol.ERR_INVALID_REQUEST, "platform_conversation_id must be 1..512 characters")
    if not isinstance(platform_user_id, str) or not platform_user_id.strip() or len(platform_user_id) > 256:
        raise _error(protocol.ERR_INVALID_REQUEST, "platform_user_id must be 1..256 characters")
    if not isinstance(sticker_id, str) or not sticker_id.strip() or len(sticker_id) > 256:
        raise _error(protocol.ERR_INVALID_REQUEST, "message.sticker_id must be 1..256 characters")
    return state_path, conversation_id.strip(), platform_user_id.strip(), sticker_id.strip()


def _visible(locator):
    try:
        return locator.count() > 0 and locator.first.is_visible()
    except Exception:
        return False


def _open_panel(page):
    for selector in STICKER_TRIGGER_SELECTORS:
        try:
            locator = page.locator(selector)
            for index in range(min(locator.count(), 4)):
                candidate = locator.nth(index)
                if not candidate.is_visible():
                    continue
                candidate.click(timeout=5_000)
                page.wait_for_timeout(500)
                if any(_visible(page.locator(panel)) for panel in STICKER_PANEL_SELECTORS):
                    return True
        except Exception:
            continue
    return False


def _click_sticker(page, sticker_id):
    """Click an exact stable resource ID and never fall back to URL/name matching."""
    try:
        return bool(page.evaluate(
            """(wanted) => {
              const attrs = ['data-sticker-id', 'data-stickerid', 'data-sticker-key', 'data-key'];
              const nodes = Array.from(document.querySelectorAll(
                '[data-sticker-id], [data-stickerid], [data-sticker-key], [data-key]'
              ));
              for (const node of nodes) {
                const value = attrs.map((name) => node.getAttribute(name)).find(Boolean) || '';
                if (value !== wanted) continue;
                const rect = node.getBoundingClientRect();
                const style = window.getComputedStyle(node);
                if (rect.width <= 0 || rect.height <= 0 || style.display === 'none' || style.visibility === 'hidden') continue;
                node.click();
                return true;
              }
              return false;
            }""",
            sticker_id,
        ))
    except Exception:
        return False


def _message_ids(page):
    try:
        values = page.evaluate(
            """() => Array.from(document.querySelectorAll('[data-msg-id], [data-message-id]'))
              .map((node) => node.getAttribute('data-msg-id') || node.getAttribute('data-message-id') || '')
              .filter(Boolean)"""
        ) or []
        if not isinstance(values, list):
            return set()
        return {value for value in values if isinstance(value, str) and value}
    except Exception:
        return set()


def _new_message_id(before_ids, after_ids):
    for message_id in after_ids:
        if message_id not in before_ids:
            return message_id
    return ""


def _wait_for_new_message_id(page, before_ids, timeout_ms=8_000):
    attempts = max(1, timeout_ms // 400)
    for _ in range(attempts):
        page.wait_for_timeout(400)
        message_id = _new_message_id(before_ids, _message_ids(page))
        if message_id:
            return message_id
    return ""


def send_sticker(input_data):
    state_path, conversation_id, platform_user_id, sticker_id = _validate_input(input_data)
    with browser.launch(state_in=state_path) as (_pw, _browser, context, page):
        page.goto(message_send.CHAT_URL, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(1_500)
        if message_send._visible_text(page, message_send.CHALLENGE_TEXTS):
            raise _error(protocol.ERR_CHALLENGE_REQUIRED, "platform challenge is required")
        if not message_send._session_present(context):
            raise _error(protocol.ERR_SESSION_EXPIRED, "session is no longer valid")
        if message_send._visible_text(page, message_send.RATE_LIMIT_TEXTS):
            raise _error(protocol.ERR_PLATFORM_RATE_LIMITED, "platform rate limit was detected")
        if not message_send._open_message_panel(page):
            raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "message panel is unavailable")
        if not message_send._click_conversation(page, conversation_id, platform_user_id):
            raise _error(protocol.ERR_CONVERSATION_NOT_FOUND, "conversation is unavailable")
        page.wait_for_timeout(800)
        peer_id = message_send._current_peer_id(page, conversation_id)
        if peer_id != platform_user_id:
            raise _error(protocol.ERR_TARGET_IDENTITY_MISMATCH, "conversation peer does not match target")
        if not _open_panel(page):
            raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "sticker panel is unavailable")
        if not _visible(page.locator(STICKER_ITEM_SELECTOR)):
            raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "sticker resource selectors are unavailable")
        before_ids = _message_ids(page)
        if not _click_sticker(page, sticker_id):
            raise _error(
                protocol.ERR_ADAPTER_UNAVAILABLE,
                "sticker resource is unavailable",
                detail={"operation": "message.send_sticker", "reason": "sticker_not_found"},
            )
        platform_message_id = _wait_for_new_message_id(page, before_ids)
        if not platform_message_id:
            raise _error(
                protocol.ERR_ADAPTER_INCOMPATIBLE,
                "sticker send was not confirmed",
                detail={"outcome": "unknown"},
            )
        return {"confirmed": True, "platform_message_id": platform_message_id}
