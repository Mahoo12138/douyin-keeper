"""Sidecar protocol v1 helpers (sidecar-protocol-v1.schema.json, docs/10).

The sidecar is a dumb adapter: NDJSON requests on stdin, NDJSON responses on
stdout, logs on stderr. It never touches the database, Redis, or secrets.
"""

import json
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
    "message.send_text",
    "message.send_sticker",
    "message.send_first",
}

# Stable error codes (docs/10 §11).
ERR_INVALID_REQUEST = "INVALID_REQUEST"
ERR_UNSUPPORTED_VERSION = "UNSUPPORTED_PROTOCOL_VERSION"
ERR_UNSUPPORTED_OPERATION = "UNSUPPORTED_OPERATION"
ERR_SESSION_EXPIRED = "SESSION_EXPIRED"
ERR_ADAPTER_UNAVAILABLE = "ADAPTER_UNAVAILABLE"


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
    if req.get("protocol_version") != PROTOCOL_VERSION:
        raise ProtocolError(
            ERR_UNSUPPORTED_VERSION,
            f"unsupported protocol_version: {req.get('protocol_version')}",
        )
    if not req.get("request_id"):
        raise ProtocolError(ERR_INVALID_REQUEST, "missing request_id")
    op = req.get("op")
    if op not in OPS:
        raise ProtocolError(ERR_UNSUPPORTED_OPERATION, f"unsupported op: {op}")
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
    return {
        "protocol_version": PROTOCOL_VERSION,
        "request_id": req["request_id"],
        "ok": False,
        "error": {"code": err.code, "retryable": err.retryable, "message": str(err)},
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
            "session.validate",
            "friends.sync",
            "message.send.text.existing",
        ],
    }


def unsupported(req):
    """Skeleton response for ops whose real adapters land in M1/M3."""
    return failure(
        req,
        ProtocolError(ERR_UNSUPPORTED_OPERATION, "op not implemented in M0 sidecar"),
        adapter="browser.consumer",
    )