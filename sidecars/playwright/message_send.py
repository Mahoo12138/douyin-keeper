"""Existing-conversation text sender for Sidecar Protocol v1."""

import json

import browser
import protocol


# The popup chat route is the route Douyin uses for the consumer message list
# and keeps the virtualized conversation pane mounted for row selection.
CHAT_URL = "https://www.douyin.com/chat?isPopup=1"
EDITOR_SELECTORS = (
    "div[class*='chat-input-'] div[contenteditable='true']",
    "div[contenteditable='true'][role='textbox']",
    "[contenteditable='true']",
    "textarea",
    "div[role='textbox']",
)
SESSION_COOKIE_NAMES = ("sessionid", "sessionid_ss", "sid_tt")
CHALLENGE_TEXTS = ("安全验证", "滑动验证", "人机验证", "身份验证")
RATE_LIMIT_TEXTS = ("操作频繁", "请求过于频繁", "访问受限")
_NETWORK_IDENTITY_RECORDS = []
_NETWORK_MESSAGE_RECEIPTS = []


def _error(code, message, retryable=False, detail=None):
    return protocol.ProtocolError(code, message, retryable=retryable, detail=detail)


def _session_path(input_data):
    if not isinstance(input_data, dict):
        raise _error(protocol.ERR_INVALID_REQUEST, "input must be an object")
    return protocol._session_file(input_data)


def _visible_text(page, values):
    for value in values:
        try:
            locator = page.get_by_text(value, exact=False)
            if locator.count() and locator.first.is_visible():
                return True
        except Exception:
            continue
    return False


def _session_present(context):
    try:
        cookies = context.cookies()
    except Exception:
        return False
    return any(
        isinstance(cookie, dict)
        and cookie.get("name") in SESSION_COOKIE_NAMES
        and str(cookie.get("value") or "").strip()
        for cookie in cookies
    )


def _peer_uid_from_conversation_id(conversation_id):
    """Extract the numeric peer UID from Douyin's direct-chat conv_id format."""
    if not isinstance(conversation_id, str):
        return ""
    parts = [part.strip() for part in conversation_id.split(":") if part.strip()]
    for part in reversed(parts):
        if part.isdigit():
            return part
    return ""


def _identity_values(record):
    identity = record.get("identity") if isinstance(record, dict) else None
    if not isinstance(identity, dict):
        return {}
    return {
        str(key).lower().replace("-", "_"): str(value).strip()
        for key, value in identity.items()
        if isinstance(value, (str, int)) and str(value).strip()
    }


def _network_peer_id_for_conversation(conversation_id, records=None):
    records = _NETWORK_IDENTITY_RECORDS if records is None else records
    conversation_keys = {
        "conversation_id", "conversationid", "conv_id", "convid",
        "conversation_short_id", "conversationshortid",
    }
    user_keys = {"uid", "user_id", "userid"}
    uid_to_sec = {}
    exact_records = []
    for record in reversed(records or []):
        identity = _identity_values(record)
        for user_key in user_keys:
            user_value = identity.get(user_key, "")
            if not user_value:
                continue
            for sec_key in ("sec_uid", "secuid", "sec_user_id", "secuserid"):
                sec_value = identity.get(sec_key, "")
                if sec_value:
                    uid_to_sec[user_value] = sec_value
        if any(identity.get(key) == conversation_id for key in conversation_keys):
            exact_records.append(identity)
    peer_uid = _peer_uid_from_conversation_id(conversation_id)
    for identity in exact_records:
        for key in ("sec_uid", "secuid", "sec_user_id", "secuserid"):
            value = identity.get(key, "")
            if value:
                return value
        for key in user_keys:
            value = identity.get(key, "")
            if value and value == peer_uid:
                return uid_to_sec.get(value, value)
    if peer_uid in uid_to_sec:
        return uid_to_sec[peer_uid]
    if exact_records:
        for key in user_keys:
            value = exact_records[0].get(key, "")
            if value:
                return value
    return ""


def _network_conversation_ids(records=None):
    records = _NETWORK_IDENTITY_RECORDS if records is None else records
    keys = (
        "conversation_id", "conversationid", "conv_id", "convid",
        "conversation_short_id", "conversationshortid",
    )
    values = []
    for record in records or []:
        identity = _identity_values(record)
        for key in keys:
            value = identity.get(key, "")
            if value and value not in values:
                values.append(value)
    return values


def _open_message_panel(page):
    """进入抖音“消息”面板，再查找虚拟化会话行。"""
    try:
        messages = page.get_by_text("消息", exact=True)
        message_count = messages.count()
        if message_count == 0:
            return False
        for index in range(message_count - 1, -1, -1):
            candidate = messages.nth(index)
            if not candidate.is_visible():
                continue
            try:
                candidate.click(timeout=5_000, force=True)
            except Exception:
                candidate.click(timeout=5_000)
            page.wait_for_timeout(1_500)
            return True
    except AttributeError:
        return False
    except Exception:
        pass
    try:
        return bool(page.evaluate("""() => {
          const nodes = Array.from(document.querySelectorAll('*')).filter((node) => {
            const rect = node.getBoundingClientRect();
            return (node.textContent || '').trim() === '消息' && rect.width > 0 && rect.height > 0;
          });
          const target = nodes[nodes.length - 1];
          if (!target) return false;
          for (let current = target, depth = 0; current && depth < 5; current = current.parentElement, depth += 1) {
            current.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, view: window}));
          }
          return true;
        }"""))
    except Exception:
        return False


def _network_target_seen(conversation_id, platform_user_id, records=None):
    """Match a newly opened row by conversation ID and/or its stable peer IDs."""
    records = _NETWORK_IDENTITY_RECORDS if records is None else records
    if conversation_id in _network_conversation_ids(records):
        return True
    peer_uid = _peer_uid_from_conversation_id(conversation_id)
    for record in records or []:
        identity = _identity_values(record)
        sec_uid = next(
            (identity.get(key, "") for key in ("sec_uid", "secuid", "sec_user_id", "secuserid")
             if identity.get(key, "")),
            "",
        )
        if platform_user_id and sec_uid == platform_user_id:
            return True
        if peer_uid and any(identity.get(key, "") == peer_uid for key in ("uid", "user_id", "userid")):
            return True
    return False


def _message_id_from_payload(value, depth=0):
    """Find a server-assigned message ID without treating conversation IDs as messages."""
    if depth > 7:
        return ""
    message_keys = {
        "server_message_id", "server_messageid", "message_id", "messageid", "msg_id", "msgid",
        "servermessageid", "message_key", "message_uuid",
    }
    if isinstance(value, dict):
        for key, item in value.items():
            normalized = str(key).lower().replace("-", "_")
            if normalized in message_keys and isinstance(item, (str, int)) and str(item).strip():
                return str(item).strip()[:256]
        for item in value.values():
            result = _message_id_from_payload(item, depth + 1)
            if result:
                return result
    elif isinstance(value, list):
        for item in value[:100]:
            result = _message_id_from_payload(item, depth + 1)
            if result:
                return result
    return ""


def _message_response_ok(status, payload):
    if not isinstance(status, (int, float)) or not 200 <= status < 300:
        return False
    if not isinstance(payload, dict):
        return True
    values = []
    for key in ("status_code", "err_no", "errno", "error_code", "code"):
        if key in payload:
            values.append(payload.get(key) in (0, "0", None))
    nested = payload.get("data")
    if isinstance(nested, dict):
        for key in ("status_code", "err_no", "errno", "error_code", "code"):
            if key in nested:
                values.append(nested.get(key) in (0, "0", None))
    return all(values) if values else True


def _capture_message_response(response):
    try:
        if str(response.request.method or "").upper() != "POST":
            return
        url = response.url.split("?", 1)[0]
        lowered_url = url.lower()
        is_known_send_endpoint = "/v1/message/send" in lowered_url
        is_generic_send_endpoint = "send" in lowered_url and (
            "message" in lowered_url or "msg" in lowered_url or "imapi.douyin.com" in lowered_url
        )
        if not is_known_send_endpoint and not is_generic_send_endpoint:
            return
        try:
            payload = response.json()
        except Exception:
            payload = json.loads(response.text())
    except Exception:
        return
    global _NETWORK_MESSAGE_RECEIPTS
    receipt = {
        "ok": _message_response_ok(response.status, payload),
        "status": response.status,
        "message_id": _message_id_from_payload(payload),
        "url": url,
    }
    _NETWORK_MESSAGE_RECEIPTS.append(receipt)
    protocol.log(
        f"message send response url={url} status={response.status} "
        f"ok={receipt['ok']} message_id={bool(receipt['message_id'])}"
    )


def _last_message_receipt():
    return _NETWORK_MESSAGE_RECEIPTS[-1] if _NETWORK_MESSAGE_RECEIPTS else None


def _click_conversation(page, conversation_id, platform_user_id=None):
    try:
        if page.evaluate(
            """(wanted) => {
              const nodes = Array.from(document.querySelectorAll('[data-conversation-id], [data-conversationid], [data-conv-id], [data-id]'));
              for (const node of nodes) {
                const value = node.getAttribute('data-conversation-id') || node.getAttribute('data-conversationid') ||
                  node.getAttribute('data-conv-id') || node.getAttribute('data-id');
                if (value === wanted) { node.click(); return true; }
              }
              return false;
            }""",
            conversation_id,
        ):
            return True
    except Exception:
        pass

    # The current Douyin consumer DOM does not expose the conversation ID.
    # Select rows one by one and correlate the resulting chat response instead
    # of falling back to a nickname-only target.
    # The list is virtualized and can mount a little after the popup route
    # becomes DOM-ready. Give it a bounded readiness window before scanning.
    for _ in range(8):
        try:
            titles = page.locator(".conversationConversationItemtitle")
            count = titles.count()
            if count:
                break
        except Exception:
            count = 0
        page.wait_for_timeout(750)
    if not count:
        return False

    # Selecting a row can emit the identity response after the click handler
    # returns. Re-scan the mounted rows with a slightly longer correlation
    # window, but never accept a nickname-only match.
    for _ in range(2):
        try:
            titles = page.locator(".conversationConversationItemtitle")
            count = titles.count()
        except Exception:
            return False
        for index in range(count):
            before = len(_NETWORK_IDENTITY_RECORDS)
            try:
                titles.nth(index).click(timeout=5_000)
                page.wait_for_timeout(1_800)
            except Exception:
                continue
            if _network_target_seen(
                conversation_id,
                platform_user_id,
                _NETWORK_IDENTITY_RECORDS[before:],
            ):
                return True
        try:
            page.mouse.wheel(0, 900)
        except Exception:
            pass
        page.wait_for_timeout(900)
    return False


def _current_peer_id(page, conversation_id=None):
    if conversation_id:
        peer_id = _network_peer_id_for_conversation(conversation_id)
        if peer_id:
            return peer_id
    try:
        return page.evaluate(
            """() => {
              const nodes = Array.from(document.querySelectorAll(
                '[data-user-id], [data-uid], [data-userid], [data-sec-uid], [data-sec_uid], [data-secuid], a[href]'
              ));
              for (const node of nodes) {
                const direct = node.getAttribute('data-user-id') || node.getAttribute('data-uid') ||
                  node.getAttribute('data-userid') || node.getAttribute('data-sec-uid') ||
                  node.getAttribute('data-sec_uid') || node.getAttribute('data-secuid');
                if (direct) return direct;
                const href = node.getAttribute('href') || '';
                try {
                  const base = window.location.origin && window.location.origin !== 'null'
                    ? window.location.origin : 'https://www.douyin.com';
                  const url = new URL(href, base);
                  for (const key of ['sec_uid', 'secUid', 'sec-uid', 'uid', 'user_id', 'userId']) {
                    const value = url.searchParams.get(key);
                    if (value) return decodeURIComponent(value);
                  }
                } catch (_) {}
                const match = href.match(/\/(?:user|profile)\/([^/?#]+)/i);
                if (match) return decodeURIComponent(match[1]);
              }
              return '';
            }"""
        ) or ""
    except Exception:
        return ""


def _capture_identity_response(response):
    try:
        resource_type = response.request.resource_type
        if resource_type not in ("xhr", "fetch"):
            return
        payload = response.json()
    except Exception:
        return
    if not isinstance(payload, (dict, list)):
        return

    identity_keys = {
        "conversation_id", "conversationid", "conv_id", "convid",
        "conversation_short_id", "conversationshortid", "user_id", "userid",
        "uid", "sec_uid", "secuid", "sec_user_id", "secuserid",
    }

    def collect_records(value, path="", depth=0):
        if depth > 5 or len(_NETWORK_IDENTITY_RECORDS) >= 400:
            return
        if isinstance(value, dict):
            identity = {}
            for key, item in value.items():
                normalized_key = str(key).lower().replace("-", "_")
                if normalized_key in identity_keys and isinstance(item, (str, int)):
                    text = str(item).strip()
                    if text and len(text) <= 512:
                        identity[normalized_key] = text
            if identity:
                _NETWORK_IDENTITY_RECORDS.append({
                    "url": response.url.split("?", 1)[0],
                    "path": path,
                    "identity": identity,
                })
            for key, item in value.items():
                collect_records(item, (path + "." + str(key)).strip("."), depth + 1)
        elif isinstance(value, list):
            for index, item in enumerate(value[:80]):
                collect_records(item, "%s[%d]" % (path, index), depth + 1)

    collect_records(payload)


def _editor(page):
    for selector in EDITOR_SELECTORS:
        try:
            locator = page.locator(selector)
            for index in range(min(locator.count(), 4)):
                candidate = locator.nth(index)
                if candidate.is_visible():
                    return candidate
        except Exception:
            continue
    return None


def _editor_text(editor):
    try:
        return editor.input_value()
    except Exception:
        try:
            return editor.inner_text()
        except Exception:
            return ""


def _message_ids(page, text):
    try:
        values = page.evaluate(
            """(wanted) => {
              const nodes = Array.from(document.querySelectorAll('[data-msg-id], [data-message-id], [class*="MessageItem"]'));
              return nodes
                .filter((node) => (node.innerText || '').includes(wanted))
                .map((node) => node.getAttribute('data-msg-id') || node.getAttribute('data-message-id') || '')
                .filter((value) => value);
            }""",
            text,
        ) or []
        if not isinstance(values, list):
            return []
        return [value for value in values if isinstance(value, str) and value]
    except Exception:
        return []


def _new_message_id(page, text, before_ids):
    before = set(before_ids or ())
    for message_id in reversed(_message_ids(page, text)):
        if message_id not in before:
            return message_id
    return ""


def _visible_message_count(page, text):
    """Count new visible chat bubbles without counting the editor itself."""
    try:
        value = page.evaluate(
            """(wanted) => {
              const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
              const target = normalize(wanted);
              if (!target) return 0;
              const nodes = Array.from(document.querySelectorAll('body *'));
              return nodes.filter((node) => {
                if (node.closest('[contenteditable=\"true\"], textarea, input')) return false;
                const rect = node.getBoundingClientRect();
                if (!rect.width || !rect.height) return false;
                const content = normalize(node.innerText || node.textContent);
                if (!content.includes(target)) return false;
                return !Array.from(node.children).some((child) => {
                  if (child.closest('[contenteditable=\"true\"], textarea, input')) return false;
                  return normalize(child.innerText || child.textContent).includes(target);
                });
              }).length;
            }""",
            text,
        )
        return int(value or 0)
    except Exception:
        return 0


def send_text(input_data):
    if not isinstance(input_data, dict):
        raise _error(protocol.ERR_INVALID_REQUEST, "input must be an object")
    if set(input_data) - {"session", "target", "message"}:
        raise _error(protocol.ERR_INVALID_REQUEST, "input contains unknown fields")
    session_path = _session_path(input_data)
    target = input_data.get("target")
    message = input_data.get("message")
    if not isinstance(target, dict) or not isinstance(message, dict):
        raise _error(protocol.ERR_INVALID_REQUEST, "target and message are required")
    if set(target) - {"platform_conversation_id", "platform_user_id"}:
        raise _error(protocol.ERR_INVALID_REQUEST, "target contains unknown fields")
    if set(message) - {"text"}:
        raise _error(protocol.ERR_INVALID_REQUEST, "message contains unknown fields")
    conversation_id = target.get("platform_conversation_id")
    platform_user_id = target.get("platform_user_id")
    text = message.get("text")
    if not isinstance(conversation_id, str) or not conversation_id.strip() or len(conversation_id) > 512:
        raise _error(protocol.ERR_INVALID_REQUEST, "platform_conversation_id must be 1..512 characters")
    if not isinstance(platform_user_id, str) or not platform_user_id.strip() or len(platform_user_id) > 256:
        raise _error(protocol.ERR_INVALID_REQUEST, "platform_user_id must be 1..256 characters")
    if not isinstance(text, str) or not text.strip() or len(text) > 2000:
        raise _error(protocol.ERR_INVALID_REQUEST, "message.text must be 1..2000 characters")

    global _NETWORK_IDENTITY_RECORDS, _NETWORK_MESSAGE_RECEIPTS
    with browser.launch(state_in=session_path) as (_pw, _browser, context, page):
        _NETWORK_IDENTITY_RECORDS = []
        _NETWORK_MESSAGE_RECEIPTS = []
        try:
            page.on("response", _capture_identity_response)
            page.on("response", _capture_message_response)
        except Exception:
            pass
        page.goto(CHAT_URL, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(3_000)
        if _visible_text(page, CHALLENGE_TEXTS):
            raise _error(protocol.ERR_CHALLENGE_REQUIRED, "platform challenge is required")
        if not _session_present(context):
            raise _error(protocol.ERR_SESSION_EXPIRED, "session is no longer valid")
        if _visible_text(page, RATE_LIMIT_TEXTS):
            raise _error(protocol.ERR_PLATFORM_RATE_LIMITED, "platform rate limit was detected")
        _open_message_panel(page)
        page.wait_for_timeout(1_500)
        if not _click_conversation(page, conversation_id, platform_user_id):
            raise _error(protocol.ERR_CONVERSATION_NOT_FOUND, "conversation is unavailable")
        page.wait_for_timeout(800)
        peer_id = _current_peer_id(page, conversation_id)
        if peer_id != platform_user_id:
            raise _error(protocol.ERR_TARGET_IDENTITY_MISMATCH, "conversation peer does not match target")
        editor = _editor(page)
        if editor is None:
            raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "message editor is unavailable")
        before_message_ids = set(_message_ids(page, text))
        before_visible_message_count = _visible_message_count(page, text)
        editor.click()
        try:
            editor.press("Control+A")
            editor.press("Backspace")
            editor.type(text, delay=20)
        except Exception:
            try:
                editor.fill(text)
            except Exception:
                page.keyboard.press("Control+A")
                page.keyboard.press("Delete")
                page.keyboard.type(text, delay=20)
        if text not in _editor_text(editor):
            raise _error(protocol.ERR_BROWSER_SELECTOR_CHANGED, "message text was not entered")
        try:
            editor.press("Enter")
        except Exception:
            page.keyboard.press("Enter")
        # The consumer UI can render the sent bubble after the request has
        # completed, and some versions do not expose a message ID in either
        # the response body or DOM. Give both confirmation paths a bounded
        # window before declaring the outcome unknown.
        for _ in range(6):
            page.wait_for_timeout(500)
            receipt = _last_message_receipt()
            if receipt or _visible_message_count(page, text) > before_visible_message_count:
                break
        receipt = _last_message_receipt()
        visible_message_count = _visible_message_count(page, text)
        protocol.log(
            f"message send receipts={len(_NETWORK_MESSAGE_RECEIPTS)} "
            f"last={receipt} dom_ids={len(_message_ids(page, text))} "
            f"visible_messages={visible_message_count} before={before_visible_message_count}"
        )
        if receipt and receipt.get("ok") and receipt.get("message_id"):
            return {
                "confirmed": True,
                "platform_message_id": receipt["message_id"],
                "confirmation_source": "network_receipt",
            }
        if receipt and not receipt.get("ok"):
            raise _error(
                protocol.ERR_ADAPTER_INCOMPATIBLE,
                "platform rejected the message send",
                detail={"outcome": "rejected", "status": receipt.get("status")},
            )
        if visible_message_count > before_visible_message_count:
            return {
                "confirmed": True,
                "platform_message_id": _new_message_id(page, text, before_message_ids),
                "confirmation_source": "browser_visible_message",
            }
        if text in _editor_text(editor):
            raise _error(protocol.ERR_ADAPTER_INCOMPATIBLE, "message send was not confirmed", detail={"outcome": "unknown"})
        message_id = _new_message_id(page, text, before_message_ids)
        if not message_id:
            raise _error(protocol.ERR_ADAPTER_INCOMPATIBLE, "platform message id was not observed", detail={"outcome": "unknown"})
        return {
            "confirmed": True,
            "platform_message_id": message_id,
            "confirmation_source": "browser_message_id",
        }
