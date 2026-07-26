"""Shared yt-dlp helpers for MusicPocket scripts."""

from __future__ import annotations

import os
from pathlib import Path

from utils import log


def ytdlp_base_args() -> list[str]:
    """Common yt-dlp flags for GitHub Actions / YouTube extraction."""
    args = [
        "--js-runtimes",
        "deno",
        "--no-playlist",
    ]
    cookies = os.environ.get("YTDLP_COOKIES_FILE", "").strip()
    if cookies and Path(cookies).is_file():
        log("ytdlp", f"Using cookies file {cookies}")
        args.extend(["--cookies", cookies])
    else:
        log("ytdlp", "No YTDLP_COOKIES_FILE set (YouTube may bot-check downloads)")
    return args
