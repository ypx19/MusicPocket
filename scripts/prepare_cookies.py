#!/usr/bin/env python3
"""Write and validate a Netscape cookies.txt for yt-dlp from Actions secrets."""

from __future__ import annotations

import base64
import os
import sys
from pathlib import Path


def main() -> int:
    out = Path(os.environ.get("YTDLP_COOKIES_OUT", "")).expanduser()
    if not out.as_posix():
        print("[cookies] ERROR: YTDLP_COOKIES_OUT is required", file=sys.stderr)
        return 1

    b64 = os.environ.get("YTDLP_COOKIES_B64", "").strip()
    raw = os.environ.get("YTDLP_COOKIES", "")

    if b64:
        try:
            data = base64.b64decode(b64, validate=False)
        except Exception as err:  # noqa: BLE001
            print(f"[cookies] ERROR: YTDLP_COOKIES_B64 is not valid base64 ({err})", file=sys.stderr)
            return 1
        out.write_bytes(data)
        print("[cookies] Wrote cookies from YTDLP_COOKIES_B64")
    elif raw.strip():
        # Preserve exact text; do not reflow tabs.
        out.write_text(raw if raw.endswith("\n") else raw + "\n", encoding="utf-8", newline="\n")
        print("[cookies] Wrote cookies from YTDLP_COOKIES (prefer YTDLP_COOKIES_B64)")
    else:
        print("[cookies] No cookie secret set")
        return 0

    text = out.read_text(encoding="utf-8", errors="replace")
    lines = [ln for ln in text.splitlines() if ln.strip() and not ln.strip().startswith("#")]
    youtube_lines = [ln for ln in lines if "youtube.com" in ln.lower()]
    tabbed = sum(1 for ln in youtube_lines if "\t" in ln)

    print(f"[cookies] total_data_lines={len(lines)} youtube_lines={len(youtube_lines)} tab_separated={tabbed}")

    if len(youtube_lines) == 0:
        print(
            "[cookies] ERROR: No youtube.com rows found. Export Netscape cookies.txt for youtube.com.",
            file=sys.stderr,
        )
        return 1

    if tabbed == 0:
        print(
            "[cookies] ERROR: Cookie rows have no TAB characters. "
            "GitHub secrets often smash tabs into spaces. "
            "Store the file as base64 in YTDLP_COOKIES_B64 instead.",
            file=sys.stderr,
        )
        return 1

    important = ("SID", "HSID", "SSID", "LOGIN_INFO", "__Secure-1PSID", "__Secure-3PSID", "APISID", "SAPISID")
    present = []
    for ln in youtube_lines:
        parts = ln.split("\t")
        if len(parts) >= 6:
            present.append(parts[5])
    found = [name for name in important if name in present]
    print(f"[cookies] auth_cookie_names_found={','.join(found) if found else 'none'}")
    if not found:
        print(
            "[cookies] WARNING: No common YouTube auth cookies detected. "
            "Export while logged into youtube.com, then update the secret.",
            file=sys.stderr,
        )

    print(f"YTDLP_COOKIES_FILE={out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
