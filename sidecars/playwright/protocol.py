"""Sidecar protocol v1 helpers (sidecar-protocol-v1.schema.json, docs/10).

The sidecar is a dumb adapter: NDJSON requests on stdin, NDJSON responses on
stdout, logs on stderr. It never touches the database, Redis, or secrets.
"""

import json
import os
import sys
import time

PROTOCOL_VERSION = 1

OPS = {
    "health.check",
    "login.qr.start",
    "login.qr.poll",
    "login.sms.start",
    "login.sms.verify",
    "session.validate",
    "friends.list",
    "conversations.list",
    "conversations.archive",
    "message.send_text",
    "message.send_sticker",
    "message.send_first",
}

# Stable error codes (docs/10 §11).
ERR_INVALID_REQUEST = "INVALID_REQUEST"
ERR_UNSUPPORTED_VERSION = "UNSUPPORTED_PROTOCOL_VERSION"
ERR_UNSUPPORTED_OPERATION = "UNSUPPORTED_OPERATION"
ERR_DEADLINE_EXCEEDED = "DEADLINE_EXCEEDED"
ERR_SESSION_EXPIRED = "SESSION_EXPIRED"
ERR_ADAPTER_UNAVAILABLE = "ADAPTER_UNAVAILABLE"
ERR_QR_EXPIRED = "QR_EXPIRED"
ERR_SMS_CODE_INVALID = "SMS_CODE_INVALID"
ERR_SMS_CODE_EXPIRED = "SMS_CODE_EXPIRED"
ERR_LOGIN_HANDLE_NOT_FOUND = "LOGIN_HANDLE_NOT_FOUND"
ERR_CHALLENGE_REQUIRED = "CHALLENGE_REQUIRED"
ERR_PLATFORM_RATE_LIMITED = "PLATFORM_RATE_LIMITED"
ERR_BROWSER_SELECTOR_CHANGED = "BROWSER_SELECTOR_CHANGED"
ERR_TARGET_IDENTITY_MISMATCH = "TARGET_IDENTITY_MISMATCH"
ERR_CONVERSATION_NOT_FOUND = "CONVERSATION_NOT_FOUND"
ERR_PLATFORM_ARCHIVE_UNAVAILABLE = "PLATFORM_ARCHIVE_UNAVAILABLE"
ERR_ADAPTER_INCOMPATIBLE = "ADAPTER_INCOMPATIBLE"
ERR_BROWSER_NAVIGATION_FAILED = "BROWSER_NAVIGATION_FAILED"
ERR_BROWSER_CONTEXT_FAILED = "BROWSER_CONTEXT_FAILED"
ERR_NETWORK_TIMEOUT = "NETWORK_TIMEOUT"
ERR_NETWORK_ERROR = "NETWORK_ERROR"

MIN_DEADLINE_MS = 1000
MAX_DEADLINE_MS = 300000


class ProtocolError(Exception):
    def __init__(self, code, message, retryable=False, detail=None):
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.detail = detail


def parse_request(line):
    """Parse one NDJSON request line into a dict, raising ProtocolError."""
    try:
        req = json.loads(line)
    except json.JSONDecodeError as exc:
        raise ProtocolError(ERR_INVALID_REQUEST, f"invalid JSON: {exc}") from exc
    if not isinstance(req, dict):
        raise ProtocolError(ERR_INVALID_REQUEST, "request must be an object")
    if type(req.get("protocol_version")) is not int or req.get("protocol_version") != PROTOCOL_VERSION:
        raise ProtocolError(
            ERR_UNSUPPORTED_VERSION,
            f"unsupported protocol_version: {req.get('protocol_version')}",
        )
    if not isinstance(req.get("request_id"), str) or not req.get("request_id"):
        raise ProtocolError(ERR_INVALID_REQUEST, "missing request_id")
    op = req.get("op")
    if op not in OPS:
        raise ProtocolError(ERR_UNSUPPORTED_OPERATION, f"unsupported op: {op}")
    deadline_ms = req.get("deadline_ms")
    if type(deadline_ms) is not int or not MIN_DEADLINE_MS <= deadline_ms <= MAX_DEADLINE_MS:
        raise ProtocolError(ERR_INVALID_REQUEST, "deadline_ms must be between 1000 and 300000")
    if not isinstance(req.get("input"), dict):
        raise ProtocolError(ERR_INVALID_REQUEST, "input must be an object")
    allowed = {"protocol_version", "request_id", "op", "deadline_ms", "input"}
    if set(req) - allowed:
        raise ProtocolError(ERR_INVALID_REQUEST, "request contains unknown fields")
    return req


def success(req, result, adapter, adapter_version="0.1.0", duration_ms=0):
    return {
        "protocol_version": PROTOCOL_VERSION,
        "request_id": req["request_id"],
        "ok": True,
        "result": result,
        "meta": {"adapter": adapter, "adapter_version": adapter_version, "duration_ms": duration_ms},
    }


def failure(req, err, adapter="nop", adapter_version="0.1.0", duration_ms=0):
    error = {"code": err.code, "retryable": err.retryable, "message": str(err)}
    if isinstance(err.detail, dict):
        error["detail"] = err.detail
    return {
        "protocol_version": PROTOCOL_VERSION,
        "request_id": req["request_id"],
        "ok": False,
        "error": error,
        "meta": {"adapter": adapter, "adapter_version": adapter_version, "duration_ms": duration_ms},
    }


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def json_dumps(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def health_result():
    return {
        "status": "healthy",
        "adapter": "browser.consumer",
        "version": "0.1.0",
        "capabilities": [
            "login.qr",
            "login.sms",
            "session.validate",
            "friends.sync",
            "conversations.sync",
            "message.send.text.existing",
        ],
    }


def _session_file(input_data):
    if not isinstance(input_data, dict):
        raise ProtocolError(ERR_INVALID_REQUEST, "input must be an object")
    session = input_data.get("session")
    if not isinstance(session, dict) or session.get("kind") != "playwright_storage_state_file":
        raise ProtocolError(ERR_INVALID_REQUEST, "session must reference a storage state file")
    if set(session) - {"kind", "path"}:
        raise ProtocolError(ERR_INVALID_REQUEST, "session contains unknown fields")
    path = session.get("path")
    if not isinstance(path, str) or not path:
        raise ProtocolError(ERR_INVALID_REQUEST, "session.path is required")
    if not os.path.isfile(path):
        raise ProtocolError(ERR_SESSION_EXPIRED, "session file is unavailable")
    return path


def validate_session(input_data):
    """Perform the cheap, sidecar-local validation used before a browser job.

    The worker owns encryption/decryption. The sidecar only receives a short
    lived storage-state file and never returns its contents. A later adapter
    can add a live page check without changing this result contract.
    """
    if not isinstance(input_data, dict):
        raise ProtocolError(ERR_INVALID_REQUEST, "input must be an object")
    if set(input_data) - {"session", "validation_level"}:
        raise ProtocolError(ERR_INVALID_REQUEST, "input contains unknown fields")
    validation_level = input_data.get("validation_level", "basic")
    if validation_level != "basic":
        raise ProtocolError(ERR_INVALID_REQUEST, "validation_level must be basic")
    path = _session_file(input_data)
    try:
        with open(path, "r", encoding="utf-8") as handle:
            state = json.load(handle)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ProtocolError(ERR_SESSION_EXPIRED, "session state cannot be read") from exc
    if not isinstance(state, dict):
        raise ProtocolError(ERR_SESSION_EXPIRED, "session state is invalid")

    cookies = state.get("cookies")
    if not isinstance(cookies, list):
        raise ProtocolError(ERR_SESSION_EXPIRED, "session state has no cookies")
    has_session = any(
        isinstance(cookie, dict)
        and isinstance(cookie.get("value"), str)
        and cookie["value"].strip()
        and (
            str(cookie.get("name", "")).startswith("sessionid")
            or cookie.get("name") == "sid_tt"
        )
        for cookie in cookies
    )
    if not has_session:
        raise ProtocolError(ERR_SESSION_EXPIRED, "session cookie is missing")
    return {"valid": True, "identity": {}, "capability_hints": ["session.validate"]}


def unsupported(req):
    """Skeleton response for ops whose real adapters land in M1/M3."""
    return failure(
        req,
        ProtocolError(ERR_UNSUPPORTED_OPERATION, "op not implemented in M0 sidecar"),
        adapter="browser.consumer",
    )
