#!/usr/bin/env python3
"""Write and validate a Netscape cookies.txt for yt-dlp from Actions secrets.

Tries YTDLP_COOKIES_B64 first, then falls back to YTDLP_COOKIES.
"""

from __future__ import annotations

import base64
import os
import sys
from pathlib import Path


def validate_cookie_text(text: str) -> tuple[bool, str, dict[str, int | str]]:
    lines = [ln for ln in text.splitlines() if ln.strip() and not ln.strip().startswith("#")]
    youtube_lines = [ln for ln in lines if "youtube.com" in ln.lower()]
    tabbed = sum(1 for ln in youtube_lines if "\t" in ln)
    stats: dict[str, int | str] = {
        "total_data_lines": len(lines),
        "youtube_lines": len(youtube_lines),
        "tab_separated": tabbed,
    }

    if len(youtube_lines) == 0:
        return False, "No youtube.com rows found", stats
    if tabbed == 0:
        return False, "Cookie rows have no TAB characters (secret likely mangled spaces)", stats

    important = ("SID", "HSID", "SSID", "LOGIN_INFO", "__Secure-1PSID", "__Secure-3PSID", "APISID", "SAPISID")
    present: list[str] = []
    for ln in youtube_lines:
        parts = ln.split("\t")
        if len(parts) >= 6:
            present.append(parts[5])
    found = [name for name in important if name in present]
    stats["auth_cookie_names_found"] = ",".join(found) if found else "none"
    if not found:
        # Still usable sometimes; warn but accept.
        return True, "OK (warning: no common auth cookie names detected)", stats
    return True, "OK", stats


def try_b64(out: Path) -> tuple[bool, str]:
    b64 = os.environ.get("YTDLP_COOKIES_B64", "").strip()
    if not b64:
        return False, "YTDLP_COOKIES_B64 empty"
    try:
        data = base64.b64decode(b64, validate=False)
    except Exception as err:  # noqa: BLE001
        return False, f"YTDLP_COOKIES_B64 invalid base64 ({err})"
    # Decode as text for validation; keep original bytes on disk.
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("utf-8", errors="replace")
    ok, message, stats = validate_cookie_text(text)
    print(f"[cookies] tried=YTDLP_COOKIES_B64 ok={ok} detail={message} stats={stats}")
    if not ok:
        return False, message
    out.write_bytes(data if data.endswith(b"\n") else data + b"\n")
    return True, "YTDLP_COOKIES_B64"


def try_raw(out: Path) -> tuple[bool, str]:
    raw = os.environ.get("YTDLP_COOKIES", "")
    if not raw.strip():
        return False, "YTDLP_COOKIES empty"
    text = raw if raw.endswith("\n") else raw + "\n"
    ok, message, stats = validate_cookie_text(text)
    print(f"[cookies] tried=YTDLP_COOKIES ok={ok} detail={message} stats={stats}")
    if not ok:
        return False, message
    out.write_text(text, encoding="utf-8", newline="\n")
    return True, "YTDLP_COOKIES"


def main() -> int:
    out = Path(os.environ.get("YTDLP_COOKIES_OUT", "")).expanduser()
    if not out.as_posix():
        print("[cookies] ERROR: YTDLP_COOKIES_OUT is required", file=sys.stderr)
        return 1

    attempts = [try_b64, try_raw]
    errors: list[str] = []
    for attempt in attempts:
        ok, info = attempt(out)
        if ok:
            print(f"[cookies] Using {info}")
            print(f"YTDLP_COOKIES_FILE={out}")
            return 0
        errors.append(info)

    if all(e.endswith("empty") for e in errors):
        print("[cookies] No cookie secret set")
        return 0

    print("[cookies] ERROR: both cookie secrets failed validation:", file=sys.stderr)
    for err in errors:
        print(f"[cookies]  - {err}", file=sys.stderr)
    print(
        "[cookies] Re-export Netscape cookies.txt and save via the Import page cookie box "
        "(writes both YTDLP_COOKIES_B64 and YTDLP_COOKIES).",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
