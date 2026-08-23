#!/usr/bin/env python3
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

def adapter():
    return os.environ.get("HUOHUA_ADAPTER", "live")

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "version"
    if cmd in ("version", "ping"):
        print(json.dumps({"ok": True, "name": "huohua-playwright", "version": "0.2.0", "adapter": adapter()}, ensure_ascii=False))
        return 0
    raw = sys.stdin.read() or "{}"
    try:
        req = json.loads(raw)
    except json.JSONDecodeError:
        print(json.dumps({"type": "error", "ok": False, "code": "bad_json", "message": "作业 JSON 无法解析"}, ensure_ascii=False))
        return 0
    op = (req.get("op") or "").strip()
    if cmd != "job" and not op:
        print(json.dumps({"type": "error", "ok": False, "code": "not_implemented", "op": op}, ensure_ascii=False))
        return 0
    from adapters.douyin_web import HANDLERS
    from adapters.douyin_web.io import fail
    fn = HANDLERS.get(op)
    if not fn:
        return fail("not_implemented", "未知作业 %s" % op, op=op)
    return fn(req) or 0

if __name__ == "__main__":
    raise SystemExit(main())
