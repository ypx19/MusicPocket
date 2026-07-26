"""Shared yt-dlp helpers for MusicPocket scripts."""

from __future__ import annotations

import os
import shutil
import subprocess
from functools import lru_cache
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


@lru_cache(maxsize=1)
def ytdlp_supports(*flags: str) -> bool:
    """Return True if local yt-dlp recognizes the given CLI flags."""
    ytdlp = shutil.which("yt-dlp")
    if not ytdlp:
        return False
    try:
        help_text = subprocess.run(
            [ytdlp, "--help"],
            check=False,
            capture_output=True,
            text=True,
        ).stdout
    except OSError:
        return False
    return all(flag in help_text for flag in flags)


def ytdlp_base_args(*, for_download: bool = False) -> list[str]:
    """Common yt-dlp flags for local / Actions YouTube extraction."""
    browser = cookies_from_browser()
    cookies = cookies_file()
    args: list[str] = ["--no-playlist"]

    if ytdlp_supports("--js-runtimes"):
        args.extend(["--js-runtimes", "deno"])
    if ytdlp_supports("--remote-components"):
        args.extend(["--remote-components", "ejs:github"])

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
    args: list[str] = ["--no-playlist", "-f", "bestaudio/bestaudio*/best/best*"]
    if ytdlp_supports("--js-runtimes"):
        args.extend(["--js-runtimes", "deno"])
    if ytdlp_supports("--remote-components"):
        args.extend(["--remote-components", "ejs:github"])
    args.extend(["--extractor-args", "youtube:player_client=web_safari,web,mweb"])
    if browser:
        args.extend(["--cookies-from-browser", browser])
    elif cookies:
        args.extend(["--cookies", cookies])
    return args
