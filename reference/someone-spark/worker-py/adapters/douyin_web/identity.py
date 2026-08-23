def public_identity(page, context):
    uid = ""
    try:
        cookies = context.cookies()
    except Exception:
        cookies = []
    try:
        for c in cookies or []:
            name = c.get("name") or ""
            val = str(c.get("value") or "").strip()
            if not val:
                continue
            if name in ("uid_tt", "uid_tt_ss", "sid_uid"):
                uid = val
                break
    except Exception:
        uid = ""
    nick = ""
    try:
        nick = page.evaluate(
            """() => {
                const picks = [
                    '[class*="userName"]',
                    '[class*="nickname"]',
                    '[data-e2e="user-info"]',
                    '[data-e2e="user-title"]',
                ];
                for (const s of picks) {
                    const el = document.querySelector(s);
                    const t = (el && (el.textContent || '')).trim();
                    if (t && t.length < 40 && t !== '我的' && t !== '抖音') return t;
                }
                return '';
            }"""
        ) or ""
    except Exception:
        nick = ""
    return str(nick).strip()[:64], uid[:64]
