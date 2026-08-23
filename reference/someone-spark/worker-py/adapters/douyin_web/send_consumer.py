import time

from . import selectors as S
from .browser import launch, missing_playwright
from .guard import logged_in, rate_limited
from .io import done, fail

def open_chat(page):
    for _ in range(3):
        try:
            page.goto(S.CHAT_URL, wait_until="domcontentloaded", timeout=90000)
            return True
        except Exception:
            time.sleep(2)
    return False

def _find_contact(page, name):
    exact = page.get_by_text(name, exact=True)
    if exact.count():
        return exact.first
    return page.locator(S.CONTACT_TITLE).filter(has_text=name).first

def verify_conversation(page, name):
    for exact in (True, False):
        try:
            loc = page.get_by_text(name, exact=exact)
            for i in range(loc.count()):
                try:
                    box = loc.nth(i).bounding_box()
                except Exception:
                    continue
                if box and box.get("x", 0) > 300 and box.get("y", 0) < 100:
                    return True
        except Exception:
            continue
    return False

def _search_open(page, name):
    try:
        box = page.get_by_placeholder(S.SEARCH_PLACEHOLDER, exact=False).first
        if box.count() == 0:
            return False
        box.click()
        box.fill(name)
        page.wait_for_timeout(2500)
        btn = page.get_by_text(S.OPEN_CHAT_TEXT, exact=False).first
        if btn.count():
            btn.click(force=True)
            page.wait_for_timeout(2000)
            return True
        cand = page.get_by_text(name, exact=True).first
        if cand.count() == 0:
            cand = page.get_by_text(name, exact=False).first
        if cand.count() == 0:
            return False
        cand.click(force=True)
        page.wait_for_timeout(1200)
        btn = page.get_by_text(S.OPEN_CHAT_TEXT, exact=False).first
        if btn.count():
            btn.click(force=True)
        return True
    except Exception:
        return False

def locate_contact(page, name):
    for _ in range(5):
        try:
            target = _find_contact(page, name)
            if target.count():
                target.click(force=True, timeout=10000)
                page.wait_for_timeout(1500)
                if verify_conversation(page, name):
                    return True
            else:
                try:
                    page.mouse.move(200, 350)
                    page.mouse.wheel(0, 600)
                except Exception:
                    pass
                page.wait_for_timeout(800)
        except Exception:
            page.wait_for_timeout(600)
    if _search_open(page, name):
        page.wait_for_timeout(1200)
        return verify_conversation(page, name)
    return False

def type_and_send(page, editor, text):
    editor.click()
    page.wait_for_timeout(200)
    page.keyboard.press("Control+A")
    page.keyboard.press("Delete")
    page.wait_for_timeout(150)
    page.keyboard.type(text, delay=40)
    cur = editor.inner_text() or ""
    if text not in cur:
        return False
    page.keyboard.press("Enter")
    return True

def wait_cleared(editor, text, wait=8):
    deadline = time.time() + wait
    while time.time() < deadline:
        time.sleep(0.4)
        try:
            cur = editor.inner_text() or ""
            if text not in cur:
                return True
        except Exception:
            pass
    return False

def last_platform_id(page, text):
    try:
        return page.evaluate(
            """(want) => {
                const items = Array.from(document.querySelectorAll('[class*="MessageItem"]'));
                for (let i = items.length - 1; i >= 0; i--) {
                    const t = (items[i].innerText || '').trim();
                    if (t.indexOf(want) !== -1) {
                        return items[i].getAttribute('data-msg-id')
                            || items[i].getAttribute('id')
                            || '';
                    }
                }
                return '';
            }""",
            text,
        ) or ""
    except Exception:
        return ""

def send_in_thread(page, text, dry_run=False):
    hit = rate_limited(page)
    if hit:
        return False, "rate_limited", "发送前出现「%s」" % hit, ""
    editor = page.locator(S.CONSUMER_EDITOR).first
    try:
        if editor.count() == 0 or editor.bounding_box() is None:
            return False, "no_editor", "找不到聊天输入框", ""
        editor.wait_for(state="visible", timeout=8000)
    except Exception:
        return False, "no_editor", "找不到聊天输入框", ""
    if dry_run:
        return True, "", "dry_run", ""
    if not type_and_send(page, editor, text):
        return False, "input_failed", "文字未能进入输入框", ""
    if wait_cleared(editor, text, wait=8):
        mid = last_platform_id(page, text)
        return True, "", "ok", mid
    hit = rate_limited(page)
    if hit:
        return False, "rate_limited", "重试时出现「%s」" % hit, ""
    if not type_and_send(page, editor, text):
        return False, "input_failed", "重试时文字未能进入输入框", ""
    if wait_cleared(editor, text, wait=8):
        mid = last_platform_id(page, text)
        return True, "", "ok", mid
    return False, "not_confirmed", "发送后输入框未清空，消息可能未发出", ""

def send_text(req):
    state_in = req.get("state_in") or ""
    name = (req.get("friend_display_name") or "").strip()
    body = req.get("body") or ""
    dry = bool(req.get("dry_run"))
    if not state_in:
        return fail("no_session", "缺少登录态文件")
    if not name or not body:
        return fail("bad_request", "缺少好友或正文")
    try:
        with launch(state_in=state_in) as (_pw, _b, context, page):
            if not open_chat(page):
                return fail("chat_open_failed", "无法打开抖音私信页")
            page.wait_for_timeout(3000)
            ok, why = logged_in(page, context)
            if not ok:
                return fail("expired", why)
            if not locate_contact(page, name):
                return fail("not_found", "未能切换到「%s」的会话" % name)
            ok, code, msg, mid = send_in_thread(page, body, dry_run=dry)
            if not ok:
                return fail(code, msg)
            confirmed = True
            if dry:
                return done(True, confirmed=True, dry_run=True, platform_msg_id="")
            return done(True, confirmed=confirmed, platform_msg_id=mid or ("cleared:" + name))
    except RuntimeError as e:
        if str(e) == "playwright_missing":
            return missing_playwright()
        return fail("sidecar", str(e))
    except Exception as e:
        return fail("sidecar", "发送异常：%s" % e)
