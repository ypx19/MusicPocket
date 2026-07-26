#!/usr/bin/env python3
"""Fetch synchronized LRC lyrics from LRCLIB (best-effort, never fatal)."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from utils import log

LRCLIB_API = "https://lrclib.net/api/search"


def fetch_lrc(title: str, artist: str, album: str = "", duration: int | None = None) -> str | None:
    params = {"track_name": title, "artist_name": artist}
    if album:
        params["album_name"] = album
    query = urllib.parse.urlencode(params)
    url = f"{LRCLIB_API}?{query}"
    log("lyrics", f"GET {url}")

    req = urllib.request.Request(
        url,
        headers={"User-Agent": "MusicPocket/0.1 (personal library; +https://github.com/)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        log("lyrics", f"HTTP {err.code}; continuing without lyrics")
        return None
    except Exception as err:  # noqa: BLE001 — lyrics are optional
        log("lyrics", f"Request failed ({err}); continuing without lyrics")
        return None

    if not isinstance(data, list) or not data:
        log("lyrics", "No LRCLIB matches")
        return None

    # Prefer entries with synced lyrics; optionally closest duration
    best = None
    best_score = -1
    for item in data:
        synced = item.get("syncedLyrics") or ""
        plain = item.get("plainLyrics") or ""
        if not synced and not plain:
            continue
        score = 2 if synced else 1
        if duration is not None and item.get("duration"):
            try:
                delta = abs(float(item["duration"]) - float(duration))
                score += max(0, 5 - delta)
            except (TypeError, ValueError):
                pass
        if score > best_score:
            best_score = score
            best = item

    if not best:
        return None

    if best.get("syncedLyrics"):
        log("lyrics", "Using synchronized LRC from LRCLIB")
        return best["syncedLyrics"]
    if best.get("plainLyrics"):
        log("lyrics", "Using plain lyrics from LRCLIB")
        return best["plainLyrics"]
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--title", required=True)
    parser.add_argument("--artist", required=True)
    parser.add_argument("--album", default="")
    parser.add_argument("--duration", type=int, default=None)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    text = fetch_lrc(args.title, args.artist, args.album, args.duration)
    if not text:
        log("lyrics", "No lyrics saved")
        return 0

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(text if text.endswith("\n") else text + "\n", encoding="utf-8")
    log("lyrics", f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
