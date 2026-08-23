import base64
import os
import threading
import time

from . import selectors as S
from .browser import export_state, launch, mapped_fail
from .guard import has_session_cookie, rate_limited, session_cookie_names, sessionid_ready
from .identity import public_identity
from .io import done, emit, fail
from .login_sms import (
    _alive_page,
    _challenge_kind,
    _click_device_ok,
    _click_recv_sms,
    _consume_sms_code,
    _ensure_login_layer,
    _fail_captcha,
    _fail_page,
    _fill_identity_code,
    _identity_code_box,
    _identity_error,
    _identity_visible,
    _is_captcha,
    _page_diag,
    _page_url,
    _peek_sms_code,
    _prepare_home,
    _save_debug,
    _visible,
)

_HARD_S = 180
_IDENTITY_S = 300
_POST_SMS_S = 180
_WAIT_LOG_S = 10
_GOTO_MS = 30000
_LAYER_S = 25
_GOTO_FAIL = "无头浏览器打不开抖音首页（30 秒内未完成加载）。请检查服务器能否访问 www.douyin.com，或换有头模式 / 更换出口 IP。"
_HARD_FAIL = "扫码硬超时（180 秒内未完成 launch/goto/出码/扫码）。已尝试截图 var/tmp/login-debug-*.png，请看 Worker 日志定位卡在哪一步。"
_IDENTITY_FAIL = "扫码后抖音要求短信身份验证，但未在时限内出现 sessionid。请在网页填写短信验证码，或在抖音 App 上完成验证后重试；超时请取消后重新获取二维码。"
_POST_SMS_FAIL = "已提交短信验证码，但未在时限内出现 sessionid。请看 var/tmp/login-debug-*.png；若仍见身份验证，说明验证码可能未真正提交或还有下一层验证。"


def _qr_data_url(page):
    try:
        hit = page.evaluate(
            """() => {
                const pick = (root) => {
                    if (!root) return '';
                    const nodes = Array.from(root.querySelectorAll('img, canvas'));
                    for (const el of nodes) {
                        if (el.tagName === 'CANVAS' && el.toDataURL) {
                            try {
                                const d = el.toDataURL('image/png');
                                if (d && d.length > 200) return d;
                            } catch (e) {}
                            continue;
                        }
                        const src = el.currentSrc || el.src || '';
                        if (src.startsWith('data:image') && src.length > 200) return src;
                        if (src && /qr|login|passport/i.test(src) && src.length > 80) return src;
                    }
                    return '';
                };
                const known = document.querySelector('#animate_qrcode_container, #douyin_login_comp_scan_code, #douyin_login_comp_flat_panel');
                const fromKnown = pick(known);
                if (fromKnown) return fromKnown;
                const labels = Array.from(document.querySelectorAll('p, span, div, h2, h3'));
                for (const n of labels) {
                    const t = (n.textContent || '').replace(/\\s+/g, '');
                    if (t !== '扫码登录' && !t.startsWith('扫码登录')) continue;
                    let box = n.parentElement;
                    for (let i = 0; i < 6 && box; i++) {
                        const hit = pick(box);
                        if (hit) return hit;
                        box = box.parentElement;
                    }
                }
                return pick(document);
            }"""
        ) or ""
        if hit:
            return hit
    except Exception:
        pass
    return _qr_screenshot(page)


def _qr_screenshot(page):
    sels = (
        "#animate_qrcode_container img",
        "#douyin_login_comp_scan_code img",
        "#animate_qrcode_container canvas",
        'img[src^="data:image"]',
        'img[class*="qrcode"]',
    )
    for sel in sels:
        try:
            loc = page.locator(sel)
            n = min(loc.count(), 6)
            for i in range(n):
                el = loc.nth(i)
                if not _visible(el):
                    continue
                box = el.bounding_box()
                if not box or box.get("width", 0) < 120 or box.get("height", 0) < 120:
                    continue
                ratio = box["width"] / max(1, box["height"])
                if not 0.8 <= ratio <= 1.25:
                    continue
                data = el.screenshot(type="png")
                if data and len(data) > 4000:
                    return "data:image/png;base64," + base64.b64encode(data).decode("ascii")
        except Exception:
            continue
    return ""


def _scan_layer_visible(page):
    try:
        qr = page.locator(S.QR_CONTAINER)
        if qr.count() and qr.first.is_visible():
            return True
    except Exception:
        pass
    try:
        pic = page.locator(S.LOGIN_PANEL_PICTURE)
        if pic.count() and pic.first.is_visible():
            return True
    except Exception:
        pass
    return False


def _cookies_have_sessionid(cookies):
    for c in cookies or []:
        name = c.get("name") or ""
        val = (c.get("value") or "").strip()
        if val and name.startswith("sessionid"):
            return True
    return False


def _has_session(context, cookies=None):
    if cookies is None:
        try:
            cookies = context.cookies()
        except Exception:
            cookies = []
    if _cookies_have_sessionid(cookies):
        return True
    return sessionid_ready(context) or has_session_cookie(context)


def _finish_bound(context, page, state_out):
    time.sleep(2)
    page = _alive_page(context, page)
    if not _has_session(context):
        return None
    export_state(context, state_out)
    emit({"type": "logged_in", "step": "bound"})
    nick, uid = "", ""
    try:
        nick, uid = public_identity(page, context)
    except Exception:
        pass
    return done(True, nickname=nick, douyin_uid=uid)


def _wait_note(page, context, ident, submitted):
    names = []
    try:
        names = session_cookie_names(context)
    except Exception:
        names = []
    url = _page_url(page)
    ident_s = "1" if ident else "0"
    sub_s = "1" if submitted else "0"
    name_s = ",".join(names) if names else "-"
    return "仍在等待登录 submitted=%s identity=%s url=%s session_cookies=%s" % (sub_s, ident_s, url or "-", name_s)


def _progress(step, message=""):
    emit({"type": "progress", "step": step, "message": message or step})


def _arm_hard_timeout():
    stop = threading.Event()
    state = {"until": time.time() + _HARD_S}
    def boom():
        while not stop.is_set():
            remain = state["until"] - time.time()
            if remain <= 0:
                break
            if stop.wait(min(1.0, remain)):
                return
        if stop.is_set():
            return
        try:
            emit({"type": "error", "ok": False, "code": "timeout", "message": _HARD_FAIL})
        except Exception:
            pass
        os._exit(2)
    th = threading.Thread(target=boom, daemon=True)
    th.start()
    return stop, state


def _extend_wait(deadline, state, extra_s):
    until = time.time() + max(1, int(extra_s))
    if until > deadline:
        deadline = until
    if state is not None:
        state["until"] = max(float(state.get("until") or 0), deadline + 8)
    return deadline


def run(req):
    state_out = req.get("state_out") or ""
    if not state_out:
        return fail("bad_request", "缺少 state_out")
    t0 = time.time()
    deadline = t0 + _HARD_S
    stop, hard = _arm_hard_timeout()
    def remain_ms():
        return max(1000, int((deadline - time.time()) * 1000))
    try:
        _progress("launch", "正在启动浏览器")
        with launch() as (_pw, _b, context, page):
            tried = []
            if time.time() >= deadline:
                return _fail_page(page, tried, "timeout", _HARD_FAIL, req)
            _progress("goto", "正在打开抖音首页")
            try:
                page.goto(S.HOME_URL, wait_until="domcontentloaded", timeout=min(_GOTO_MS, remain_ms()))
            except Exception:
                _save_debug(page, req)
                return fail("login_page_changed", _GOTO_FAIL)
            if _has_session(context):
                try:
                    hit = _finish_bound(context, page, state_out)
                    if hit is not None:
                        return hit
                except Exception as e:
                    return mapped_fail(e, "导出登录态失败")
            prep = _prepare_home(page)
            if prep == "captcha":
                return _fail_captcha(page, tried, req)
            if prep.startswith("freq:"):
                return fail(
                    "douyin_rate_limited",
                    "抖音登录页提示「%s」。同一 IP 短时间多次打开登录页会被拦，请等 10–30 分钟后再试，期间不要连点获取二维码。" % prep[5:],
                )
            if _is_captcha(page):
                return _fail_captcha(page, tried, req)
            _progress("click_login", "正在打开登录层")
            if not _ensure_login_layer(page, tried, min(_LAYER_S, max(1, deadline - time.time()))):
                if _has_session(context):
                    try:
                        hit = _finish_bound(context, page, state_out)
                        if hit is not None:
                            return hit
                    except Exception as e:
                        return mapped_fail(e, "导出登录态失败")
                if _is_captcha(page):
                    return _fail_captcha(page, tried, req)
                return _fail_page(page, tried, "login_page_changed", "未出现登录层（25 秒内），页面结构可能已变化或被验证码墙拦住", req)
            _progress("layer", "已出现登录层")
            last_img = ""
            pushed = False
            last_qr_at = 0
            ident = False
            clicked_recv = False
            last_recv_at = 0
            last_filled = ""
            submitted_at = 0
            last_wait_log = 0
            last_chal = ""
            asked_resubmit = False
            while time.time() < deadline:
                page = _alive_page(context, page)
                cookies = []
                try:
                    cookies = context.cookies()
                except Exception:
                    cookies = []
                if _has_session(context, cookies):
                    _progress("wait_session", "已扫码，正在导出登录态")
                    try:
                        hit = _finish_bound(context, page, state_out)
                        if hit is not None:
                            return hit
                    except Exception as e:
                        return mapped_fail(e, "导出登录态失败")
                now = time.time()
                saw_ident = False
                try:
                    saw_ident = _identity_visible(page)
                except Exception:
                    saw_ident = False
                chal = ""
                try:
                    chal = _challenge_kind(page)
                except Exception:
                    chal = ""
                if chal == "captcha" or ((not ident) and _is_captcha(page)):
                    return _fail_captcha(page, tried, req)
                if chal == "password":
                    return _fail_page(page, tried, "challenge_required", "短信提交后抖音还要求密码验证，sidecar 无法代填，请在 App 完成或改用短信登录", req)
                if chal == "device":
                    if last_chal != "device":
                        last_chal = "device"
                        _progress("challenge", "短信后出现设备确认，正在尝试自动确认")
                    if _click_device_ok(page):
                        _progress("challenge", "已点设备确认，继续等待登录")
                elif chal and chal != last_chal:
                    last_chal = chal
                    _progress("challenge", "短信后出现额外验证层 kind=%s" % chal)
                if saw_ident:
                    if not ident:
                        ident = True
                        deadline = _extend_wait(deadline, hard, _IDENTITY_S)
                        _progress("identity", "扫码成功，抖音要求短信身份验证")
                        emit({
                            "type": "sms_required",
                            "step": "identity",
                            "message": "扫码成功，抖音要求短信身份验证",
                            "job_id": req.get("job_id") or "",
                        })
                    ident_err = ""
                    try:
                        ident_err = _identity_error(page)
                    except Exception:
                        ident_err = ""
                    if ident_err:
                        if last_filled:
                            last_filled = ""
                            submitted_at = 0
                            asked_resubmit = False
                            _progress("sms_bad", "短信验证码未通过（%s），请重新填写" % ident_err)
                        need_box = _identity_code_box(page) is None
                        if need_box and now - last_recv_at >= 6:
                            if _click_recv_sms(page):
                                clicked_recv = True
                                last_recv_at = now
                                _progress("sms_send", "验证失败后已重新点「接收短信验证码」，请再填新验证码")
                    need_box = _identity_code_box(page) is None
                    if (not last_filled) and ((not clicked_recv) or (need_box and now - last_recv_at >= 4)):
                        if _click_recv_sms(page):
                            clicked_recv = True
                            last_recv_at = now
                            _progress("sms_send", "已点「接收短信验证码」，请在网页填写短信验证码")
                    code = _peek_sms_code(req)
                    if code and code != last_filled:
                        _progress("sms_fill", "正在填写短信验证码")
                        if _fill_identity_code(page, code):
                            last_filled = code
                            submitted_at = now
                            asked_resubmit = False
                            deadline = _extend_wait(deadline, hard, _POST_SMS_S)
                            _consume_sms_code(req)
                            _progress("sms_submit", "已提交短信验证码，继续等待登录")
                        else:
                            _progress("sms_retry", "验证码输入框未出现或填写失败，请重试或在 App 上完成验证")
                    elif last_filled and saw_ident and (not asked_resubmit) and now - submitted_at >= 18:
                        asked_resubmit = True
                        last_filled = ""
                        _progress("sms_retry", "提交后仍见身份验证层，验证码可能未真正提交，请确认后重填")
                if submitted_at and now - last_wait_log >= _WAIT_LOG_S:
                    last_wait_log = now
                    _progress("sms_wait", _wait_note(page, context, saw_ident, True))
                if (not pushed) or (now - last_qr_at >= 12):
                    if not ident:
                        hit = ""
                        try:
                            hit = _qr_data_url(page)
                        except Exception:
                            hit = ""
                        last_qr_at = now
                        if hit and hit != last_img:
                            last_img = hit
                            pushed = True
                            _progress("qr", "已抽出二维码")
                            emit({"type": "qr", "image": hit, "step": "scan"})
                if not pushed and not ident:
                    word = None
                    try:
                        word = rate_limited(page)
                    except Exception:
                        word = None
                    if word and word in S.CAPTCHA_WORDS:
                        return _fail_captcha(page, tried, req)
                    if word and ("频繁" in word or word in S.FREQ_WORDS):
                        return fail(
                            "douyin_rate_limited",
                            "抖音登录页提示「%s」。同一 IP 短时间多次打开登录页会被拦，请等 10–30 分钟后再试，期间不要连点获取二维码。" % word,
                        )
                    if _is_captcha(page):
                        return _fail_captcha(page, tried, req)
                time.sleep(1.2)
            page = _alive_page(context, page)
            try:
                cookies = context.cookies()
            except Exception:
                cookies = []
            if _has_session(context, cookies):
                _progress("wait_session", "已扫码，正在导出登录态")
                try:
                    hit = _finish_bound(context, page, state_out)
                    if hit is not None:
                        return hit
                except Exception as e:
                    return mapped_fail(e, "导出登录态失败")
            if submitted_at or last_filled:
                return _fail_page(page, tried, "timeout", _POST_SMS_FAIL, req)
            if ident:
                return _fail_page(page, tried, "timeout", _IDENTITY_FAIL, req)
            if not pushed:
                return _fail_page(page, tried, "login_page_changed", "登录页未找到二维码，页面结构可能已变化或被验证码墙拦住", req)
            return _fail_page(page, tried, "timeout", _HARD_FAIL, req)
    except RuntimeError as e:
        return mapped_fail(e, str(e))
    except Exception as e:
        return mapped_fail(e, "扫码流程异常")
    finally:
        stop.set()
