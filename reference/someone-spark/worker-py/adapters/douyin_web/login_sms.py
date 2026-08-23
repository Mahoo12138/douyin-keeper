import os
import time

from . import selectors as S
from .browser import export_state, launch, mapped_fail
from .guard import rate_limited, wait_session
from .identity import public_identity
from .io import done, emit, fail

# 首页不自动出登录层，须点顶栏右侧红色「登录」。超时内轮询，不假成功。
_LAYER_WAIT_S = 25
_LAYER_POLL_S = 0.6
_HEADER_WAIT_S = 22
_SWITCH_ROUNDS = 2
_AFTER_CLICK_S = 3.0
_CLICK_MS = 8000
_AFTER_HEADER_MS = 1500


def _scopes(page):
    out = [page]
    try:
        main = page.main_frame
        for fr in page.frames:
            if fr != main:
                out.append(fr)
    except Exception:
        pass
    return out


def _visible(loc):
    try:
        return bool(loc.count() and loc.first.is_visible())
    except Exception:
        return False


def _find_visible(page, selector):
    for scope in _scopes(page):
        try:
            loc = scope.locator(selector)
            if _visible(loc):
                return loc.first
        except Exception:
            continue
    return None


def _find_placeholder(page, text):
    for scope in _scopes(page):
        try:
            loc = scope.get_by_placeholder(text, exact=False)
            if _visible(loc):
                return loc.first
        except Exception:
            continue
    return None


def _find_text(page, text, exact=False):
    for scope in _scopes(page):
        try:
            loc = scope.get_by_text(text, exact=exact)
            if _visible(loc):
                return loc.first
        except Exception:
            continue
    return None


def _click_loc(loc, timeout=_CLICK_MS):
    n = min(loc.count(), 6)
    for i in range(n):
        el = loc.nth(i)
        try:
            if not el.is_visible():
                continue
            try:
                el.click(timeout=timeout, force=True)
                return True
            except Exception:
                el.click(timeout=timeout)
                return True
        except Exception:
            continue
    return False


def _job_token(req):
    req = req or {}
    for k in ("job_id", "sms_session"):
        v = "".join(c for c in str(req.get(k) or "") if c.isalnum() or c in "-_")[:40]
        if v:
            return v
    state = req.get("state_out") or ""
    base = os.path.basename(state)
    if base.startswith("login-") and base.endswith(".json"):
        return base[6:-5] or "anon"
    profile = (req.get("profile_dir") or "").rstrip("\\/")
    base = os.path.basename(profile)
    if base.startswith("sms-"):
        return base[4:] or "anon"
    return "anon"


def _tmp_dir(req):
    req = req or {}
    env = (os.environ.get("HUOHUA_TMP_DIR") or "").strip()
    if env:
        return env
    for k in ("state_out", "profile_dir"):
        p = req.get(k) or ""
        if p:
            d = os.path.dirname(os.path.abspath(p))
            if d:
                return d
    return os.environ.get("TMPDIR") or os.environ.get("TEMP") or os.path.join(os.getcwd(), "var", "tmp")


def _shot_rel(abs_path):
    n = (abs_path or "").replace("\\", "/")
    i = n.find("/var/tmp/")
    if i >= 0:
        return n[i + 1 :]
    i = n.find("var/tmp/")
    if i >= 0:
        return n[i:]
    return os.path.basename(abs_path)


def _save_debug(page, req):
    try:
        tmp = _tmp_dir(req)
        os.makedirs(tmp, exist_ok=True)
        path = os.path.join(tmp, "login-debug-%s.png" % _job_token(req))
        page.screenshot(path=path, timeout=8000, full_page=False)
        if os.path.isfile(path) and os.path.getsize(path) > 80:
            return _shot_rel(path)
    except Exception:
        pass
    return ""


def _login_btn_count(page):
    n = 0
    for scope in _scopes(page):
        try:
            loc = scope.get_by_text("登录", exact=True)
            for i in range(min(loc.count(), 16)):
                if loc.nth(i).is_visible():
                    n += 1
        except Exception:
            continue
    return n


def _is_captcha(page):
    word = rate_limited(page)
    if word in S.CAPTCHA_WORDS:
        return True
    try:
        url = (page.url or "").lower()
        if any(k in url for k in ("captcha", "verifycenter", "security")):
            return True
    except Exception:
        pass
    for text in S.CAPTCHA_WORDS:
        if _find_text(page, text) is not None:
            return True
    return False


def _page_diag(page, tried):
    url = ""
    title = ""
    qr_seen = False
    try:
        url = (page.url or "")[:180]
    except Exception:
        pass
    try:
        title = (page.title() or "")[:80]
    except Exception:
        pass
    try:
        qr = page.locator(S.QR_CONTAINER)
        qr_seen = _visible(qr)
    except Exception:
        pass
    if not qr_seen:
        try:
            qr_seen = _visible(page.locator(S.LOGIN_PANEL_PICTURE))
        except Exception:
            pass
    if not qr_seen:
        qr_seen = _find_text(page, "扫码登录") is not None
    names = []
    for x in tried:
        if x and x not in names:
            names.append(x)
    return {
        "url": url,
        "title": title,
        "qr_seen": qr_seen,
        "tried": names,
        "login_btn_count": _login_btn_count(page),
        "captcha": _is_captcha(page),
    }


def _fail_page(page, tried, code, message, req=None):
    d = _page_diag(page, tried)
    shot = _save_debug(page, req)
    if shot:
        d["screenshot"] = shot
    hint = " url=%s title=%s login_btn=%s captcha=%s shot=%s qr=%s tried=%s" % (
        d.get("url") or "-",
        d.get("title") or "-",
        d.get("login_btn_count", 0),
        "1" if d.get("captcha") else "0",
        d.get("screenshot") or "-",
        "1" if d.get("qr_seen") else "0",
        ",".join(d.get("tried") or []) or "-",
    )
    return fail(code, message + hint, **d)


def _fail_captcha(page, tried, req=None):
    return _fail_page(page, tried, "captcha_required", S.CAPTCHA_MSG, req)


def _has_login_layer(scope):
    for sel in S.LOGIN_LAYER_SELS:
        try:
            if _visible(scope.locator(sel)):
                return True
        except Exception:
            continue
    for text in S.LOGIN_LAYER_TEXTS:
        try:
            if _visible(scope.get_by_text(text, exact=False)):
                return True
        except Exception:
            continue
    try:
        if _visible(scope.get_by_placeholder(S.SMS_PHONE_PLACEHOLDER, exact=False)):
            return True
    except Exception:
        pass
    return False


def _any_login_layer(page):
    return any(_has_login_layer(scope) for scope in _scopes(page))


def _viewport(scope):
    try:
        page = scope if hasattr(scope, "viewport_size") else getattr(scope, "page", None)
        size = page.viewport_size if page else None
        if size:
            return int(size.get("width") or 1280), int(size.get("height") or 720)
    except Exception:
        pass
    return 1280, 720


def _is_header_login_box(box, width):
    if not box:
        return False
    y = box.get("y", 99)
    x = box.get("x", 0)
    return y < S.LOGIN_HEADER_MAX_Y and x > width * S.LOGIN_HEADER_MIN_X_RATIO


def _click_last_visible(loc):
    try:
        n = loc.count()
    except Exception:
        return False
    if not n:
        return False
    for i in range(n - 1, -1, -1):
        el = loc.nth(i)
        try:
            if not el.is_visible():
                continue
            try:
                el.click(timeout=_CLICK_MS, force=True)
                return True
            except Exception:
                el.click(timeout=_CLICK_MS)
                return True
        except Exception:
            continue
    return False


def _click_header_login(scope):
    width, _ = _viewport(scope)
    for sel in S.LOGIN_HEADER_SELS:
        try:
            loc = scope.locator(sel)
            n = min(loc.count(), 8)
            picked = None
            picked_x = -1
            for i in range(n):
                el = loc.nth(i)
                try:
                    if not el.is_visible():
                        continue
                    box = el.bounding_box()
                    if box and box.get("y", 99) >= S.LOGIN_HEADER_MAX_Y:
                        continue
                    x = (box or {}).get("x", 0)
                    if x >= picked_x:
                        picked = el
                        picked_x = x
                except Exception:
                    continue
            if picked is not None:
                try:
                    picked.click(timeout=_CLICK_MS, force=True)
                    return True
                except Exception:
                    try:
                        picked.click(timeout=_CLICK_MS)
                        return True
                    except Exception:
                        pass
            if _click_last_visible(loc):
                return True
        except Exception:
            continue
    try:
        btn = scope.get_by_role("button", name="登录", exact=True)
        n = min(btn.count(), 8)
        picked = None
        picked_x = -1
        for i in range(n):
            el = btn.nth(i)
            try:
                if not el.is_visible():
                    continue
                box = el.bounding_box()
                if not _is_header_login_box(box, width):
                    continue
                x = box.get("x", 0)
                if x >= picked_x:
                    picked = el
                    picked_x = x
            except Exception:
                continue
        if picked is not None:
            try:
                picked.click(timeout=_CLICK_MS, force=True)
                return True
            except Exception:
                try:
                    picked.click(timeout=_CLICK_MS)
                    return True
                except Exception:
                    pass
    except Exception:
        pass
    try:
        loc = scope.get_by_text("登录", exact=True)
        n = min(loc.count(), 10)
        picked = None
        picked_x = -1
        for i in range(n):
            el = loc.nth(i)
            try:
                if not el.is_visible():
                    continue
                box = el.bounding_box()
                if not _is_header_login_box(box, width):
                    continue
                x = box.get("x", 0)
                if x >= picked_x:
                    picked = el
                    picked_x = x
            except Exception:
                continue
        if picked is not None:
            try:
                picked.click(timeout=_CLICK_MS, force=True)
                return True
            except Exception:
                try:
                    picked.click(timeout=_CLICK_MS)
                    return True
                except Exception:
                    pass
    except Exception:
        pass
    return False


def _click_header_login_all(page):
    if _click_header_login(page):
        return True
    for scope in _scopes(page):
        if scope is page:
            continue
        if _click_header_login(scope):
            return True
    return False


def _js_click_header(page):
    try:
        return bool(page.evaluate(
            """() => {
                const nodes = Array.from(document.querySelectorAll('button, a, div, span, [role=button]'));
                const hits = [];
                for (const el of nodes) {
                    const t = (el.innerText || '').replace(/\\s+/g, ' ').trim();
                    if (t !== '登录' && t !== '登录 / 注册' && t !== '立即登录') continue;
                    const r = el.getBoundingClientRect();
                    if (r.width < 8 || r.height < 8 || r.top > 140) continue;
                    hits.push({el, x: r.x});
                }
                hits.sort((a, b) => b.x - a.x);
                if (!hits.length) return false;
                hits[0].el.click();
                return true;
            }"""
        ))
    except Exception:
        return False


def _click_header_coords(page):
    w, _ = _viewport(page)
    points = ((w - 56, 28), (w - 80, 32), (w - 104, 28), (w - 48, 22), (w - 130, 36))
    for x, y in points:
        try:
            page.mouse.click(x, y)
            try:
                page.wait_for_timeout(700)
            except Exception:
                time.sleep(0.7)
            if _any_login_layer(page):
                return True
        except Exception:
            continue
    return False


def _wait_after_click(page, ms=_AFTER_HEADER_MS):
    try:
        page.wait_for_timeout(ms)
    except Exception:
        time.sleep(ms / 1000.0)


def _header_login_visible(page):
    for scope in _scopes(page):
        width, _ = _viewport(scope)
        for sel in S.LOGIN_HEADER_SELS:
            try:
                loc = scope.locator(sel)
                n = min(loc.count(), 6)
                for i in range(n):
                    el = loc.nth(i)
                    if not el.is_visible():
                        continue
                    box = el.bounding_box()
                    if box and box.get("y", 99) < S.LOGIN_HEADER_MAX_Y:
                        return True
            except Exception:
                continue
        try:
            loc = scope.get_by_role("button", name="登录", exact=True)
            n = min(loc.count(), 8)
            for i in range(n):
                el = loc.nth(i)
                if el.is_visible() and _is_header_login_box(el.bounding_box(), width):
                    return True
        except Exception:
            continue
        try:
            loc = scope.get_by_text("登录", exact=True)
            n = min(loc.count(), 10)
            for i in range(n):
                el = loc.nth(i)
                if el.is_visible() and _is_header_login_box(el.bounding_box(), width):
                    return True
        except Exception:
            continue
    return False


def _wait_header_ready(page, timeout_s=_HEADER_WAIT_S):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if _any_login_layer(page):
            return True
        if _header_login_visible(page):
            return True
        try:
            nav = page.locator("header, nav")
            if nav.count():
                time.sleep(0.35)
                if _header_login_visible(page) or _any_login_layer(page):
                    return True
        except Exception:
            pass
        time.sleep(0.4)
    return _header_login_visible(page) or _any_login_layer(page)


def _wait_layer(page, timeout_s):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if _any_login_layer(page):
            return True
        time.sleep(_LAYER_POLL_S)
    return _any_login_layer(page)


def _dismiss_cookie_wall(page):
    for text in S.COOKIE_ACCEPT_TEXTS:
        try:
            if _click_loc(page.get_by_role("button", name=text, exact=True)):
                return True
        except Exception:
            pass
        try:
            loc = page.get_by_text(text, exact=True)
            n = min(loc.count(), 4)
            for i in range(n):
                el = loc.nth(i)
                try:
                    if not el.is_visible():
                        continue
                    box = el.bounding_box()
                    if box and box.get("y", 0) > 360:
                        el.click(timeout=_CLICK_MS, force=True)
                        return True
                except Exception:
                    continue
        except Exception:
            continue
    for text in getattr(S, "COOKIE_CLOSE_TEXTS", ()):
        try:
            loc = page.get_by_text(text, exact=True)
            n = min(loc.count(), 3)
            for i in range(n):
                el = loc.nth(i)
                try:
                    if not el.is_visible():
                        continue
                    box = el.bounding_box()
                    if box and box.get("y", 0) > 400:
                        el.click(timeout=_CLICK_MS, force=True)
                        return True
                except Exception:
                    continue
        except Exception:
            continue
    return False


def _prepare_home(page):
    _wait_after_click(page, 1800)
    _dismiss_cookie_wall(page)
    _wait_after_click(page, 400)
    if _is_captcha(page):
        return "captcha"
    word = rate_limited(page)
    if word and ("频繁" in word or word in S.FREQ_WORDS):
        return "freq:%s" % word
    return "ok"


def _ensure_login_layer(page, tried, timeout_s=None):
    budget = _LAYER_WAIT_S if timeout_s is None else timeout_s
    deadline = time.time() + max(1, float(budget))
    def remain():
        return max(0, deadline - time.time())
    _dismiss_cookie_wall(page)
    wait_h = min(_HEADER_WAIT_S, remain())
    if wait_h > 0:
        _wait_header_ready(page, wait_h)
    if _any_login_layer(page):
        return True
    if remain() <= 0:
        return False
    tried.append("click_header_login")
    _click_header_login_all(page)
    _wait_after_click(page, min(_AFTER_CLICK_S * 1000, remain() * 1000))
    if _wait_layer(page, min(8, remain())):
        return True
    if remain() <= 0.5:
        return _any_login_layer(page)
    tried.append("click_header_js")
    if _js_click_header(page):
        _wait_after_click(page, min(1500, remain() * 1000))
        if _wait_layer(page, min(6, remain())):
            return True
    if remain() <= 0.5:
        return _any_login_layer(page)
    tried.append("click_header_xy")
    if _click_header_coords(page):
        _wait_after_click(page, min(1500, remain() * 1000))
        if _wait_layer(page, min(6, remain())):
            return True
    if remain() <= 0.3:
        return _any_login_layer(page)
    _dismiss_cookie_wall(page)
    _click_header_login_all(page)
    return _wait_layer(page, min(4, remain()))


def _phone_box(page):
    return _find_visible(page, S.SMS_PHONE_INPUT) or _find_placeholder(page, S.SMS_PHONE_PLACEHOLDER)


def _code_box(page):
    return _find_visible(page, S.SMS_CODE_INPUT) or _find_placeholder(page, S.SMS_CODE_PLACEHOLDER)


def _get_code_btn(page):
    loc = _find_visible(page, S.SMS_GET_CODE)
    if loc is not None:
        return loc
    return _find_text(page, S.SMS_GET_CODE_TEXT, exact=True) or _find_text(page, S.SMS_GET_CODE_TEXT)


def _wait_phone(page, timeout_s):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if _phone_box(page) is not None:
            return True
        time.sleep(0.3)
    return False


def _try_panel_autospark(scope):
    try:
        loc = scope.locator(S.SMS_PANEL_SWITCH)
        return _click_loc(loc)
    except Exception:
        return False


def _try_sms_texts(scope):
    for text in S.SMS_TAB_TEXTS:
        try:
            if _click_loc(scope.get_by_text(text, exact=False)):
                return True
        except Exception:
            continue
    return False


def _try_pwd_code_tab(scope):
    pwd = False
    try:
        loc = scope.get_by_text(S.PWD_LOGIN_TEXT, exact=False)
        for i in range(min(loc.count(), 4)):
            if loc.nth(i).is_visible():
                pwd = True
                break
    except Exception:
        pass
    if not pwd:
        return False
    for role in ("tab", "link", "button"):
        for name in S.SMS_MODE_TEXTS:
            try:
                if _click_loc(scope.get_by_role(role, name=name)):
                    return True
            except Exception:
                continue
    for text in S.SMS_MODE_TEXTS:
        try:
            if _click_loc(scope.get_by_text(text, exact=False)):
                return True
        except Exception:
            continue
    return False


def _try_qr_footer(scope):
    try:
        panel = scope.locator(S.LOGIN_PANEL)
        if not panel.count():
            return False
        cand = panel.locator("p, span, a, button, [role='tab'], [role='link']")
        n = min(cand.count(), 24)
        for i in range(n):
            el = cand.nth(i)
            try:
                if not el.is_visible():
                    continue
                t = (el.inner_text() or "").strip().replace("\n", "")
                if not t or len(t) > 16:
                    continue
                if any(k in t for k in S.SMS_TAB_TEXTS) or t in ("验证码", "短信"):
                    el.click(timeout=_CLICK_MS)
                    return True
            except Exception:
                continue
    except Exception:
        pass
    return False


def _try_iframe(page):
    if not hasattr(page, "frame_locator"):
        return False
    try:
        page.locator(S.LOGIN_IFRAME).first.wait_for(state="attached", timeout=1500)
    except Exception:
        return False
    try:
        fl = page.frame_locator(S.LOGIN_IFRAME).first
        for text in S.SMS_TAB_TEXTS:
            try:
                loc = fl.get_by_text(text, exact=False)
                loc.first.click(timeout=3000)
                return True
            except Exception:
                continue
        try:
            loc = fl.locator(S.SMS_PANEL_SWITCH)
            loc.first.click(timeout=3000)
            return True
        except Exception:
            return False
    except Exception:
        return False


def _switch_sms(page, tried):
    if _wait_phone(page, 1.2):
        tried.append("already_phone")
        return True
    steps = (
        ("text_sms", _try_sms_texts, True),
        ("tab_code", _try_pwd_code_tab, True),
        ("panel_autospark", _try_panel_autospark, True),
        ("qr_footer", _try_qr_footer, True),
        ("iframe", _try_iframe, False),
    )
    for _round in range(_SWITCH_ROUNDS):
        for name, fn, per_scope in steps:
            clicked = False
            if per_scope:
                for scope in _scopes(page):
                    try:
                        if fn(scope):
                            clicked = True
                            break
                    except Exception:
                        continue
            else:
                try:
                    clicked = bool(fn(page))
                except Exception:
                    clicked = False
            if not clicked:
                continue
            tried.append(name)
            if _wait_phone(page, _AFTER_CLICK_S):
                return True
    return _phone_box(page) is not None


def _code_btn_text(page):
    loc = _get_code_btn(page)
    if loc is None:
        return ""
    try:
        return (loc.inner_text() or "").strip()
    except Exception:
        return ""


def _identity_visible(page):
    try:
        if page.evaluate(
            """() => {
                const t = ((document.body && document.body.innerText) || '').replace(/\\s+/g, '');
                if (!t.includes('身份验证')) return false;
                return t.includes('接收短信验证码') || t.includes('发送短信验证码') || t.includes('以确保为本人操作') || t.includes('请先完成身份验证');
            }"""
        ):
            return True
    except Exception:
        pass
    for text in S.IDENTITY_TEXTS:
        if _find_text(page, text) is not None:
            return True
    return False


def _alive_page(context, page):
    try:
        if page is not None and not page.is_closed():
            return page
    except Exception:
        pass
    try:
        pages = list(context.pages or [])
        for p in reversed(pages):
            try:
                if not p.is_closed():
                    return p
            except Exception:
                continue
    except Exception:
        pass
    return page


def _page_url(page):
    try:
        return (page.url or "")[:160]
    except Exception:
        return ""


def _challenge_kind(page):
    try:
        kind = page.evaluate(
            """() => {
                const t = ((document.body && document.body.innerText) || '').replace(/\\s+/g, '');
                if (!t) return '';
                if (t.includes('图形验证') || t.includes('滑动验证') || t.includes('人机验证') || t.includes('安全验证') || t.includes('请完成验证')) return 'captcha';
                if (t.includes('请输入密码') || t.includes('密码验证') || t.includes('账号密码')) return 'password';
                if (t.includes('换设备') || t.includes('新设备登录') || t.includes('设备验证') || t.includes('是否本人')) return 'device';
                return '';
            }"""
        ) or ""
        if kind:
            return kind
    except Exception:
        pass
    for text in S.CHALLENGE_CAPTCHA_TEXTS:
        if _find_text(page, text) is not None:
            return "captcha"
    for text in S.CHALLENGE_PASSWORD_TEXTS:
        if _find_text(page, text) is not None:
            return "password"
    for text in S.CHALLENGE_DEVICE_TEXTS:
        if _find_text(page, text) is not None:
            return "device"
    return ""


def _identity_error(page):
    try:
        hit = page.evaluate(
            """() => {
                const t = ((document.body && document.body.innerText) || '').replace(/\\s+/g, '');
                const words = ['验证码错误','验证码不正确','验证码已过期','验证码失效','请输入正确的验证码','验证码有误'];
                for (const w of words) {
                    if (t.includes(w)) return w;
                }
                return '';
            }"""
        ) or ""
        if hit:
            return hit
    except Exception:
        pass
    for text in S.IDENTITY_ERR_TEXTS:
        if _find_text(page, text) is not None:
            return text
    return ""


def _click_device_ok(page):
    for text in S.CHALLENGE_DEVICE_OK:
        loc = _find_text(page, text, exact=True) or _find_text(page, text)
        if loc is None:
            continue
        try:
            loc.click(timeout=2500, force=True)
            return True
        except Exception:
            try:
                loc.click(timeout=2000)
                return True
            except Exception:
                continue
    try:
        return bool(page.evaluate(
            """() => {
                const words = ['确认是我','是我本人','允许登录','确认登录','本机登录','是我'];
                const nodes = Array.from(document.querySelectorAll('button, a, [role=button], span, div'));
                for (const w of words) {
                    for (const el of nodes) {
                        const t = (el.innerText || '').replace(/\\s+/g, '');
                        if (t === w && el.offsetWidth > 8 && el.offsetHeight > 8) {
                            el.click();
                            return true;
                        }
                    }
                }
                return false;
            }"""
        ))
    except Exception:
        return False


def _click_recv_sms(page):
    loc = _find_text(page, S.IDENTITY_RECV_SMS, exact=True) or _find_text(page, S.IDENTITY_RECV_SMS)
    if loc is not None:
        try:
            loc.click(timeout=_CLICK_MS, force=True)
            return True
        except Exception:
            try:
                loc.click(timeout=_CLICK_MS)
                return True
            except Exception:
                pass
    try:
        return bool(page.evaluate(
            """() => {
                const nodes = Array.from(document.querySelectorAll('button, a, div, span, p, [role=button]'));
                for (const el of nodes) {
                    const t = (el.innerText || '').replace(/\\s+/g, '');
                    if (t === '接收短信验证码' || t.includes('接收短信验证码')) {
                        el.click();
                        return true;
                    }
                }
                return false;
            }"""
        ))
    except Exception:
        return False


def _identity_code_box(page):
    for ph in S.IDENTITY_CODE_PLACEHOLDERS:
        box = _find_placeholder(page, ph)
        if box is not None:
            return box
    return _find_visible(page, S.IDENTITY_CODE_INPUT)


def _js_set_input():
    return """(code) => {
        const setVal = (el, v) => {
            const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
            if (desc && desc.set) desc.set.call(el, v);
            else el.value = v;
            el.dispatchEvent(new InputEvent('input', { bubbles: true, data: v }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const visible = (el) => el && el.offsetWidth > 0 && el.offsetHeight > 0;
        const roots = [];
        const all = Array.from(document.querySelectorAll('div, section, form, [role=dialog]'));
        for (const el of all) {
            const t = (el.innerText || '').replace(/\\s+/g, '');
            if (t.includes('身份验证') && (t.includes('验证码') || t.includes('接收短信') || t.includes('本人操作'))) {
                roots.push(el);
                break;
            }
        }
        const root = roots[0] || document;
        const inputs = Array.from(root.querySelectorAll('input'));
        const otp = inputs.filter((el) => visible(el) && el.maxLength === 1);
        if (otp.length >= 4 && otp.length <= 8 && code.length >= otp.length) {
            for (let i = 0; i < otp.length; i++) {
                otp[i].focus();
                setVal(otp[i], code[i]);
            }
            return 'otp';
        }
        const box = inputs.find((el) => {
            const p = (el.placeholder || '') + (el.getAttribute('aria-label') || '');
            return /验证码/.test(p) && visible(el);
        }) || inputs.find((el) => visible(el) && el.maxLength === 6);
        if (!box) return 'no_input';
        box.focus();
        setVal(box, code);
        return 'filled';
    }"""


def _js_click_identity_submit():
    return """() => {
        const words = ['验证','确定','完成','提交','下一步','确认'];
        const all = Array.from(document.querySelectorAll('div, section, form, [role=dialog]'));
        let root = null;
        for (const el of all) {
            const t = (el.innerText || '').replace(/\\s+/g, '');
            if (t.includes('身份验证') && (t.includes('验证码') || t.includes('接收短信') || t.includes('本人操作'))) {
                root = el;
                break;
            }
        }
        const nodes = Array.from((root || document).querySelectorAll('button, a, [role=button], span, div'));
        for (const w of words) {
            for (const el of nodes) {
                const t = (el.innerText || '').replace(/\\s+/g, '');
                if (t === w && el.offsetWidth > 8 && el.offsetHeight > 8) {
                    el.click();
                    return 'ok:' + w;
                }
            }
        }
        return '';
    }"""


def _submit_identity(page):
    for scope in _scopes(page):
        try:
            hit = scope.evaluate(_js_click_identity_submit())
            if hit:
                return True
        except Exception:
            continue
    for text in S.IDENTITY_SUBMIT_TEXTS:
        loc = _find_text(page, text, exact=True) or _find_text(page, text)
        if loc is None:
            continue
        try:
            loc.click(timeout=2500, force=True)
            return True
        except Exception:
            try:
                loc.click(timeout=2000)
                return True
            except Exception:
                continue
    return False


def _fill_identity_code(page, code):
    code = (code or "").strip()
    if len(code) != 6 or not code.isdigit():
        return False
    filled = False
    box = _identity_code_box(page)
    if box is not None:
        try:
            box.click(timeout=2500)
            box.fill("")
            box.fill(code)
            got = ""
            try:
                got = (box.input_value() or "").strip()
            except Exception:
                got = ""
            filled = got == code or len(got) >= 6
        except Exception:
            filled = False
    if not filled:
        for scope in _scopes(page):
            try:
                hit = scope.evaluate(_js_set_input(), code)
                if hit in ("otp", "filled"):
                    filled = True
                    break
            except Exception:
                continue
    if not filled:
        return False
    time.sleep(0.6)
    try:
        if not _identity_visible(page):
            return True
    except Exception:
        pass
    if _submit_identity(page):
        return True
    if box is not None:
        try:
            box.press("Enter")
            return True
        except Exception:
            pass
    try:
        page.keyboard.press("Enter")
        return True
    except Exception:
        return False


def _sms_code_path(req):
    return os.path.join(_tmp_dir(req), "login-sms-%s" % _job_token(req))


def _peek_sms_code(req):
    path = _sms_code_path(req)
    try:
        if not os.path.isfile(path):
            return ""
        with open(path, "r", encoding="utf-8") as f:
            raw = (f.read() or "").strip()
        digits = "".join(c for c in raw if c.isdigit())
        if len(digits) == 6:
            return digits
    except Exception:
        pass
    return ""


def _consume_sms_code(req):
    path = _sms_code_path(req)
    try:
        if os.path.isfile(path):
            os.remove(path)
    except Exception:
        pass


def start(req):
    phone = (req.get("phone") or "").strip()
    profile = req.get("profile_dir") or ""
    sess = req.get("sms_session") or ""
    if len(phone) != 11 or not phone.startswith("1"):
        return fail("bad_phone", "手机号格式不正确")
    if not profile:
        return fail("bad_request", "缺少短信会话目录")
    try:
        with launch(user_data_dir=profile) as (_pw, _b, context, page):
            tried = []
            try:
                page.goto(S.HOME_URL, wait_until="domcontentloaded", timeout=60000)
            except Exception as e:
                return fail("login_page_changed", "打不开抖音登录页：%s" % e)
            prep = _prepare_home(page)
            if prep == "captcha":
                return _fail_captcha(page, tried, req)
            if prep.startswith("freq:"):
                return fail("douyin_rate_limited", "抖音登录页提示「%s」。同一 IP 短时间多次打开登录页会被拦，请等 10–30 分钟后再试，期间不要连点。" % prep[5:])
            if not _ensure_login_layer(page, tried):
                if _is_captcha(page):
                    return _fail_captcha(page, tried, req)
                return _fail_page(page, tried, "login_page_changed", "未出现登录层，页面结构可能已变化", req)
            if not _switch_sms(page, tried):
                return _fail_page(page, tried, "login_page_changed", "找不到短信登录入口，页面结构可能已变化", req)
            try:
                area = _find_visible(page, S.SMS_AREA_INPUT)
                if area is not None:
                    area.fill("+86")
            except Exception:
                pass
            box = _phone_box(page)
            if box is None:
                return _fail_page(page, tried, "login_page_changed", "找不到手机号输入框", req)
            box.click()
            box.fill(phone)
            btn = _get_code_btn(page)
            if btn is None:
                return _fail_page(page, tried, "login_page_changed", "找不到「获取验证码」", req)
            btn.click()
            time.sleep(2.2)
            word = rate_limited(page)
            if word and ("频繁" in word or word in S.FREQ_WORDS):
                return fail("douyin_rate_limited", "抖音提示「%s」。请等 10–30 分钟后再试，期间不要连点获取验证码。" % word)
            label = _code_btn_text(page)
            if label == "获取验证码":
                d = _page_diag(page, tried)
                shot = _save_debug(page, req)
                if shot:
                    d["screenshot"] = shot
                return fail("sms_send_failed", "验证码发送失败，请检查手机号或稍后重试", **d)
            emit({"type": "waiting_code", "ok": True, "step": "waiting_code", "sms_session": sess})
            return 0
    except RuntimeError as e:
        return mapped_fail(e, str(e))
    except Exception as e:
        return mapped_fail(e, "短信获取异常")


def verify(req):
    code = (req.get("sms_code") or "").strip()
    profile = req.get("profile_dir") or ""
    state_out = req.get("state_out") or ""
    if len(code) != 6 or not code.isdigit():
        return fail("bad_code", "验证码为 6 位数字")
    if not profile or not state_out:
        return fail("bad_request", "缺少短信会话或 state_out")
    try:
        with launch(user_data_dir=profile) as (_pw, _b, context, page):
            tried = []
            try:
                if "douyin.com" not in (page.url or ""):
                    page.goto(S.HOME_URL, wait_until="domcontentloaded", timeout=60000)
            except Exception as e:
                return fail("login_page_changed", "无法回到登录页：%s" % e)
            time.sleep(0.8)
            box = _code_box(page)
            if box is None:
                _ensure_login_layer(page, tried)
                _switch_sms(page, tried)
                box = _code_box(page)
            if box is None:
                return _fail_page(page, tried, "sms_expired", "验证码输入框不见了，请重新获取", req)
            box.click()
            box.fill(code)
            submit = _find_visible(page, S.SMS_SUBMIT)
            if submit is None:
                return _fail_page(page, tried, "login_page_changed", "找不到登录按钮", req)
            submit.click()
            if not wait_session(context, timeout_s=90, interval=1.2):
                try:
                    pic = _find_visible(page, S.LOGIN_PANEL_PICTURE)
                    if pic is not None:
                        return fail("bad_code", "验证码错误或已过期")
                except Exception:
                    pass
                return fail("bad_code", "验证码提交后未登录")
            time.sleep(1.0)
            try:
                export_state(context, state_out)
            except Exception as e:
                return mapped_fail(e, "导出登录态失败")
            emit({"type": "logged_in", "step": "bound"})
            nick, uid = "", ""
            try:
                nick, uid = public_identity(page, context)
            except Exception:
                pass
            return done(True, nickname=nick, douyin_uid=uid)
    except RuntimeError as e:
        return mapped_fail(e, str(e))
    except Exception as e:
        return mapped_fail(e, "短信校验异常")
