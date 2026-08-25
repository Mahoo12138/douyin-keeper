"""Douyin consumer friend-list adapter for Sidecar Protocol v1."""

import browser
import protocol


SELF_URL = "https://www.douyin.com/user/self"
SESSION_COOKIE_NAMES = ("sessionid", "sessionid_ss", "sid_tt")
CHALLENGE_TEXTS = ("安全验证", "滑动验证", "人机验证", "身份验证")
RATE_LIMIT_TEXTS = ("操作频繁", "请求过于频繁", "访问受限")
_NETWORK_FRIENDS = {}


def _is_mutual_friend(row, from_follower_list=False):
    if str(row.get("follow_status")) != "2":
        return False
    # Every row from follower/list is already known to follow the account;
    # older response variants omit follower_status in that endpoint.
    return from_follower_list or str(row.get("follower_status")) == "1"


def _avatar_url(row):
    avatar = row.get("avatar_thumb") or row.get("avatar_medium") or row.get("avatar_larger")
    if isinstance(avatar, dict):
        values = avatar.get("url_list")
        if isinstance(values, list) and values:
            return str(values[0]).strip() or None
    if isinstance(avatar, str):
        return avatar.strip() or None
    return None


def _friend_from_relation(row, from_follower_list=False):
    if not isinstance(row, dict) or not _is_mutual_friend(row, from_follower_list):
        return None
    platform_user_id = str(row.get("sec_uid") or row.get("uid") or "").strip()
    display_name = str(row.get("remark_name") or row.get("nickname") or "").strip()
    if not platform_user_id or not display_name or len(display_name) > 128:
        return None
    return {
        "platform_user_id": platform_user_id[:256],
        "identity_status": "resolved",
        "display_name": display_name,
        "nickname": str(row.get("nickname") or display_name).strip()[:128],
        "short_id": str(row.get("short_id") or "").strip()[:128] or None,
        "avatar_url": _avatar_url(row),
        "streak_days": 0,
        "has_conversation": False,
        "conversation": None,
    }


def _capture_relation_response(response):
    """Collect only users from the authenticated account's follower list."""
    global _NETWORK_FRIENDS
    try:
        if response.request.resource_type not in ("xhr", "fetch"):
            return
        payload = response.json()
    except Exception:
        return
    url = response.url.split("?", 1)[0]
    if not url.endswith("/aweme/v1/web/user/follower/list/") or not isinstance(payload, dict):
        return

    def walk(value, depth=0):
        if depth > 6:
            return
        if isinstance(value, dict):
            if value.get("sec_uid") or value.get("uid"):
                item = _friend_from_relation(value, from_follower_list=True)
                if item:
                    _NETWORK_FRIENDS[item["platform_user_id"]] = item
            for child in value.values():
                walk(child, depth + 1)
        elif isinstance(value, list):
            for child in value[:100]:
                walk(child, depth + 1)

    walk(payload)

EXTRACT_JS = r"""
() => {
  const titles = Array.from(document.querySelectorAll('.conversationConversationItemtitle'));
  const rows = titles.length ? titles : Array.from(document.querySelectorAll('[class*="conversationConversationItem"]'));
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
  const userIDFrom = (nodes) => {
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
    const platformID = userIDFrom(nodes);
    const conversationId = conversationIDFrom(nodes);
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
    global _NETWORK_FRIENDS
    if not isinstance(input_data, dict):
        raise _error(protocol.ERR_INVALID_REQUEST, "input must be an object")
    if set(input_data) - {"session"}:
        raise _error(protocol.ERR_INVALID_REQUEST, "input contains unknown fields")
    state_path = protocol._session_file(input_data)
    _NETWORK_FRIENDS = {}
    with browser.launch(state_in=state_path) as (_pw, _browser, context, page):
        try:
            page.on("response", _capture_relation_response)
        except Exception:
            pass
        page.goto(SELF_URL, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(2_000)
        try:
            followers = page.locator("a").filter(has_text="粉丝")
            if followers.count() and followers.first.is_visible():
                followers.first.click(timeout=5_000)
                page.wait_for_timeout(5_000)
            else:
                followers = page.get_by_text("粉丝", exact=True)
                for index in range(followers.count() - 1, -1, -1):
                    try:
                        candidate = followers.nth(index)
                        if candidate.is_visible():
                            candidate.click(timeout=5_000, force=True)
                            page.wait_for_timeout(5_000)
                            break
                    except Exception:
                        continue
                # Douyin's profile counters are sometimes rendered as a
                # text span inside a delegated-click container. Trigger the
                # same bubbling event on the visible counter and its parents
                # when Playwright's locator click cannot reach that handler.
                page.evaluate("""() => {
                    const nodes = Array.from(document.querySelectorAll('*'))
                      .filter(node => (node.textContent || '').trim() === '粉丝');
                    const target = nodes[nodes.length - 1];
                    for (let current = target, i = 0; current && i < 5; current = current.parentElement, i += 1) {
                      current.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, view: window}));
                    }
                }""")
                page.wait_for_timeout(5_000)
        except Exception:
            pass
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
            for item in _NETWORK_FRIENDS.values():
                key = item.get("platform_user_id")
                if key and key not in seen:
                    seen.add(key)
                    collected.append(dict(item))
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
        if not collected:
            raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "friend relation data is unavailable")
        return {"friends": collected, "complete": True}
