from . import selectors as S
from .browser import launch, mapped_fail
from .guard import has_session_cookie, logged_in
from .identity import public_identity
from .io import done, fail

def check(req):
    state_in = req.get("state_in") or ""
    if not state_in:
        return fail("no_session", "缺少登录态文件")
    try:
        with launch(state_in=state_in) as (_pw, _b, context, page):
            try:
                page.goto(S.CHAT_URL, wait_until="domcontentloaded", timeout=60000)
            except Exception:
                page.goto(S.HOME_URL, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(2500)
            ok, why = logged_in(page, context)
            if not ok and has_session_cookie(context):
                ok, why = True, "ok"
            nick, uid = "", ""
            try:
                nick, uid = public_identity(page, context)
            except Exception:
                pass
            status = "valid" if ok else "expired"
            return done(True, session_status=status, message="" if ok else why, nickname=nick, douyin_uid=uid)
    except RuntimeError as e:
        return mapped_fail(e, str(e))
    except Exception as e:
        return mapped_fail(e, "登录态检查异常")
