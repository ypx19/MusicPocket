"""Shared yt-dlp helpers for MusicPocket scripts."""

from __future__ import annotations

import os
from pathlib import Path

from utils import log


def cookies_file() -> str | None:
    cookies = os.environ.get("YTDLP_COOKIES_FILE", "").strip()
    if cookies and Path(cookies).is_file():
        return cookies
    return None


def ytdlp_base_args(*, for_download: bool = False) -> list[str]:
    """Common yt-dlp flags for GitHub Actions / YouTube extraction.

    Android/iOS clients do not support cookies. When cookies are present we must
    use cookie-capable web clients; otherwise Android is preferred on CI IPs.
    """
    cookies = cookies_file()
    args = [
        "--js-runtimes",
        "deno",
        "--remote-components",
        "ejs:github",
        "--no-playlist",
    ]

    if cookies:
        log("ytdlp", f"Using cookies file {cookies}")
        # web / mweb / tv_embedded support cookies; android does not.
        args.extend(
            [
                "--extractor-args",
                "youtube:player_client=web,mweb,tv_embedded",
                "--cookies",
                cookies,
            ]
        )
    else:
        log("ytdlp", "No YTDLP_COOKIES_FILE set — using anonymous mobile clients")
        args.extend(
            [
                "--extractor-args",
                "youtube:player_client=android,ios,tv_embedded;player_skip=webpage",
            ]
        )

    if for_download:
        # Prefer audio; fall back broadly if bestaudio is missing.
        args.extend(["-f", "bestaudio/bestaudio*/best/best*"])

    return args


def ytdlp_retry_args() -> list[str]:
    """Alternate client set used after a failed download attempt."""
    cookies = cookies_file()
    args = [
        "--js-runtimes",
        "deno",
        "--remote-components",
        "ejs:github",
        "--no-playlist",
        "-f",
        "bestaudio/bestaudio*/best/best*",
    ]
    if cookies:
        args.extend(
            [
                "--extractor-args",
                "youtube:player_client=web_safari,web,tv,tv_embedded,mweb",
                "--cookies",
                cookies,
            ]
        )
    else:
        args.extend(
            [
                "--extractor-args",
                "youtube:player_client=ios,tv_embedded,mweb",
            ]
        )
    return args
