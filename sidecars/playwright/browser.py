"""Small Playwright runtime boundary used by browser-backed sidecar ops.

Importing this module does not require Playwright to be installed; the
dependency is loaded only when a browser operation is actually requested.
"""

import os
from contextlib import contextmanager


_BROWSER_ARGS = (
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
)


def _playwright_factory():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None
    return sync_playwright


def _headed():
    # Local/manual runs should show the browser unless a deployment explicitly
    # opts into headless mode through PLAYWRIGHT_HEADLESS=1.
    return os.environ.get("PLAYWRIGHT_HEADLESS", "0").lower() not in ("1", "true", "yes")


def _prepare_page(context, page):
    try:
        context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
    except Exception:
        pass
    try:
        page.set_default_timeout(20_000)
        page.set_default_navigation_timeout(60_000)
    except Exception:
        pass


@contextmanager
def launch(user_data_dir=None, state_in=None, locale="zh-CN"):
    factory = _playwright_factory()
    if factory is None:
        raise RuntimeError("playwright_missing")
    pw = factory().start()
    context = None
    try:
        context_options = {
            "headless": not _headed(),
            "args": list(_BROWSER_ARGS),
            "locale": locale,
            "timezone_id": "Asia/Shanghai",
            "viewport": {"width": 1280, "height": 720},
        }
        if os.environ.get("PLAYWRIGHT_IGNORE_HTTPS_ERRORS", "").lower() in ("1", "true", "yes"):
            context_options["ignore_https_errors"] = True
        if user_data_dir:
            os.makedirs(user_data_dir, mode=0o700, exist_ok=True)
            context = pw.chromium.launch_persistent_context(user_data_dir, **context_options)
        else:
            browser = pw.chromium.launch(
                headless=context_options["headless"], args=context_options["args"]
            )
            context_options.pop("headless")
            context_options.pop("args")
            if state_in:
                context_options["storage_state"] = state_in
            context = browser.new_context(**context_options)
        page = context.pages[0] if context.pages else context.new_page()
        _prepare_page(context, page)
        yield pw, browser if not user_data_dir else None, context, page
    finally:
        if context is not None:
            try:
                context.close()
            except Exception:
                pass
        if not user_data_dir and "browser" in locals() and browser is not None:
            try:
                browser.close()
            except Exception:
                pass
        try:
            pw.stop()
        except Exception:
            pass


def export_state(context, path):
    if not isinstance(path, str) or not os.path.isabs(path):
        raise ValueError("storage state path must be absolute")
    parent = os.path.dirname(path)
    os.makedirs(parent, mode=0o700, exist_ok=True)
    os.chmod(parent, 0o700)
    context.storage_state(path=path)
    os.chmod(path, 0o600)
    if not os.path.isfile(path) or os.path.getsize(path) < 8:
        raise RuntimeError("storage state export failed")
