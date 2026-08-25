"""Unit tests for the NDJSON protocol codec (docs/10)."""

import json
import sys
import os
import tempfile
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import protocol  # noqa: E402


def make_req(op="health.check"):
    return {"protocol_version": 1, "request_id": "r1", "op": op, "deadline_ms": 5000, "input": {}}


def test_parse_valid_request():
    req = protocol.parse_request(json.dumps(make_req()))
    assert req["op"] == "health.check"


def test_parse_accepts_qr_cancel_request():
    req = protocol.parse_request(json.dumps(make_req("login.qr.cancel")))
    assert req["op"] == "login.qr.cancel"


def test_qr_cancel_releases_session():
    import qr_login

    class _Manager:
        def __init__(self):
            self.closed = False

        def __exit__(self, *_args):
            self.closed = True

    manager = _Manager()
    handle = "qr_test_cancel"
    item = qr_login.QRLogin(handle, manager, object(), object(), "/tmp/profile", datetime.now(timezone.utc))
    with qr_login._lock:
        qr_login._sessions[handle] = item

    result = qr_login.cancel({"login_handle": handle})

    assert result == {"state": "cancelled"}
    assert manager.closed is True
    with qr_login._lock:
        assert handle not in qr_login._sessions


def test_parse_rejects_wrong_version():
    bad = make_req()
    bad["protocol_version"] = 2
    try:
        protocol.parse_request(json.dumps(bad))
        assert False, "expected ProtocolError"
    except protocol.ProtocolError as exc:
        assert exc.code == protocol.ERR_UNSUPPORTED_VERSION


def test_parse_rejects_unknown_op():
    try:
        protocol.parse_request(json.dumps(make_req("totally.bogus")))
        assert False, "expected ProtocolError"
    except protocol.ProtocolError as exc:
        assert exc.code == protocol.ERR_UNSUPPORTED_OPERATION


def test_parse_rejects_invalid_deadline_and_input():
    bad_deadline = make_req()
    bad_deadline["deadline_ms"] = 999
    try:
        protocol.parse_request(json.dumps(bad_deadline))
        assert False, "expected ProtocolError"
    except protocol.ProtocolError as exc:
        assert exc.code == protocol.ERR_INVALID_REQUEST

    bad_input = make_req()
    bad_input["input"] = []
    try:
        protocol.parse_request(json.dumps(bad_input))
        assert False, "expected ProtocolError"
    except protocol.ProtocolError as exc:
        assert exc.code == protocol.ERR_INVALID_REQUEST


def test_health_success_envelope():
    req = make_req()
    out = protocol.success(req, protocol.health_result(), "browser.consumer")
    assert out["ok"] is True
    assert out["request_id"] == "r1"
    assert out["meta"]["adapter"] == "browser.consumer"
    # Envelope round-trips through the JSON schema's required fields.
    assert set(["protocol_version", "request_id", "ok", "result", "meta"]).issubset(out)
    assert "conversations.sync" in out["result"]["capabilities"]
    assert "message.send.sticker.existing" in out["result"]["capabilities"]


def test_unsupported_op_is_structured_failure():
    req = make_req("login.qr.start")
    out = protocol.unsupported(req)
    assert out["ok"] is False
    assert out["error"]["code"] == protocol.ERR_UNSUPPORTED_OPERATION


def test_first_message_operation_fails_closed_until_adapter_is_available():
    import sidecar

    out = sidecar.handle(make_req("message.send_first"))
    assert out["ok"] is False
    assert out["error"]["code"] == protocol.ERR_UNSUPPORTED_OPERATION


class _ArchiveLocator:
    def __init__(self, count=0, visible=False):
        self._count = count
        self._visible = visible
        self.first = self

    def count(self):
        return self._count

    def nth(self, _index):
        return self

    def is_visible(self):
        return self._visible

    def click(self, **_kwargs):
        return None


class _ArchivePage:
    def __init__(self, archived=True, peer_id="user-1"):
        self.archived = archived
        self.peer_id = peer_id

    def goto(self, *_args, **_kwargs):
        return None

    def wait_for_timeout(self, _milliseconds):
        return None

    def get_by_text(self, value, **_kwargs):
        return _ArchiveLocator(count=1, visible=value in {"归档", "确定"})

    def evaluate(self, script, *_args):
        if "data-user-id" in script:
            return self.peer_id
        if "menu.click()" in script or "node.click()" in script:
            return True
        if "platform_conversation_id: id" in script:
            return {"platform_conversation_id": "conversation-1", "archived": self.archived}
        return None


def test_platform_conversation_archive_requires_platform_receipt(monkeypatch):
    import conversation_archive

    page = _ArchivePage(archived=True)

    @contextmanager
    def fake_launch(**_kwargs):
        yield None, None, _FakeContext(), page

    monkeypatch.setattr(conversation_archive.browser, "launch", fake_launch)
    with tempfile.NamedTemporaryFile("w", suffix=".json") as state:
        json.dump({"cookies": []}, state)
        state.flush()
        result = conversation_archive.archive({
            "session": {"kind": "playwright_storage_state_file", "path": state.name},
            "target": {
                "platform_user_id": "user-1",
                "platform_conversation_id": "conversation-1",
            },
            "archived": True,
        })
    assert result == {
        "confirmed": True,
        "platform_conversation_id": "conversation-1",
        "archived": True,
    }


def test_platform_conversation_archive_rejects_identity_mismatch(monkeypatch):
    import conversation_archive

    page = _ArchivePage(archived=True, peer_id="other-user")

    @contextmanager
    def fake_launch(**_kwargs):
        yield None, None, _FakeContext(), page

    monkeypatch.setattr(conversation_archive.browser, "launch", fake_launch)
    with tempfile.NamedTemporaryFile("w", suffix=".json") as state:
        json.dump({"cookies": []}, state)
        state.flush()
        try:
            conversation_archive.archive({
                "session": {"kind": "playwright_storage_state_file", "path": state.name},
                "target": {"platform_user_id": "user-1", "platform_conversation_id": "conversation-1"},
                "archived": True,
            })
            assert False, "expected ProtocolError"
        except protocol.ProtocolError as exc:
            assert exc.code == protocol.ERR_TARGET_IDENTITY_MISMATCH


def test_platform_conversation_archive_rejects_missing_session_before_adapter_call():
    import conversation_archive

    try:
        conversation_archive.archive({"target": {"platform_conversation_id": "conversation-1"}, "archived": True})
        assert False, "expected ProtocolError"
    except protocol.ProtocolError as exc:
        assert exc.code == protocol.ERR_INVALID_REQUEST


def test_platform_conversation_archive_rejects_unknown_nested_fields():
    import conversation_archive

    with tempfile.NamedTemporaryFile("w", suffix=".json") as state:
        json.dump({"cookies": []}, state)
        state.flush()
        try:
            conversation_archive.archive({
                "session": {"kind": "playwright_storage_state_file", "path": state.name},
                "target": {"platform_conversation_id": "conversation-1", "nickname": "not-an-id"},
                "archived": True,
            })
            assert False, "expected ProtocolError"
        except protocol.ProtocolError as exc:
            assert exc.code == protocol.ERR_INVALID_REQUEST


def test_conversation_list_normalizes_only_stable_identity_rows():
    import conversation_list

    rows = conversation_list._normalize_items([
        {
            "platform_conversation_id": "conversation-1",
            "peer_platform_user_id": "user-1",
            "peer_display_name": "  Jasmine  ",
            "channel": "consumer",
            "last_message_at": "2026-08-25T10:00:00Z",
        },
        {"platform_conversation_id": "conversation-1", "peer_platform_user_id": "user-1"},
        {"platform_conversation_id": "conversation-without-peer", "peer_display_name": "Cannot target"},
        {"platform_conversation_id": "", "peer_platform_user_id": "user-2"},
    ])
    assert rows == [{
        "platform_conversation_id": "conversation-1",
        "peer_platform_user_id": "user-1",
        "peer_display_name": "Jasmine",
        "channel": "consumer",
        "last_message_at": "2026-08-25T10:00:00Z",
    }]


def test_conversation_extractor_keeps_a_broad_row_fallback():
    import conversation_list

    assert "[class*=" in conversation_list.EXTRACT_JS
    assert "conversationConversationItem" in conversation_list.EXTRACT_JS


def test_conversation_network_identity_extracts_direct_chat_peer_uid():
    import conversation_list

    conversation_id, peer_id = conversation_list._network_identity([
        {"identity": {"conv_id": "0:1:106337616074:1412192206591501"}},
        {"identity": {"uid": "1412192206591501", "sec_uid": "sec-peer"}},
    ])
    assert conversation_id == "0:1:106337616074:1412192206591501"
    assert peer_id == "sec-peer"


def test_message_sender_resolves_peer_from_target_conversation_network_identity():
    import message_send

    peer_id = message_send._network_peer_id_for_conversation(
        "0:1:106337616074:1412192206591501",
        [
            {"identity": {"conv_id": "0:1:106337616074:1412192206591501"}},
            {"identity": {"uid": "1412192206591501", "sec_uid": "sec-peer"}},
        ],
    )
    assert peer_id == "sec-peer"


def test_message_sender_does_not_use_unrelated_network_sec_uid_for_peer_mapping():
    import message_send

    peer_id = message_send._network_peer_id_for_conversation(
        "0:1:106337616074:1412192206591501",
        [
            {"identity": {"sec_uid": "unrelated-peer"}},
            {"identity": {"conv_id": "0:1:106337616074:1412192206591501"}},
            {"identity": {"uid": "1412192206591501", "sec_uid": "sec-peer"}},
        ],
    )
    assert peer_id == "sec-peer"


def test_message_sender_finds_conversation_by_network_identity_when_dom_has_no_id():
    import message_send

    class FakeTitle:
        def __init__(self, index):
            self.index = index

        def click(self, **_kwargs):
            if self.index == 1:
                message_send._NETWORK_IDENTITY_RECORDS.append({
                    "identity": {"conv_id": "0:1:106337616074:1412192206591501"},
                })

    class FakeTitles:
        def count(self):
            return 2

        def nth(self, index):
            return FakeTitle(index)

    class FakePage:
        def evaluate(self, *_args):
            return False

        def locator(self, _selector):
            return FakeTitles()

        def wait_for_timeout(self, _milliseconds):
            return None

    message_send._NETWORK_IDENTITY_RECORDS = []
    assert message_send._click_conversation(
        FakePage(), "0:1:106337616074:1412192206591501"
    ) is True


def test_message_sender_matches_new_row_by_target_peer_identity():
    import message_send

    assert message_send._network_target_seen(
        "0:1:106337616074:1412192206591501",
        "sec-peer",
        [{"identity": {"uid": "1412192206591501", "sec_uid": "sec-peer"}}],
    ) is True


def test_message_sender_has_explicit_message_panel_navigation():
    import message_send

    assert "消息" in message_send._open_message_panel.__doc__


def test_message_sender_extracts_successful_server_receipt():
    import message_send

    payload = {"status_code": 0, "data": {"message_id": "server-msg-1"}}
    assert message_send._message_response_ok(200, payload) is True
    assert message_send._message_id_from_payload(payload) == "server-msg-1"
    assert message_send._message_response_ok(200, {"status_code": 1}) is False
    assert message_send._message_id_from_payload({"data": {"serverMessageId": "server-msg-2"}}) == "server-msg-2"


def test_conversation_list_pages_by_last_platform_id():
    import conversation_list

    items = conversation_list._normalize_items([
        {"platform_conversation_id": "c1", "peer_platform_user_id": "u1"},
        {"platform_conversation_id": "c2", "peer_platform_user_id": "u2"},
        {"platform_conversation_id": "c3", "peer_platform_user_id": "u3"},
    ])
    page, cursor = conversation_list._page_after(items, None, 2)
    assert [item["platform_conversation_id"] for item in page] == ["c1", "c2"]
    assert cursor == "c2"
    page, cursor = conversation_list._page_after(items, "c2", 2)
    assert [item["platform_conversation_id"] for item in page] == ["c3"]
    assert cursor is None


def test_conversation_list_rejects_expired_platform_cursor():
    import conversation_list

    try:
        conversation_list._page_after(
            [{"platform_conversation_id": "c1", "peer_platform_user_id": "u1"}],
            "missing",
            100,
        )
        assert False, "expected ProtocolError"
    except protocol.ProtocolError as exc:
        assert exc.code == protocol.ERR_INVALID_REQUEST
        assert exc.detail == {
            "operation": "conversations.list",
            "reason": "cursor_not_found",
        }


class _FakeLocator:
    def __init__(self, count=0):
        self._count = count
        self.first = self

    def count(self):
        return self._count

    def is_visible(self):
        return False

    def wait_for(self, **_kwargs):
        return None


class _FakePage:
    def __init__(self, batches):
        self._batches = list(batches)
        self.mouse = self

    def goto(self, *_args, **_kwargs):
        return None

    def wait_for_timeout(self, _milliseconds):
        return None

    def get_by_text(self, *_args, **_kwargs):
        return _FakeLocator()

    def locator(self, _selector):
        return _FakeLocator(count=1)

    def evaluate(self, _script):
        if self._batches:
            return self._batches.pop(0)
        return []

    def wheel(self, *_args):
        return None


class _FakeContext:
    def cookies(self):
        return [{"name": "sessionid", "value": "session"}]


def test_conversation_list_uses_browser_adapter_and_returns_cursor(monkeypatch):
    import conversation_list

    page = _FakePage([
        [
            {"platform_conversation_id": "c1", "peer_platform_user_id": "u1"},
            {"platform_conversation_id": "c2", "peer_platform_user_id": "u2"},
        ],
        [
            {"platform_conversation_id": "c2", "peer_platform_user_id": "u2"},
            {"platform_conversation_id": "c3", "peer_platform_user_id": "u3"},
        ],
    ])

    @contextmanager
    def fake_launch(**_kwargs):
        yield None, None, _FakeContext(), page

    monkeypatch.setattr(conversation_list.browser, "launch", fake_launch)
    with tempfile.NamedTemporaryFile("w", suffix=".json") as state:
        json.dump({"cookies": []}, state)
        state.flush()
        result = conversation_list.list_conversations({
            "session": {"kind": "playwright_storage_state_file", "path": state.name},
            "limit": 2,
        })
    assert [item["platform_conversation_id"] for item in result["items"]] == ["c1", "c2"]
    assert result["next_cursor"] == "c2"


def test_platform_conversation_list_rejects_invalid_pagination_before_adapter_call():
    import conversation_list

    with tempfile.NamedTemporaryFile("w", suffix=".json") as state:
        json.dump({"cookies": []}, state)
        state.flush()
        for input_data in (
            {"session": {"kind": "playwright_storage_state_file", "path": state.name}, "limit": 0},
            {"session": {"kind": "playwright_storage_state_file", "path": state.name}, "cursor": ""},
            {"session": {"kind": "playwright_storage_state_file", "path": state.name}, "extra": True},
        ):
            try:
                conversation_list.list_conversations(input_data)
                assert False, "expected ProtocolError"
            except protocol.ProtocolError as exc:
                assert exc.code == protocol.ERR_INVALID_REQUEST


def test_platform_conversation_list_rejects_missing_session_before_adapter_call():
    import conversation_list

    try:
        conversation_list.list_conversations({"cursor": None, "limit": 100})
        assert False, "expected ProtocolError"
    except protocol.ProtocolError as exc:
        assert exc.code == protocol.ERR_INVALID_REQUEST


def test_sticker_confirmation_requires_a_new_platform_message_id():
    import sticker_send

    assert sticker_send._new_message_id({"message-old"}, {"message-old", "message-new"}) == "message-new"
    assert sticker_send._new_message_id({"message-old"}, {"message-old"}) == ""


class _StickerLocator:
    def __init__(self, count=0, visible=False):
        self._count = count
        self._visible = visible
        self.first = self

    def count(self):
        return self._count

    def nth(self, _index):
        return self

    def is_visible(self):
        return self._visible

    def click(self, **_kwargs):
        return None


class _StickerPage:
    def __init__(self, message_ids):
        self.message_ids = list(message_ids)
        self.mouse = self

    def goto(self, *_args, **_kwargs):
        return None

    def wait_for_timeout(self, _milliseconds):
        return None

    def get_by_text(self, *_args, **_kwargs):
        return _StickerLocator()

    def locator(self, selector):
        import sticker_send

        if selector in sticker_send.STICKER_TRIGGER_SELECTORS:
            return _StickerLocator(count=1, visible=True)
        if selector in sticker_send.STICKER_PANEL_SELECTORS:
            return _StickerLocator(count=1, visible=True)
        if selector == sticker_send.STICKER_ITEM_SELECTOR:
            return _StickerLocator(count=1, visible=True)
        return _StickerLocator()

    def evaluate(self, script, *args):
        if "data-conversation-id" in script:
            return True
        if "data-user-id" in script:
            return "user-1"
        if "data-sticker-id" in script:
            return True
        if "data-msg-id" in script:
            return list(self.message_ids)
        return False


def test_sticker_sender_requires_identity_and_receipt(monkeypatch):
    import sticker_send

    page = _StickerPage(["message-old"])

    @contextmanager
    def fake_launch(**_kwargs):
        yield None, None, _FakeContext(), page

    monkeypatch.setattr(sticker_send.browser, "launch", fake_launch)
    with tempfile.NamedTemporaryFile("w", suffix=".json") as state:
        json.dump({"cookies": []}, state)
        state.flush()
        try:
            sticker_send.send_sticker({
                "session": {"kind": "playwright_storage_state_file", "path": state.name},
                "target": {"platform_user_id": "user-1", "platform_conversation_id": "conversation-1"},
                "message": {"sticker_id": "sticker-001"},
            })
            assert False, "expected ProtocolError"
        except protocol.ProtocolError as exc:
            assert exc.code == protocol.ERR_ADAPTER_INCOMPATIBLE
            assert exc.detail == {"outcome": "unknown"}


def test_sticker_sender_returns_only_a_new_platform_message_id(monkeypatch):
    import sticker_send

    class ReceiptPage(_StickerPage):
        def __init__(self):
            super().__init__(["message-old"])
            self.receipt_seen = False

        def evaluate(self, script, *args):
            if "data-msg-id" in script:
                if not self.receipt_seen:
                    self.receipt_seen = True
                    return ["message-old"]
                return ["message-old", "message-new"]
            return super().evaluate(script, *args)

    page = ReceiptPage()

    @contextmanager
    def fake_launch(**_kwargs):
        yield None, None, _FakeContext(), page

    monkeypatch.setattr(sticker_send.browser, "launch", fake_launch)
    with tempfile.NamedTemporaryFile("w", suffix=".json") as state:
        json.dump({"cookies": []}, state)
        state.flush()
        result = sticker_send.send_sticker({
            "session": {"kind": "playwright_storage_state_file", "path": state.name},
            "target": {"platform_user_id": "user-1", "platform_conversation_id": "conversation-1"},
            "message": {"sticker_id": "sticker-001"},
        })
    assert result == {"confirmed": True, "platform_message_id": "message-new"}


def test_sticker_send_rejects_unstable_or_incomplete_target_before_adapter_call():
    import sticker_send

    with tempfile.NamedTemporaryFile("w", suffix=".json") as state:
        json.dump({"cookies": []}, state)
        state.flush()
        base = {"session": {"kind": "playwright_storage_state_file", "path": state.name}}
        invalid_inputs = [
            {**base, "target": {}, "message": {"sticker_id": "sticker-001"}},
            {**base, "target": {"platform_user_id": "user-1", "platform_conversation_id": "conversation-1"}, "message": {"sticker_id": ""}},
            {**base, "target": {"platform_user_id": "user-1", "platform_conversation_id": "conversation-1"}, "message": {"sticker_id": "x" * 257}},
        ]
        for input_data in invalid_inputs:
            try:
                sticker_send.send_sticker(input_data)
                assert False, "expected ProtocolError"
            except protocol.ProtocolError as exc:
                assert exc.code == protocol.ERR_INVALID_REQUEST


def test_send_operations_reject_unknown_nested_fields():
    import message_send
    import sticker_send

    with tempfile.NamedTemporaryFile("w", suffix=".json") as state:
        json.dump({"cookies": []}, state)
        state.flush()
        session = {"kind": "playwright_storage_state_file", "path": state.name}
        cases = (
            (message_send.send_text, {"session": session, "target": {"platform_user_id": "u", "platform_conversation_id": "c", "nickname": "x"}, "message": {"text": "hello"}}),
            (sticker_send.send_sticker, {"session": session, "target": {"platform_user_id": "u", "platform_conversation_id": "c"}, "message": {"sticker_id": "s", "text": "x"}}),
        )
        for sender, input_data in cases:
            try:
                sender(input_data)
                assert False, "expected ProtocolError"
            except protocol.ProtocolError as exc:
                assert exc.code == protocol.ERR_INVALID_REQUEST


def test_sidecar_failures_keep_browser_adapter_identity():
    import sidecar

    req = make_req("session.validate")
    req["input"] = {"session": {"kind": "playwright_storage_state_file", "path": "/missing/session.json"}}
    out = sidecar.handle(req)
    assert out["ok"] is False
    assert out["error"]["code"] == protocol.ERR_SESSION_EXPIRED
    assert out["error"]["retryable"] is False
    assert out["error"]["message"]
    assert out["meta"]["adapter"] == "browser.consumer"
    assert out["meta"]["adapter_version"] == "0.1.0"
    assert isinstance(out["meta"]["duration_ms"], int)
    assert out["meta"]["duration_ms"] >= 0


def test_invalid_request_response_is_a_complete_failure_envelope():
    import sidecar

    line = json.dumps({"protocol_version": 1, "request_id": "bad-request", "op": "invalid"})
    out = sidecar.invalid_request_response(line, protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "bad request"))
    assert out["protocol_version"] == 1
    assert out["request_id"] == "bad-request"
    assert out["ok"] is False
    assert set(out["error"]) >= {"code", "retryable", "message"}
    assert out["meta"] == {"adapter": "browser.consumer", "adapter_version": "0.1.0", "duration_ms": 0}


def test_failure_preserves_structured_detail():
    req = make_req("message.send_text")
    out = protocol.failure(req, protocol.ProtocolError(
        protocol.ERR_ADAPTER_INCOMPATIBLE,
        "send outcome is unknown",
        detail={"outcome": "unknown"},
    ))
    assert out["error"]["detail"] == {"outcome": "unknown"}


def test_message_confirmation_requires_a_new_platform_message_id():
    import message_send

    class FakePage:
        def __init__(self, values):
            self.values = list(values)

        def evaluate(self, _script, _text):
            return self.values.pop(0)

    page = FakePage([["message-old"], ["message-old", "message-new"]])
    before = set(message_send._message_ids(page, "same text"))
    assert message_send._new_message_id(page, "same text", before) == "message-new"

    page = FakePage([["message-old"]])
    assert message_send._new_message_id(page, "same text", {"message-old"}) == ""


def test_expired_login_handles_are_closed():
    import qr_login
    import sms_login

    class ExpiredItem:
        def __init__(self):
            self.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            self.closed = False

        def close(self):
            self.closed = True

    qr_item = ExpiredItem()
    sms_item = ExpiredItem()
    qr_login._sessions["test-expired-qr"] = qr_item
    sms_login._sessions["test-expired-sms"] = sms_item
    assert qr_login.cleanup_expired() == 1
    assert sms_login.cleanup_expired() == 1
    assert qr_item.closed and sms_item.closed


def test_validate_session_accepts_sessionid_cookie():
    with tempfile.NamedTemporaryFile("w", suffix=".json") as state:
        json.dump({"cookies": [{"name": "sessionid", "value": "opaque"}]}, state)
        state.flush()
        req = make_req("session.validate")
        req["input"] = {
            "session": {"kind": "playwright_storage_state_file", "path": state.name}
        }
        out = protocol.validate_session(req["input"])
    assert out["valid"] is True


def test_validate_session_rejects_missing_cookie():
    with tempfile.NamedTemporaryFile("w", suffix=".json") as state:
        json.dump({"cookies": []}, state)
        state.flush()
        try:
            protocol.validate_session(
                {"session": {"kind": "playwright_storage_state_file", "path": state.name}}
            )
            assert False, "expected ProtocolError"
        except protocol.ProtocolError as exc:
            assert exc.code == protocol.ERR_SESSION_EXPIRED


def test_ndjson_roundtrip_through_handler():
    import sidecar

    req = make_req()
    out = json.loads(protocol.json_dumps(sidecar.handle(req)))
    assert out["ok"] is True
    assert out["result"]["status"] == "healthy"


def test_session_validate_handler():
    import sidecar

    with tempfile.NamedTemporaryFile("w", suffix=".json") as state:
        json.dump({"cookies": [{"name": "sid_tt", "value": "opaque"}]}, state)
        state.flush()
        req = make_req("session.validate")
        req["input"] = {
            "session": {"kind": "playwright_storage_state_file", "path": state.name}
        }
        out = sidecar.handle(req)
    assert out["ok"] is True
    assert out["result"]["valid"] is True


def test_qr_start_rejects_relative_profile_dir():
    import qr_login

    try:
        qr_login.start({"profile_dir": "relative/profile", "locale": "zh-CN"})
        assert False, "expected ProtocolError"
    except protocol.ProtocolError as exc:
        assert exc.code == protocol.ERR_INVALID_REQUEST


def test_qr_data_url_ignores_small_data_image_logo():
    import browser
    import qr_login

    logo = "data:image/png;base64," + ("L" * 220)
    qr = "data:image/png;base64," + ("Q" * 220)
    with browser.launch() as (_pw, _browser, _context, page):
        page.set_content(f"""
          <img class="site-logo" src="{logo}" style="width:40px;height:40px">
          <img class="loading-placeholder" src="{logo}" style="width:300px;height:150px">
          <img id="douyin_qrcode" src="{qr}" style="width:180px;height:180px">
        """)
        value = qr_login._qr_data_url(page)

    assert value == qr


def test_interactive_and_probe_operations_reject_unknown_fields():
    import friends_list
    import qr_login
    import sms_login

    cases = (
        (qr_login.start, {"profile_dir": "/tmp/keeper-login", "unexpected": True}),
        (qr_login.poll, {"login_handle": "qr_missing", "unexpected": True}),
        (sms_login.start, {"profile_dir": "/tmp/keeper-login", "phone": "13800138000", "unexpected": True}),
        (sms_login.verify, {"login_handle": "sms_missing", "code": "123456", "unexpected": True}),
        (friends_list.list_friends, {"session": {"kind": "playwright_storage_state_file", "path": "/missing/session.json"}, "unexpected": True}),
    )
    for operation, input_data in cases:
        try:
            operation(input_data)
            assert False, "expected ProtocolError"
        except protocol.ProtocolError as exc:
            assert exc.code == protocol.ERR_INVALID_REQUEST


def test_session_validate_rejects_unknown_validation_level():
    try:
        protocol.validate_session({"session": {"kind": "playwright_storage_state_file", "path": "/missing/session.json"}, "validation_level": "deep"})
        assert False, "expected ProtocolError"
    except protocol.ProtocolError as exc:
        assert exc.code == protocol.ERR_INVALID_REQUEST


def test_qr_poll_rejects_unknown_handle():
    import qr_login

    try:
        qr_login.poll({"login_handle": "qr_missing"})
        assert False, "expected ProtocolError"
    except protocol.ProtocolError as exc:
        assert exc.code == protocol.ERR_LOGIN_HANDLE_NOT_FOUND


def test_qr_poll_keeps_platform_verification_session_open():
    import qr_login

    class Locator:
        def count(self):
            return 0

        def is_visible(self):
            return False

    class ChallengePage:
        def title(self):
            return "验证码中间页"

        def get_by_text(self, _text, exact=False):
            return Locator()

        def locator(self, _selector):
            return Locator()

    class Item:
        def __init__(self):
            self.page = ChallengePage()
            self.context = object()
            self.expires_at = datetime.now(timezone.utc) + timedelta(minutes=2)
            self.closed = False

        def close(self):
            self.closed = True

    item = Item()
    qr_login._sessions["qr-challenge"] = item
    try:
        result = qr_login.poll({"login_handle": "qr-challenge"})
        assert result == {"state": "challenge_required"}
        assert "qr-challenge" in qr_login._sessions
        assert item.closed is False
    finally:
        qr_login._sessions.pop("qr-challenge", None)


def test_login_success_does_not_accept_generic_avatar_without_user_identity():
    import qr_login

    class Locator:
        def __init__(self, visible):
            self.visible = visible
            self.first = self

        def count(self):
            return 1 if self.visible else 0

        def is_visible(self):
            return self.visible

    class LoggedOutPage:
        def locator(self, selector):
            if "avatar" in selector:
                return Locator(True)
            return Locator(False)

    assert qr_login._login_success_visible(LoggedOutPage()) is False


def test_login_success_requires_non_empty_user_identity_text():
    import qr_login

    class Locator:
        def __init__(self, text, present=True):
            self.text = text
            self.present = present
            self.first = self

        def count(self):
            return 1 if self.present else 0

        def is_visible(self):
            return True

        def text_content(self):
            return self.text

    class Page:
        def __init__(self, text):
            self.text = text

        def locator(self, selector):
            if selector == qr_login.LOGIN_PANEL_SELECTOR:
                return Locator('', present=False)
            return Locator(self.text if 'user-info' in selector else '')

    assert qr_login._login_success_visible(Page('')) is False
    assert qr_login._login_success_visible(Page('real nickname')) is True


def test_login_success_accepts_session_cookie_without_identity_selector():
    import qr_login

    class Page:
        def locator(self, _selector):
            return type('Locator', (), {'count': lambda self: 0, 'first': self, 'is_visible': lambda self: False})()

    class Context:
        def cookies(self):
            return [{'name': 'sessionid', 'value': 'opaque'}]

    assert qr_login._login_success_visible(Page(), Context()) is True


def test_sms_start_rejects_relative_profile_dir():
    import sms_login

    try:
        sms_login.start({"profile_dir": "relative/profile", "phone": "13800138000"})
        assert False, "expected ProtocolError"
    except protocol.ProtocolError as exc:
        assert exc.code == protocol.ERR_INVALID_REQUEST


def test_sms_verify_rejects_invalid_code():
    import sms_login

    try:
        sms_login.verify({"login_handle": "sms_missing", "code": "12a4"})
        assert False, "expected ProtocolError"
    except protocol.ProtocolError as exc:
        assert exc.code == protocol.ERR_INVALID_REQUEST


def test_sms_verify_rejects_unknown_handle():
    import sms_login

    try:
        sms_login.verify({"login_handle": "sms_missing", "code": "123456"})
        assert False, "expected ProtocolError"
    except protocol.ProtocolError as exc:
        assert exc.code == protocol.ERR_LOGIN_HANDLE_NOT_FOUND


def test_friends_list_rejects_missing_session_file():
    import friends_list

    try:
        friends_list.list_friends({"session": {"kind": "playwright_storage_state_file", "path": "/missing/session.json"}})
        assert False, "expected ProtocolError"
    except protocol.ProtocolError as exc:
        assert exc.code == protocol.ERR_SESSION_EXPIRED


def test_friends_extracts_identity_from_extended_douyin_row_fields():
    import browser
    import friends_list

    with browser.launch() as (_pw, _browser, _context, page):
        page.set_content("""
          <div class="conversationConversationItem" data-conversation-id="conversation-direct">
            <div><div><div><div>
              <div class="conversationConversationItemtitle" data-sec-uid="sec-direct">Direct friend</div>
            </div></div></div></div>
          </div>
          <div class="conversationConversationItem" data-id="conversation-query">
            <div><div><div><div>
              <div class="conversationConversationItemtitle">
                <a href="/chat?sec_uid=sec-query&conversation_id=conversation-query">Query friend</a>
              </div>
            </div></div></div></div>
          </div>
        """)
        rows = friends_list._extract(page)

    by_name = {row["display_name"]: row for row in rows}
    assert by_name["Direct friend"]["platform_user_id"] == "sec-direct"
    assert by_name["Direct friend"]["conversation"]["platform_conversation_id"] == "conversation-direct"
    assert by_name["Query friend"]["platform_user_id"] == "sec-query"
    assert by_name["Query friend"]["conversation"]["platform_conversation_id"] == "conversation-query"


def test_friends_relation_adapter_keeps_only_mutual_users():
    import friends_list

    friend = friends_list._friend_from_relation({
        "nickname": "真正好友",
        "sec_uid": "sec-mutual",
        "follow_status": 2,
        "follower_status": 1,
    })
    assert friend["platform_user_id"] == "sec-mutual"
    assert friend["identity_status"] == "resolved"
    assert friends_list._friend_from_relation({
        "nickname": "聊天对象",
        "sec_uid": "sec-chat-only",
        "follow_status": 0,
        "follower_status": 0,
    }) is None
    assert friends_list._friend_from_relation({
        "nickname": "粉丝列表中的互关用户",
        "sec_uid": "sec-follower-mutual",
        "follow_status": 2,
    }, from_follower_list=True)["platform_user_id"] == "sec-follower-mutual"


def test_friends_follower_scan_waits_for_exhausted_pagination():
    import friends_list

    assert friends_list._follower_scan_complete(True, True, 20) is False
    assert friends_list._follower_scan_complete(False, False, 20) is False
    assert friends_list._follower_scan_complete(True, False, friends_list.FOLLOWER_STABLE_ROUNDS - 1) is False
    assert friends_list._follower_scan_complete(True, False, friends_list.FOLLOWER_STABLE_ROUNDS) is True
    assert friends_list._follower_scan_complete(True, None, 20, at_bottom=False) is False
    assert friends_list._follower_scan_complete(True, None, 20, at_bottom=True) is True
    assert friends_list._follower_scan_complete(True, True, friends_list.FOLLOWER_BOTTOM_STABLE_ROUNDS - 1, at_bottom=True) is False
    assert friends_list._follower_scan_complete(True, True, friends_list.FOLLOWER_BOTTOM_STABLE_ROUNDS, at_bottom=True) is True
    assert friends_list._follower_scan_complete(True, True, friends_list.FOLLOWER_BOTTOM_STABLE_ROUNDS, scroll_stuck=True) is True


def test_message_send_rejects_missing_target_ids():
    import message_send

    with tempfile.NamedTemporaryFile("w", suffix=".json") as state:
        json.dump({"cookies": []}, state)
        state.flush()
        try:
            message_send.send_text({
                "session": {"kind": "playwright_storage_state_file", "path": state.name},
                "target": {}, "message": {"text": "hello"},
            })
            assert False, "expected ProtocolError"
        except protocol.ProtocolError as exc:
            assert exc.code == protocol.ERR_INVALID_REQUEST
