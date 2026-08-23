import json
import sys

_SECRET = ("session_blob", "cookies", "cookie", "storage_state", "phone_cipher")

def _strip(obj):
    if isinstance(obj, dict):
        return {k: _strip(v) for k, v in obj.items() if k not in _SECRET}
    if isinstance(obj, list):
        return [_strip(v) for v in obj]
    return obj

def emit(obj):
    sys.stdout.write(json.dumps(_strip(obj), ensure_ascii=False) + "\n")
    sys.stdout.flush()

def fail(code, message, **extra):
    payload = {"type": "error", "ok": False, "code": code, "message": message}
    payload.update(extra)
    emit(payload)
    return 1

def done(ok=True, **extra):
    payload = {"type": "done", "ok": bool(ok)}
    payload.update(extra)
    emit(payload)
    return 0 if ok else 1
