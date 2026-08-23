from . import selectors as S

def rate_limited(page):
    for word in S.RATE_LIMIT_WORDS:
        try:
            loc = page.get_by_text(word, exact=False)
            n = min(loc.count(), 6)
            for i in range(n):
                box = loc.nth(i).bounding_box()
                if box:
                    return word
        except Exception:
            continue
    return None

_COOKIE_URLS = (
    "https://www.douyin.com/",
    "https://www.douyin.com",
    "https://login.douyin.com/",
    "https://www.iesdouyin.com/",
    "https://creator.douyin.com/",
)

def context_cookies(context):
    rows = []
    try:
        got = context.cookies()
        if got:
            rows.extend(got)
    except Exception:
        pass
    for url in _COOKIE_URLS:
        try:
            got = context.cookies(url)
            if got:
                rows.extend(got)
        except Exception:
            continue
    return rows

def sessionid_ready(context):
    for c in context_cookies(context):
        name = c.get("name") or ""
        val = (c.get("value") or "").strip()
        if not val:
            continue
        if name.startswith("sessionid"):
            return True
        if name == "sid_tt":
            return True
    return False

def logged_in(page, context):
    if sessionid_ready(context):
        return True, "ok"
    url = (page.url or "").lower()
    if "login" in url or "passport" in url:
        return False, "页面已跳转到登录页"
    try:
        qr = page.locator(S.QR_CONTAINER)
        if qr.count() and qr.first.is_visible():
            return False, "页面出现扫码登录，登录态已过期"
    except Exception:
        pass
    try:
        pic = page.locator(S.LOGIN_PANEL_PICTURE)
        if pic.count() and pic.first.is_visible():
            return False, "登录面板仍在，未完成登录"
    except Exception:
        pass
    for text in S.LOGIN_HINTS:
        try:
            loc = page.get_by_text(text, exact=False)
            for i in range(min(loc.count(), 3)):
                if loc.nth(i).is_visible():
                    return False, "页面出现登录提示「%s」" % text
        except Exception:
            continue
    return False, "未检测到 sessionid，登录态无效"

def session_cookie_names(context):
    names = []
    for c in context_cookies(context):
        name = c.get("name") or ""
        val = (c.get("value") or "").strip()
        if not val:
            continue
        if name.startswith("sessionid") or name == "sid_tt":
            if name not in names:
                names.append(name)
    return names

def has_session_cookie(context):
    return sessionid_ready(context)

def wait_session(context, timeout_s=180, interval=1.2):
    import time
    if interval < 1:
        interval = 1
    if interval > 2:
        interval = 2
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if has_session_cookie(context):
            return True
        time.sleep(interval)
    return has_session_cookie(context)
