from .browser import launch, missing_playwright
from .guard import logged_in, rate_limited
from .io import done, fail
from .send_consumer import locate_contact, open_chat

_OPEN_BTN = """
() => {
  const sels = [
    '[class*="messageMsgInputiconAction"]',
    '[class*="componentsemojiemojiPanel"]',
    '[class*="emojiBtn"]',
    '[class*="EmojiBtn"]',
    '[aria-label*="表情"]',
    '[title*="表情"]',
  ];
  const bottom = window.innerHeight * 0.5;
  for (const s of sels) {
    const els = document.querySelectorAll(s);
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.top > bottom) {
        el.click();
        return true;
      }
    }
  }
  return false;
}
"""

_LIST_JS = """
() => {
  const panel = document.querySelector(
    '[class*="emojiEmojisModal"], [class*="emojiPanel"], [class*="stickerPanel"], [class*="EmojiModal"]'
  );
  const root = panel || document;
  const out = [];
  const seen = new Set();
  root.querySelectorAll('img').forEach((img, i) => {
    const src = img.currentSrc || img.src || '';
    if (!src || seen.has(src)) return;
    const r = img.getBoundingClientRect();
    if (r.width < 16 || r.height < 16) return;
    seen.add(src);
    const key = (img.getAttribute('alt') || img.getAttribute('data-key') || ('sticker_' + i)).slice(0, 64);
    out.push({ sticker_key: key, name: (img.getAttribute('alt') || key).slice(0, 64), preview_url: src.slice(0, 512) });
  });
  return out;
}
"""

def _open_panel(page):
    try:
        if page.evaluate(_OPEN_BTN):
            page.wait_for_timeout(800)
            return True
    except Exception:
        pass
    return False

def list_stickers(req):
    state_in = req.get("state_in") or ""
    name = (req.get("friend_display_name") or "").strip()
    if not state_in:
        return fail("no_session", "缺少登录态文件")
    try:
        with launch(state_in=state_in) as (_pw, _b, context, page):
            if not open_chat(page):
                return fail("chat_open_failed", "无法打开抖音私信页")
            page.wait_for_timeout(2500)
            ok, why = logged_in(page, context)
            if not ok:
                return fail("expired", why)
            if name:
                locate_contact(page, name)
            if not _open_panel(page):
                return done(True, stickers=[])
            rows = page.evaluate(_LIST_JS) or []
            return done(True, stickers=rows)
    except RuntimeError as e:
        if str(e) == "playwright_missing":
            return missing_playwright()
        return fail("sidecar", str(e))
    except Exception as e:
        return fail("sidecar", "表情列表异常：%s" % e)

def send_sticker(req):
    state_in = req.get("state_in") or ""
    name = (req.get("friend_display_name") or "").strip()
    key = (req.get("sticker_key") or "").strip()
    dry = bool(req.get("dry_run"))
    if not state_in or not name or not key:
        return fail("bad_request", "缺少登录态、好友或表情")
    try:
        with launch(state_in=state_in) as (_pw, _b, context, page):
            if not open_chat(page):
                return fail("chat_open_failed", "无法打开抖音私信页")
            page.wait_for_timeout(2500)
            ok, why = logged_in(page, context)
            if not ok:
                return fail("expired", why)
            if not locate_contact(page, name):
                return fail("not_found", "未能切换到「%s」的会话" % name)
            hit = rate_limited(page)
            if hit:
                return fail("rate_limited", "发送前出现「%s」" % hit)
            if not _open_panel(page):
                return fail("sticker_denied", "打不开表情面板")
            rows = page.evaluate(_LIST_JS) or []
            target = None
            for row in rows:
                if row.get("sticker_key") == key or row.get("name") == key:
                    target = row
                    break
            if not target and rows:
                for row in rows:
                    if key in (row.get("sticker_key") or "") or key in (row.get("preview_url") or ""):
                        target = row
                        break
            if not target:
                return fail("sticker_denied", "表情面板里没有该表情")
            if dry:
                return done(True, confirmed=True, dry_run=True, platform_msg_id="")
            src = target.get("preview_url") or ""
            clicked = page.evaluate(
                """(src) => {
                    const imgs = Array.from(document.querySelectorAll('img'));
                    const img = imgs.find((i) => (i.currentSrc || i.src) === src);
                    if (!img) return false;
                    img.click();
                    return true;
                }""",
                src,
            )
            if not clicked:
                return fail("sticker_denied", "未能点中表情")
            page.wait_for_timeout(800)
            return done(True, confirmed=True, platform_msg_id="sticker:" + key)
    except RuntimeError as e:
        if str(e) == "playwright_missing":
            return missing_playwright()
        return fail("sidecar", str(e))
    except Exception as e:
        return fail("sidecar", "表情发送异常：%s" % e)
