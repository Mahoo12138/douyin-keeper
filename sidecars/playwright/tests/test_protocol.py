"""Unit tests for the NDJSON protocol codec (docs/10)."""

import json
import sys
import os
import tempfile
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
