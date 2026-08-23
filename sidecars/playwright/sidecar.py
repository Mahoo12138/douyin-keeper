#!/usr/bin/env python3
"""Douyin Keeper Playwright Sidecar — NDJSON protocol loop (docs/10).

Usage:
    echo '{"protocol_version":1,"request_id":"x","op":"health.check","deadline_ms":5000,"input":{}}' \\
      | python sidecar.py

Only health.check works at M0; all other ops return UNSUPPORTED_OPERATION.
Real Douyin adapters (QR login, session validate, friends.list, message.send_*)
land with M1/M3. stdout carries protocol messages only; logs go to stderr.
"""

import sys
import time

import protocol


def handle(req):
    started = time.monotonic()
    op = req["op"]
    duration = lambda: int((time.monotonic() - started) * 1000)
    try:
        if op == "health.check":
            return protocol.success(req, protocol.health_result(), "browser.consumer", duration_ms=duration())
        # Placeholders for ops requiring a browser context (M1/M3).
        return protocol.unsupported(req)
    except protocol.ProtocolError as exc:
        return protocol.failure(req, exc, duration_ms=duration())
    except Exception as exc:  # noqa: BLE001 — never crash the loop on one op
        protocol.log(f"internal error on {op}: {exc!r}")
        return protocol.failure(
            req, protocol.ProtocolError("SIDECAR_INTERNAL_ERROR", "internal error"), duration_ms=duration()
        )


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = protocol.parse_request(line)
        except protocol.ProtocolError as exc:
            # Cannot even build a proper envelope without a request_id; fall
            # back to a minimal failure line.
            print(f'{{"protocol_version":1,"request_id":"","ok":false,"error":{{"code":"{exc.code}","retryable":false,"message":"{exc}"}},"meta":{{"adapter":"nop","adapter_version":"0"}}}}')
            continue
        sys.stdout.write(protocol.json_dumps(handle(req)) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()