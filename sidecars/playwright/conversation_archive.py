"""Platform-side conversation archive adapter for Sidecar Protocol v1.

The local product archive is deliberately separate from this action. This
adapter changes only the platform state and reports success only after a
platform state marker or success receipt is observed.
"""

import browser
import message_send
import protocol


ARCHIVE_ACTION_TEXTS = ("归档", "移入归档", "Archive")
RESTORE_ACTION_TEXTS = ("取消归档", "移出归档", "恢复", "Unarchive", "Restore")
CONFIRM_TEXTS = ("确定", "确认", "Confirm")
SUCCESS_TEXTS = (
    "已归档",
    "归档成功",
    "已取消归档",
    "恢复成功",
    "Archived",
    "Restored",
)
MENU_SELECTORS = (
    '[data-conversation-menu]',
    '[aria-label*="更多"]',
    '[aria-label*="菜单"]',
    '[title*="更多"]',
    '[title*="菜单"]',
    '[class*="more"]',
    '[class*="More"]',
)


def _error(code, message, retryable=False, detail=None):
    return protocol.ProtocolError(code, message, retryable=retryable, detail=detail)


def _validate_input(input_data):
    if not isinstance(input_data, dict):
        raise _error(protocol.ERR_INVALID_REQUEST, "input must be an object")
    if set(input_data) - {"session", "target", "archived"}:
        raise _error(protocol.ERR_INVALID_REQUEST, "input contains unknown fields")
    state_path = protocol._session_file(input_data)
    target = input_data.get("target")
    if not isinstance(target, dict):
        raise _error(protocol.ERR_INVALID_REQUEST, "target is required")
    if set(target) - {"platform_user_id", "platform_conversation_id"}:
        raise _error(protocol.ERR_INVALID_REQUEST, "target contains unknown fields")
    conversation_id = target.get("platform_conversation_id")
    platform_user_id = target.get("platform_user_id")
    if not isinstance(conversation_id, str) or not conversation_id.strip() or len(conversation_id) > 512:
        raise _error(protocol.ERR_INVALID_REQUEST, "platform_conversation_id must be 1..512 characters")
    if platform_user_id is not None and (
        not isinstance(platform_user_id, str) or not platform_user_id.strip() or len(platform_user_id) > 256
    ):
        raise _error(protocol.ERR_INVALID_REQUEST, "platform_user_id must be 1..256 characters when provided")
    if type(input_data.get("archived")) is not bool:
        raise _error(protocol.ERR_INVALID_REQUEST, "archived must be boolean")
    return state_path, conversation_id.strip(), platform_user_id.strip() if platform_user_id else None, input_data["archived"]


def _click_visible_text(page, values):
    for value in values:
        for exact in (True, False):
            try:
                locator = page.get_by_text(value, exact=exact)
                for index in range(min(locator.count(), 4)):
                    candidate = locator.nth(index)
                    if candidate.is_visible():
                        candidate.click(timeout=5_000)
                        return True
            except Exception:
                continue
    return False


def _open_conversation_menu(page, conversation_id):
    """Open a menu nested in the exact platform conversation row."""
    try:
        return bool(page.evaluate(
            """(wanted) => {
              const menuSelectors = [
                '[data-conversation-menu]', '[aria-label*="更多"]', '[aria-label*="菜单"]',
                '[title*="更多"]', '[title*="菜单"]', '[class*="more"]', '[class*="More"]'
              ];
              const rows = Array.from(document.querySelectorAll('[data-conversation-id], [data-conversationid], [data-conv-id], [data-id]'));
              for (const row of rows) {
                const id = row.getAttribute('data-conversation-id') || row.getAttribute('data-conversationid') ||
                  row.getAttribute('data-conv-id') || row.getAttribute('data-id');
                if (id !== wanted) continue;
                row.scrollIntoView({block: 'center'});
                for (const selector of menuSelectors) {
                  const menu = row.querySelector(selector);
                  if (!menu) continue;
                  const rect = menu.getBoundingClientRect();
                  const style = window.getComputedStyle(menu);
                  if (rect.width <= 0 || rect.height <= 0 || style.display === 'none' || style.visibility === 'hidden') continue;
                  menu.click();
                  return true;
                }
              }
              return false;
            }""",
            conversation_id,
        ))
    except Exception:
        return False


def _platform_state(page, conversation_id):
    try:
        value = page.evaluate(
            """(wanted) => {
              const rows = Array.from(document.querySelectorAll('[data-conversation-id], [data-conversationid], [data-conv-id], [data-id]'));
              for (const row of rows) {
                const id = row.getAttribute('data-conversation-id') || row.getAttribute('data-conversationid') ||
                  row.getAttribute('data-conv-id') || row.getAttribute('data-id');
                if (id !== wanted) continue;
                const raw = row.getAttribute('data-archived') || row.getAttribute('aria-archived');
                let archived = null;
                if (raw === 'true' || raw === '1') archived = true;
                if (raw === 'false' || raw === '0') archived = false;
                if (archived === null) {
                  const className = String(row.className || '');
                  if (/archiv/i.test(className)) archived = true;
                }
                return {platform_conversation_id: id, archived};
              }
              return null;
            }""",
            conversation_id,
        )
        return value if isinstance(value, dict) else None
    except Exception:
        return None


def _success_receipt_visible(page):
    return message_send._visible_text(page, SUCCESS_TEXTS)


def _wait_for_receipt(page, conversation_id, archived, timeout_ms=8_000):
    attempts = max(1, timeout_ms // 400)
    for _ in range(attempts):
        page.wait_for_timeout(400)
        state = _platform_state(page, conversation_id)
        if state and state.get("platform_conversation_id") == conversation_id and state.get("archived") is archived:
            return True
        if _success_receipt_visible(page):
            return True
    return False


def archive(input_data):
    state_path, conversation_id, platform_user_id, archived = _validate_input(input_data)
    with browser.launch(state_in=state_path) as (_pw, _browser, context, page):
        page.goto(message_send.CHAT_URL, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(1_500)
        if message_send._visible_text(page, message_send.CHALLENGE_TEXTS):
            raise _error(protocol.ERR_CHALLENGE_REQUIRED, "platform challenge is required")
        if not message_send._session_present(context):
            raise _error(protocol.ERR_SESSION_EXPIRED, "session is no longer valid")
        if message_send._visible_text(page, message_send.RATE_LIMIT_TEXTS):
            raise _error(protocol.ERR_PLATFORM_RATE_LIMITED, "platform rate limit was detected")
        if not message_send._click_conversation(page, conversation_id):
            raise _error(protocol.ERR_CONVERSATION_NOT_FOUND, "conversation is unavailable")
        page.wait_for_timeout(800)
        if platform_user_id is not None:
            peer_id = message_send._current_peer_id(page)
            if peer_id != platform_user_id:
                raise _error(protocol.ERR_TARGET_IDENTITY_MISMATCH, "conversation peer does not match target")
        if not _open_conversation_menu(page, conversation_id):
            raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "conversation menu selector is unavailable")
        action_texts = ARCHIVE_ACTION_TEXTS if archived else RESTORE_ACTION_TEXTS
        if not _click_visible_text(page, action_texts):
            raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "conversation archive action is unavailable")
        _click_visible_text(page, CONFIRM_TEXTS)
        if not _wait_for_receipt(page, conversation_id, archived):
            raise _error(
                protocol.ERR_ADAPTER_INCOMPATIBLE,
                "platform archive was not confirmed",
                detail={"outcome": "unknown"},
            )
        return {
            "confirmed": True,
            "platform_conversation_id": conversation_id,
            "archived": archived,
        }
