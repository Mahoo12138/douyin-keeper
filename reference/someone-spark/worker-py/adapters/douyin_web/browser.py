import os
import sys
from contextlib import contextmanager

from .io import fail

_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-blink-features=AutomationControlled",
]
_APT_LIBS = "sudo apt-get install -y libnspr4 libnss3 libatk-bridge2.0-0t64 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2"
_CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/139.0.0.0 Safari/537.36"
)
_VIEW = {"width": 1280, "height": 720}
_INIT = (
    "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
    "Object.defineProperty(navigator,'languages',{get:()=>['zh-CN','zh']});"
)

def _playwright():
    try:
        from playwright.sync_api import sync_playwright
        return sync_playwright
    except ImportError:
        return None

def syslib_hint():
    bindir = os.path.dirname(os.path.abspath(sys.executable))
    pw = os.path.join(bindir, "playwright")
    return "服务器缺少 Chromium 系统库，请管理员执行：sudo %s install-deps chromium；或 %s" % (pw, _APT_LIBS)

def is_syslib_error(msg):
    s = (msg or "").lower()
    return "libnspr4" in s or "libnss3" in s or "cannot open shared object file" in s or "error while loading shared libraries" in s

def missing_playwright():
    return fail(
        "playwright_missing",
        "未安装 Playwright。在 spark/worker-py 执行: pip install -r requirements.txt && playwright install chromium",
    )

def mapped_fail(e, fallback):
    msg = str(e)
    if msg == "playwright_missing":
        return missing_playwright()
    if is_syslib_error(msg) or "缺少 Chromium 系统库" in msg:
        return fail("chromium_syslib", syslib_hint())
    if "Executable doesn't exist" in msg or "playwright install" in msg:
        return missing_playwright()
    return fail("sidecar", fallback)

def headed():
    return os.environ.get("HUOHUA_PW_HEADLESS", "1") in ("0", "false", "False")

def _ctx_opts(size):
    return {
        "viewport": size,
        "locale": "zh-CN",
        "timezone_id": "Asia/Shanghai",
        "user_agent": _CHROME_UA,
        "extra_http_headers": {"Accept-Language": "zh-CN,zh;q=0.9"},
    }

def _prep_page(context, page):
    try:
        context.add_init_script(_INIT)
    except Exception:
        pass
    try:
        page.add_init_script(_INIT)
    except Exception:
        pass
    try:
        page.set_default_timeout(20000)
        page.set_default_navigation_timeout(60000)
    except Exception:
        pass

@contextmanager
def launch(state_in=None, user_data_dir=None, viewport=None):
    factory = _playwright()
    if factory is None:
        raise RuntimeError("playwright_missing")
    pw = factory().start()
    browser = None
    context = None
    try:
        size = viewport or _VIEW
        opts = _ctx_opts(size)
        try:
            if user_data_dir:
                os.makedirs(user_data_dir, exist_ok=True)
                context = pw.chromium.launch_persistent_context(
                    user_data_dir,
                    headless=not headed(),
                    args=_ARGS,
                    ignore_default_args=["--enable-automation"],
                    **opts,
                )
            else:
                browser = pw.chromium.launch(
                    headless=not headed(),
                    args=_ARGS,
                    ignore_default_args=["--enable-automation"],
                )
                ctx = dict(opts)
                if state_in and os.path.isfile(state_in):
                    ctx["storage_state"] = state_in
                context = browser.new_context(**ctx)
        except Exception as e:
            if is_syslib_error(str(e)):
                raise RuntimeError(syslib_hint()) from e
            raise
        page = context.pages[0] if context.pages else context.new_page()
        _prep_page(context, page)
        yield pw, browser, context, page
    finally:
        if context:
            try:
                context.close()
            except Exception:
                pass
        if browser:
            try:
                browser.close()
            except Exception:
                pass
        try:
            pw.stop()
        except Exception:
            pass

def export_state(context, path):
    if not path:
        raise ValueError("state_out 缺失")
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    context.storage_state(path=path)
    if not os.path.isfile(path) or os.path.getsize(path) < 8:
        raise RuntimeError("storage_state 导出失败")
