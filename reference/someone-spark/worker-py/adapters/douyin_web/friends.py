import time

from . import selectors as S
from .browser import launch, missing_playwright
from .guard import logged_in, rate_limited
from .io import done, fail

_EXTRACT_JS = """
() => {
  const out = [];
  const seen = new Set();
  document.querySelectorAll('.conversationConversationItemtitle').forEach((t) => {
    const name = (t.textContent || '').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    const wrap = t.parentElement;
    const s = wrap ? wrap.querySelector('.commonStreaknormalText') : null;
    let days = 0;
    if (s) {
      const m = (s.textContent || '').match(/(\\d+)/);
      if (m) days = parseInt(m[1], 10) || 0;
    }
    out.push({ display_name: name, nickname: name, streak_days: days, has_conversation: true });
  });
  return out;
}
"""

_CREATOR_EXTRACT = """
() => {
  const out = [];
  const seen = new Set();
  document.querySelectorAll('[class*="item-header-name-"]').forEach((el) => {
    const name = (el.textContent || '').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push({ display_name: name, nickname: name, has_conversation: false });
  });
  return out;
}
"""

def _open_chat(page):
    for _ in range(3):
        try:
            page.goto(S.CHAT_URL, wait_until="domcontentloaded", timeout=90000)
            return True
        except Exception:
            time.sleep(2)
    return False

def _scroll_list(page, collected, js, rounds=18):
    stable = 0
    for _ in range(rounds):
        batch = page.evaluate(js) or []
        before = len(collected)
        have = {x.get("display_name") for x in collected}
        for item in batch:
            name = (item.get("display_name") or "").strip()
            if name and name not in have:
                collected.append(item)
                have.add(name)
        if len(collected) == before:
            stable += 1
            if stable >= 2:
                break
        else:
            stable = 0
        try:
            page.mouse.move(200, 350)
            page.mouse.wheel(0, 800)
        except Exception:
            pass
        page.wait_for_timeout(900)

def list_friends(req):
    state_in = req.get("state_in") or ""
    if not state_in:
        return fail("no_session", "缺少登录态文件")
    try:
        with launch(state_in=state_in) as (_pw, _b, context, page):
            if not _open_chat(page):
                return fail("chat_open_failed", "无法打开抖音私信页")
            page.wait_for_timeout(4000)
            ok, why = logged_in(page, context)
            if not ok:
                return fail("expired", why)
            hit = rate_limited(page)
            if hit:
                return fail("rate_limited", "好友列表出现「%s」" % hit)
            collected = []
            try:
                page.wait_for_selector(S.CONTACT_TITLE, timeout=25000)
            except Exception:
                pass
            _scroll_list(page, collected, _EXTRACT_JS)
            return done(True, friends=collected)
    except RuntimeError as e:
        if str(e) == "playwright_missing":
            return missing_playwright()
        return fail("sidecar", str(e))
    except Exception as e:
        return fail("sidecar", "同步好友异常：%s" % e)

def harvest_creator(req):
    state_in = req.get("state_in") or ""
    if not state_in:
        return fail("no_session", "缺少登录态文件")
    try:
        with launch(state_in=state_in, viewport={"width": 1366, "height": 900}) as (_pw, _b, context, page):
            page.goto(S.CREATOR_CHAT_URL, wait_until="domcontentloaded", timeout=90000)
            page.wait_for_timeout(4000)
            ok, why = logged_in(page, context)
            if not ok:
                return fail("expired", why)
            try:
                tab = page.get_by_text(S.CREATOR_FRIENDS_TAB_TEXT, exact=False).first
                if tab.count():
                    tab.click(timeout=4000)
                    page.wait_for_timeout(1200)
            except Exception:
                pass
            collected = []
            _scroll_list(page, collected, _CREATOR_EXTRACT, rounds=24)
            return done(True, friends=collected)
    except RuntimeError as e:
        if str(e) == "playwright_missing":
            return missing_playwright()
        return fail("sidecar", str(e))
    except Exception as e:
        return fail("sidecar", "创作者好友采集异常：%s" % e)
