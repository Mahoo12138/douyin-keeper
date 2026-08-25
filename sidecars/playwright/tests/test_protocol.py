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
