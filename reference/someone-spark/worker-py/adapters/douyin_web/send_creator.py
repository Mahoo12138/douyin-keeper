from . import selectors as S
from .browser import launch, missing_playwright
from .guard import logged_in, rate_limited
from .io import done, fail
from .send_consumer import last_platform_id, type_and_send, wait_cleared

_SCROLL = """
() => {
  const els = document.querySelectorAll('[class*="semi-list"], #sub-app ul');
  let el = null;
  for (const e of els) {
    if (e.scrollHeight > e.clientHeight + 10) { el = e; break; }
  }
  if (!el) {
    const all = [...document.querySelectorAll('div')].filter(
      (x) => x.scrollHeight > x.clientHeight + 100 && x.clientHeight > 100
    );
    if (all.length) el = all[0];
  }
  if (el && el.scrollTop + el.clientHeight < el.scrollHeight - 10) {
    el.scrollTop += 600;
    return true;
  }
  return false;
}
"""

def _open_friends_tab(page):
    try:
        tab = page.get_by_text(S.CREATOR_FRIENDS_TAB_TEXT, exact=False).first
        if tab.count() and tab.is_visible():
            tab.click(timeout=4000)
            page.wait_for_timeout(1000)
            return True
    except Exception:
        pass
    return False

def _find_name(page, nickname):
    items = page.locator(S.CREATOR_FRIEND_ITEM)
    n = items.count()
    names = set()
    for i in range(n):
        it = items.nth(i)
        try:
            span = it.locator(S.CREATOR_FRIEND_NAME)
            if span.count() == 0:
                continue
            name = (span.inner_text() or "").strip()
            names.add(name)
            if name == nickname:
                it.click(timeout=5000)
                return True, names
        except Exception:
            continue
    return False, names

def send_first(req):
    state_in = req.get("state_in") or ""
    name = (req.get("friend_display_name") or "").strip()
    body = req.get("body") or ""
    dry = bool(req.get("dry_run"))
    if not state_in:
        return fail("no_session", "缺少登录态文件")
    if not name or not body:
        return fail("bad_request", "缺少好友或正文")
    try:
        with launch(state_in=state_in, viewport={"width": 1366, "height": 900}) as (_pw, _b, context, page):
            page.goto(S.CREATOR_CHAT_URL, wait_until="domcontentloaded", timeout=90000)
            page.wait_for_timeout(4000)
            ok, why = logged_in(page, context)
            if not ok:
                return fail("expired", why)
            _open_friends_tab(page)
            found = False
            stagnant = 0
            last = set()
            for _ in range(80):
                hit = rate_limited(page)
                if hit:
                    return fail("rate_limited", "创作者页出现「%s」" % hit)
                found, names = _find_name(page, name)
                if found:
                    break
                grew = len(names) > len(last)
                last = names
                try:
                    moved = bool(page.evaluate(_SCROLL))
                except Exception:
                    moved = False
                page.wait_for_timeout(400)
                if not moved and not grew:
                    stagnant += 1
                    if stagnant >= 6:
                        break
                else:
                    stagnant = 0
            if not found:
                return fail("not_found", "创作者好友列表未找到「%s」" % name)
            editor = page.locator(S.CREATOR_EDITOR).first
            try:
                editor.wait_for(state="visible", timeout=15000)
            except Exception:
                editor = page.locator(S.CONSUMER_EDITOR).first
                try:
                    editor.wait_for(state="visible", timeout=8000)
                except Exception:
                    return fail("no_editor", "未找到创作者聊天输入框")
            if dry:
                return done(True, confirmed=True, dry_run=True, platform_msg_id="")
            if not type_and_send(page, editor, body):
                return fail("input_failed", "文字未能进入创作者输入框")
            if not wait_cleared(editor, body, wait=8):
                return fail("not_confirmed", "发送后输入框未清空，首聊可能未发出")
            mid = last_platform_id(page, body)
            return done(True, confirmed=True, platform_msg_id=mid or ("cleared:" + name))
    except RuntimeError as e:
        if str(e) == "playwright_missing":
            return missing_playwright()
        return fail("sidecar", str(e))
    except Exception as e:
        return fail("sidecar", "创作者首聊异常：%s" % e)
