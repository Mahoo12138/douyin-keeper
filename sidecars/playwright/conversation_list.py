"""Douyin consumer conversation-list adapter for Sidecar Protocol v1.

The consumer chat page is a virtualized list, so the adapter scrolls it and
uses the last platform conversation ID as the opaque cursor. Display names are
diagnostic only: rows without both stable IDs are ignored instead of being
returned as sendable conversations.
"""

import browser
import protocol


CHAT_URL = "https://www.douyin.com/chat"
SESSION_COOKIE_NAMES = ("sessionid", "sessionid_ss", "sid_tt")
CHALLENGE_TEXTS = ("安全验证", "滑动验证", "人机验证", "身份验证")
RATE_LIMIT_TEXTS = ("操作频繁", "请求过于频繁", "访问受限")
CONTACT_TITLE = ".conversationConversationItemtitle"
LIST_MARKER = ".conversationConversationItemtitle, [class*='conversationConversationItem']"
MAX_SCROLL_ROUNDS = 24
STABLE_ROUNDS = 3


EXTRACT_JS = r"""
() => {
  const rows = Array.from(document.querySelectorAll('.conversationConversationItemtitle'));
  const result = [];
  const attr = (node, names) => {
    for (const name of names) {
      const value = node?.getAttribute?.(name);
      if (value && value.trim()) return value.trim();
    }
    return '';
  };
  const text = (node) => (node?.textContent || '').trim();
  const decode = (value) => {
    try { return decodeURIComponent(String(value || '')).trim(); }
    catch (_) { return String(value || '').trim(); }
  };
  const nodesFor = (title, row) => {
    const nodes = [title, row, ...(row?.querySelectorAll?.('*') || [])];
    let parent = title?.parentElement;
    for (let i = 0; i < 5 && parent; i += 1, parent = parent.parentElement) nodes.push(parent);
    return [...new Set(nodes.filter(Boolean))];
  };
  const firstAttr = (nodes, names) => {
    for (const node of nodes) {
      const value = attr(node, names);
      if (value) return value;
    }
    return '';
  };
  const hrefs = (nodes) => nodes
    .flatMap((node) => {
      if (node?.matches?.('a[href]')) return [node.getAttribute('href') || ''];
      return Array.from(node?.querySelectorAll?.('a[href]') || []).map((a) => a.getAttribute('href') || '');
    })
    .filter(Boolean);
  const queryValue = (href, names) => {
    try {
      const base = window.location.origin && window.location.origin !== 'null'
        ? window.location.origin : 'https://www.douyin.com';
      const url = new URL(href, base);
      for (const name of names) {
        const value = url.searchParams.get(name);
        if (value) return decode(value);
      }
    } catch (_) {}
    return '';
  };
  const pathValue = (href) => decode(href.match(/\/(?:user|profile)\/([^/?#]+)/i)?.[1] || '');
  const peerIDFrom = (nodes) => {
    const direct = firstAttr(nodes, [
      'data-user-id', 'data-uid', 'data-userid', 'data-sec-uid', 'data-sec_uid', 'data-secuid'
    ]);
    if (direct) return decode(direct);
    for (const href of hrefs(nodes)) {
      const fromQuery = queryValue(href, ['sec_uid', 'secUid', 'sec-uid', 'uid', 'user_id', 'userId']);
      if (fromQuery) return fromQuery;
      const fromPath = pathValue(href);
      if (fromPath) return fromPath;
    }
    return '';
  };
  const conversationIDFrom = (nodes) => {
    const direct = firstAttr(nodes, [
      'data-conversation-id', 'data-conversationid', 'data-conv-id', 'data-conversation', 'data-conversation-key'
    ]);
    if (direct) return decode(direct);
    const rowID = firstAttr(nodes.slice(0, 2), ['data-id']);
    if (rowID) return decode(rowID);
    for (const href of hrefs(nodes)) {
      const value = queryValue(href, ['conversation_id', 'conversationId', 'conversation-id', 'conv_id', 'convId']);
      if (value) return value;
    }
    return '';
  };
  for (const title of rows) {
    const displayName = text(title);
    if (!displayName || displayName.length > 128) continue;
    let row = title;
    for (let i = 0; i < 5 && row; i += 1) row = row.parentElement;
    row = row || title;
    const nodes = nodesFor(title, row);
    const conversationID = conversationIDFrom(nodes);
    const peerID = peerIDFrom(nodes);
    const timeNode = row.querySelector?.('time[datetime], [data-last-message-at]');
    const lastMessageAt = attr(timeNode, ['datetime', 'data-last-message-at']) ||
      attr(row, ['data-last-message-at']);
    const channel = attr(row, ['data-channel']) || 'consumer';
    result.push({
      platform_conversation_id: conversationID || null,
      peer_platform_user_id: peerID || null,
      peer_display_name: displayName,
      channel,
      last_message_at: lastMessageAt || null,
    });
  }
  return result;
}
"""


def _error(code, message, retryable=False, detail=None):
    return protocol.ProtocolError(code, message, retryable=retryable, detail=detail)


def _cookies_have_session(context):
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


def _visible_text(page, values):
    for value in values:
        try:
            locator = page.get_by_text(value, exact=False)
            if locator.count() and locator.first.is_visible():
                return True
        except Exception:
            continue
    return False


def _validate_input(input_data):
    if not isinstance(input_data, dict):
        raise _error(protocol.ERR_INVALID_REQUEST, "input must be an object")
    if set(input_data) - {"session", "cursor", "limit"}:
        raise _error(protocol.ERR_INVALID_REQUEST, "input contains unknown fields")

    state_path = protocol._session_file(input_data)
    cursor = input_data.get("cursor")
    if cursor is not None and (not isinstance(cursor, str) or not cursor.strip() or len(cursor) > 512):
        raise _error(protocol.ERR_INVALID_REQUEST, "cursor must be a non-empty string or null")

    limit = input_data.get("limit", 100)
    if type(limit) is not int or not 1 <= limit <= 100:
        raise _error(protocol.ERR_INVALID_REQUEST, "limit must be between 1 and 100")
    return state_path, cursor, limit


def _normalize_items(raw_items):
    """Keep only rows that have both stable IDs and deduplicate by conversation."""
    if not isinstance(raw_items, list):
        raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "conversation list result is invalid")
    items = []
    seen = set()
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        conversation_id = raw.get("platform_conversation_id")
        peer_id = raw.get("peer_platform_user_id")
        if not isinstance(conversation_id, str) or not conversation_id.strip() or len(conversation_id) > 512:
            continue
        if not isinstance(peer_id, str) or not peer_id.strip() or len(peer_id) > 256:
            continue
        conversation_id = conversation_id.strip()
        peer_id = peer_id.strip()
        if conversation_id in seen:
            continue
        display_name = raw.get("peer_display_name")
        if not isinstance(display_name, str):
            display_name = ""
        display_name = display_name.strip()[:128]
        channel = raw.get("channel")
        if not isinstance(channel, str) or not channel.strip():
            channel = "consumer"
        last_message_at = raw.get("last_message_at")
        if not isinstance(last_message_at, str) or not last_message_at.strip():
            last_message_at = None
        else:
            last_message_at = last_message_at.strip()[:128]
        seen.add(conversation_id)
        items.append({
            "platform_conversation_id": conversation_id,
            "peer_platform_user_id": peer_id,
            "peer_display_name": display_name,
            "channel": channel.strip()[:32],
            "last_message_at": last_message_at,
        })
    return items


def _page_after(items, cursor, limit):
    """Return one page and its stable platform-ID cursor."""
    start = 0
    if cursor is not None:
        for index, item in enumerate(items):
            if item["platform_conversation_id"] == cursor:
                start = index + 1
                break
        else:
            raise _error(
                protocol.ERR_INVALID_REQUEST,
                "conversation cursor is no longer available",
                detail={"operation": "conversations.list", "reason": "cursor_not_found"},
            )
    page = items[start:start + limit]
    next_cursor = None
    if start + limit < len(items) and page:
        next_cursor = page[-1]["platform_conversation_id"]
    return page, next_cursor


def _extract(page):
    try:
        raw_items = page.evaluate(EXTRACT_JS) or []
        normalized = _normalize_items(raw_items)
        if raw_items and not normalized:
            raise _error(
                protocol.ERR_BROWSER_SELECTOR_CHANGED,
                "conversation rows have no stable platform identity",
            )
        return normalized
    except protocol.ProtocolError:
        raise
    except Exception as exc:
        raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "conversation list selectors are unavailable") from exc


def _collect(page, cursor, limit):
    """Scroll until the requested page plus one look-ahead item is present."""
    collected = []
    seen = set()
    stable_rounds = 0
    cursor_seen = cursor is None

    for _ in range(MAX_SCROLL_ROUNDS):
        before = len(collected)
        for item in _extract(page):
            conversation_id = item["platform_conversation_id"]
            if conversation_id in seen:
                continue
            seen.add(conversation_id)
            collected.append(item)
            if conversation_id == cursor:
                cursor_seen = True

        if len(collected) == before:
            stable_rounds += 1
        else:
            stable_rounds = 0

        if cursor_seen:
            page_items, next_cursor = _page_after(collected, cursor, limit)
            if next_cursor is not None or stable_rounds >= STABLE_ROUNDS:
                return page_items, next_cursor
        elif stable_rounds >= STABLE_ROUNDS:
            raise _error(
                protocol.ERR_INVALID_REQUEST,
                "conversation cursor is no longer available",
                detail={"operation": "conversations.list", "reason": "cursor_not_found"},
            )

        try:
            page.mouse.wheel(0, 900)
        except Exception:
            pass
        page.wait_for_timeout(700)

    raise _error(
        protocol.ERR_ADAPTER_INCOMPATIBLE,
        "conversation list pagination did not stabilize",
        detail={"operation": "conversations.list", "reason": "pagination_not_stable"},
    )


def list_conversations(input_data):
    state_path, cursor, limit = _validate_input(input_data)
    with browser.launch(state_in=state_path) as (_pw, _browser, context, page):
        page.goto(CHAT_URL, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(2_000)
        if _visible_text(page, CHALLENGE_TEXTS):
            raise _error(protocol.ERR_CHALLENGE_REQUIRED, "platform challenge is required")
        if not _cookies_have_session(context):
            raise _error(protocol.ERR_SESSION_EXPIRED, "session is no longer valid")
        if _visible_text(page, RATE_LIMIT_TEXTS):
            raise _error(protocol.ERR_PLATFORM_RATE_LIMITED, "platform rate limit was detected")
        try:
            marker = page.locator(LIST_MARKER)
            marker.first.wait_for(state="attached", timeout=25_000)
        except Exception as exc:
            raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "conversation list selectors are unavailable") from exc
        items, next_cursor = _collect(page, cursor, limit)
        return {"items": items, "next_cursor": next_cursor}
