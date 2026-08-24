#!/usr/bin/env python3
"""Douyin Keeper Playwright Sidecar — NDJSON protocol loop (docs/10).

Usage:
    echo '{"protocol_version":1,"request_id":"x","op":"health.check","deadline_ms":5000,"input":{}}' \\
      | python sidecar.py

The baseline supports health.check, local session.validate, QR/SMS login, and
friends.list. Message sending is a separate adapter increment.
stdout carries protocol messages only; logs go to stderr.
"""

import json
import sys
import threading
import time

import protocol
import friends_list
import message_send
import qr_login
import sms_login

ADAPTER_NAME = "browser.consumer"


def _request_id_from_line(line):
    try:
        value = json.loads(line)
    except (TypeError, json.JSONDecodeError):
        return "invalid-request"
    if isinstance(value, dict) and isinstance(value.get("request_id"), str) and value["request_id"]:
        return value["request_id"]
    return "invalid-request"


def invalid_request_response(line, err):
    return protocol.failure(
        {"request_id": _request_id_from_line(line)},
        err,
        adapter=ADAPTER_NAME,
        duration_ms=0,
    )


def cleanup_expired_handles():
    return qr_login.cleanup_expired() + sms_login.cleanup_expired()


def _cleanup_loop():
    while True:
        time.sleep(10)
        try:
            cleanup_expired_handles()
        except Exception as exc:  # noqa: BLE001 — cleanup must not kill the protocol loop
            protocol.log(f"expired handle cleanup failed: {exc!r}")


def handle(req):
    cleanup_expired_handles()
    started = time.monotonic()
    op = req["op"]
    duration = lambda: int((time.monotonic() - started) * 1000)
    try:
        if op == "health.check":
            return protocol.success(req, protocol.health_result(), "browser.consumer", duration_ms=duration())
        if op == "session.validate":
            return protocol.success(
                req,
                protocol.validate_session(req.get("input")),
                "browser.consumer",
                duration_ms=duration(),
            )
        if op == "login.qr.start":
            return protocol.success(req, qr_login.start(req.get("input")), "browser.consumer", duration_ms=duration())
        if op == "login.qr.poll":
            return protocol.success(req, qr_login.poll(req.get("input")), "browser.consumer", duration_ms=duration())
        if op == "login.sms.start":
            return protocol.success(req, sms_login.start(req.get("input")), "browser.consumer", duration_ms=duration())
        if op == "login.sms.verify":
            return protocol.success(req, sms_login.verify(req.get("input")), "browser.consumer", duration_ms=duration())
        if op == "friends.list":
            return protocol.success(req, friends_list.list_friends(req.get("input")), "browser.consumer", duration_ms=duration())
        if op == "message.send_text":
            return protocol.success(req, message_send.send_text(req.get("input")), "browser.consumer", duration_ms=duration())
        # Placeholders for ops requiring additional browser adapters.
        return protocol.unsupported(req)
    except protocol.ProtocolError as exc:
        return protocol.failure(req, exc, adapter=ADAPTER_NAME, duration_ms=duration())
    except RuntimeError as exc:
        code = protocol.ERR_ADAPTER_UNAVAILABLE if str(exc) == "playwright_missing" else "SIDECAR_INTERNAL_ERROR"
        return protocol.failure(
            req,
            protocol.ProtocolError(code, "browser adapter is unavailable"),
            adapter=ADAPTER_NAME,
            duration_ms=duration(),
        )
    except Exception as exc:  # noqa: BLE001 — never crash the loop on one op
        protocol.log(f"internal error on {op}: {exc!r}")
        return protocol.failure(
            req,
            protocol.ProtocolError("SIDECAR_INTERNAL_ERROR", "internal error"),
            adapter=ADAPTER_NAME,
            duration_ms=duration(),
        )


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = protocol.parse_request(line)
        except protocol.ProtocolError as exc:
            sys.stdout.write(protocol.json_dumps(invalid_request_response(line, exc)) + "\n")
            sys.stdout.flush()
            continue
        sys.stdout.write(protocol.json_dumps(handle(req)) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    threading.Thread(target=_cleanup_loop, name="sidecar-cleanup", daemon=True).start()
    main()
