from .browser import launch, missing_playwright
from .guard import logged_in
from .io import done, fail
from .send_consumer import locate_contact, open_chat

_ARCHIVE_JS = """
() => {
  function vis(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }
  function clean(t) { return (t || '').replace(/\\s+/g, ' ').trim(); }
  const status = ['已读','送达','未读','已送达','点亮中','已撤回','该消息类型暂不能展示','系统消息'];
  function isStatus(text) {
    if (!text || text.length > 40) return false;
    return status.some((w) => text.indexOf(w) !== -1);
  }
  let editorTop = window.innerHeight;
  document.querySelectorAll('[contenteditable="true"]').forEach((ed) => {
    if (!vis(ed)) return;
    const r = ed.getBoundingClientRect();
    if (r.top > window.innerHeight * 0.45 && r.top < editorTop) editorTop = r.top;
  });
  const seen = {};
  const results = [];
  function push(el, text, isSelf) {
    if (!text || text.length > 500 || isStatus(text)) return;
    const r = el.getBoundingClientRect();
    const key = text + '|' + Math.round(r.top / 6) + '|' + (isSelf ? '1' : '0');
    if (seen[key]) return;
    seen[key] = 1;
    const img = el.querySelector('img');
    results.push({
      body: text,
      direction: isSelf ? 'out' : 'in',
      msg_type: img && !text ? 'image' : 'text',
      media_url: img ? (img.src || '') : '',
      top: r.top,
    });
  }
  function fromMe(el) {
    let n = el;
    for (let i = 0; i < 6 && n; i++) {
      const cls = ((n.className || '') + '').toString();
      if (/isFromMe/i.test(cls)) return true;
      n = n.parentElement;
    }
    return Boolean(el.querySelector('[class*="isFromMe"]'));
  }
  document.querySelectorAll('[class*="MessageItem"]').forEach((el) => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.top > editorTop + 8) return;
    const p = el.parentElement;
    if (p && /MessageItem/i.test(((p.className || '') + '').toString())) return;
    let text = '';
    const pure = el.querySelector('[class*="pureText"]');
    if (pure) text = clean(pure.innerText || pure.textContent || '');
    if (!text) {
      const bubble = el.querySelector('[class*="bubbleTextContent"]');
      if (bubble) text = clean(bubble.innerText || bubble.textContent || '');
    }
    if (!text) text = clean(el.innerText || el.textContent || '');
    push(el, text, fromMe(el));
  });
  if (!results.length) {
    document.querySelectorAll('[class*="MessageBoxContentrow"]').forEach((el) => {
      if (!vis(el)) return;
      const r = el.getBoundingClientRect();
      if (r.top > editorTop + 8) return;
      push(el, clean(el.innerText || el.textContent || ''), fromMe(el));
    });
  }
  results.sort((a, b) => a.top - b.top);
  return results.map(({ body, direction, msg_type, media_url }) => ({ body, direction, msg_type, media_url }));
}
"""

def run(req):
    state_in = req.get("state_in") or ""
    name = (req.get("friend_display_name") or "").strip()
    if not state_in:
        return fail("no_session", "缺少登录态文件")
    if not name:
        return fail("not_found", "缺少好友名")
    try:
        with launch(state_in=state_in) as (_pw, _b, context, page):
            if not open_chat(page):
                return fail("chat_open_failed", "无法打开抖音私信页")
            page.wait_for_timeout(3000)
            ok, why = logged_in(page, context)
            if not ok:
                return fail("expired", why)
            if not locate_contact(page, name):
                return fail("not_found", "未打开「%s」的会话" % name)
            page.wait_for_timeout(800)
            rows = page.evaluate(_ARCHIVE_JS) or []
            return done(True, messages=rows)
    except RuntimeError as e:
        if str(e) == "playwright_missing":
            return missing_playwright()
        return fail("sidecar", str(e))
    except Exception as e:
        return fail("sidecar", "归档异常：%s" % e)
