"""Douyin consumer friend-list adapter for Sidecar Protocol v1."""

import browser
import protocol


CHAT_URL = "https://www.douyin.com/chat"
SESSION_COOKIE_NAMES = ("sessionid", "sessionid_ss", "sid_tt")
CHALLENGE_TEXTS = ("安全验证", "滑动验证", "人机验证", "身份验证")
RATE_LIMIT_TEXTS = ("操作频繁", "请求过于频繁", "访问受限")

EXTRACT_JS = r"""
() => {
  const rows = Array.from(document.querySelectorAll(
    '.conversationConversationItemtitle, [class*="conversationConversationItem"]'
  ));
  const result = [];
  const seen = new Set();
  const attr = (node, names) => {
    for (const name of names) {
      const value = node?.getAttribute?.(name);
      if (value) return value.trim();
    }
    return '';
  };
  const text = (node) => (node?.textContent || '').trim();
  for (const title of rows) {
    const displayName = text(title);
    if (!displayName || displayName.length > 128) continue;
    let row = title;
    for (let i = 0; i < 5 && row; i += 1) row = row.parentElement;
    row = row || title;
    const platformUserId = attr(row, ['data-user-id', 'data-uid', 'data-userid']) ||
      attr(title, ['data-user-id', 'data-uid', 'data-userid']);
    const conversationId = attr(row, ['data-conversation-id', 'data-conversationid']) ||
      attr(title, ['data-conversation-id', 'data-conversationid']);
    const href = row.querySelector?.('a[href*="/user/"]')?.getAttribute('href') || '';
    const hrefID = href.match(/\/user\/([^/?#]+)/)?.[1] || '';
    const platformID = platformUserId || hrefID;
    const key = platformID || conversationId || displayName;
    if (seen.has(key)) continue;
    seen.add(key);
    const image = row.querySelector?.('img');
    const streakText = text(row.querySelector?.('[class*="streak"], [class*="Streak"]'));
    const streak = Number(streakText.match(/(\d+)/)?.[1] || 0);
    result.push({
      platform_user_id: platformID || null,
      identity_status: platformID ? 'resolved' : 'pending',
      display_name: displayName,
      nickname: displayName,
      short_id: null,
      avatar_url: image?.currentSrc || image?.src || null,
      streak_days: Number.isFinite(streak) ? streak : 0,
      has_conversation: true,
      conversation: conversationId ? {
        platform_conversation_id: conversationId,
        channel: 'consumer',
      } : null,
    });
  }
  return result;
}
"""


def _error(code, message, retryable=False):
    return protocol.ProtocolError(code, message, retryable=retryable)


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


def _extract(page):
    try:
        rows = page.evaluate(EXTRACT_JS) or []
    except Exception as exc:
        raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "friend list selectors are unavailable") from exc
    if not isinstance(rows, list):
        raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "friend list result is invalid")
    return [row for row in rows if isinstance(row, dict)]


def list_friends(input_data):
    if not isinstance(input_data, dict):
        raise _error(protocol.ERR_INVALID_REQUEST, "input must be an object")
    if set(input_data) - {"session"}:
        raise _error(protocol.ERR_INVALID_REQUEST, "input contains unknown fields")
    state_path = protocol._session_file(input_data)
    with browser.launch(state_in=state_path) as (_pw, _browser, context, page):
        page.goto(CHAT_URL, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(2_000)
        if _visible_text(page, CHALLENGE_TEXTS):
            raise _error(protocol.ERR_CHALLENGE_REQUIRED, "platform challenge is required")
        if not _cookies_have_session(context):
            raise _error(protocol.ERR_SESSION_EXPIRED, "session is no longer valid")
        if _visible_text(page, RATE_LIMIT_TEXTS):
            raise _error(protocol.ERR_PLATFORM_RATE_LIMITED, "platform rate limit was detected")

        collected = []
        seen = set()
        stable_rounds = 0
        for _ in range(24):
            before = len(collected)
            for item in _extract(page):
                key = item.get("platform_user_id") or (
                    (item.get("conversation") or {}).get("platform_conversation_id")
                ) or item.get("display_name")
                if key and key not in seen:
                    seen.add(key)
                    collected.append(item)
            if len(collected) == before:
                stable_rounds += 1
                if stable_rounds >= 3:
                    break
            else:
                stable_rounds = 0
            try:
                page.mouse.wheel(0, 900)
            except Exception:
                pass
            page.wait_for_timeout(700)
        return {"friends": collected, "complete": True}
