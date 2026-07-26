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


def cookies_from_browser() -> str | None:
    browser = os.environ.get("YTDLP_COOKIES_FROM_BROWSER", "").strip()
    return browser or None


def ytdlp_base_args(*, for_download: bool = False) -> list[str]:
    """Common yt-dlp flags for GitHub Actions / YouTube extraction.

    Prefer --cookies-from-browser for local imports. On Actions, use a Netscape
    cookies file from YTDLP_COOKIES_B64. Android/iOS clients do not support cookies.
    """
    browser = cookies_from_browser()
    cookies = cookies_file()
    args = [
        "--js-runtimes",
        "deno",
        "--remote-components",
        "ejs:github",
        "--no-playlist",
    ]

    if browser:
        log("ytdlp", f"Using cookies from browser: {browser}")
        args.extend(
            [
                "--cookies-from-browser",
                browser,
                "--extractor-args",
                "youtube:player_client=web,mweb",
            ]
        )
    elif cookies:
        log("ytdlp", f"Using cookies file {cookies}")
        args.extend(
            [
                "--extractor-args",
                "youtube:player_client=web,mweb",
                "--cookies",
                cookies,
            ]
        )
    else:
        log("ytdlp", "No cookies configured — using anonymous mobile clients")
        args.extend(
            [
                "--extractor-args",
                "youtube:player_client=android,ios;player_skip=webpage",
            ]
        )

    if for_download:
        args.extend(["-f", "bestaudio/bestaudio*/best/best*"])

    return args


def ytdlp_retry_args() -> list[str]:
    """Alternate client set used after a failed download attempt."""
    browser = cookies_from_browser()
    cookies = cookies_file()
    args = [
        "--js-runtimes",
        "deno",
        "--remote-components",
        "ejs:github",
        "--no-playlist",
        "-f",
        "bestaudio/bestaudio*/best/best*",
        "--extractor-args",
        "youtube:player_client=web_safari,web,mweb",
    ]
    if browser:
        args.extend(["--cookies-from-browser", browser])
    elif cookies:
        args.extend(["--cookies", cookies])
    return args
