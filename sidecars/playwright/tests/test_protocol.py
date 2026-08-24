"""Unit tests for the NDJSON protocol codec (docs/10)."""

import json
import sys
import os
import tempfile

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
