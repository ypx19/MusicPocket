#!/usr/bin/env python3
"""Fuzzy authorized-audio search via yt-dlp (no download)."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from utils import SEARCH_LATEST, fail, log, write_json


def run_search(query: str, max_results: int) -> list[dict]:
    # ytsearchN:query — flat playlist dump, no media download
    target = f"ytsearch{max_results}:{query}"
    cmd = [
        "yt-dlp",
        target,
        "--flat-playlist",
        "--dump-json",
        "--no-download",
        "--no-warnings",
    ]
    log("search", f"Running: yt-dlp ytsearch{max_results}:<query> --flat-playlist --dump-json")
    try:
        completed = subprocess.run(
            cmd,
            check=False,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        fail("search", "yt-dlp is not installed")

    if completed.returncode != 0 and not completed.stdout.strip():
        fail("search", f"yt-dlp failed: {completed.stderr.strip() or 'unknown error'}")

    candidates: list[dict] = []
    for line in completed.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            log("search", "Skipping unparseable JSON line")
            continue
        candidates.append(normalize_candidate(item))

    return candidates


def normalize_candidate(item: dict) -> dict:
    video_id = str(item.get("id") or item.get("url") or "")
    webpage = (
        item.get("webpage_url")
        or item.get("url")
        or (f"https://www.youtube.com/watch?v={video_id}" if video_id else "")
    )
    thumb = None
    if item.get("thumbnail"):
        thumb = item["thumbnail"]
    elif item.get("thumbnails"):
        thumbs = item["thumbnails"]
        if isinstance(thumbs, list) and thumbs:
            thumb = thumbs[-1].get("url")

    source = item.get("extractor") or item.get("ie_key") or "unknown"
    duration = item.get("duration")
    if duration is not None:
        try:
            duration = int(float(duration))
        except (TypeError, ValueError):
            duration = None

    return {
        "id": video_id or webpage,
        "title": item.get("title") or "Untitled",
        "uploader": item.get("uploader") or item.get("channel") or None,
        "duration": duration,
        "thumbnail": thumb,
        "webpageUrl": webpage,
        "source": str(source),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Search authorized audio candidates")
    parser.add_argument("--query", required=True)
    parser.add_argument("--max-results", type=int, default=8)
    parser.add_argument("--output", type=Path, default=SEARCH_LATEST)
    args = parser.parse_args()

    query = args.query.strip()
    if not query:
        fail("search", "query must not be empty")
    if args.max_results < 1 or args.max_results > 25:
        fail("search", "max_results must be between 1 and 25")

    log("search", f"Query={query!r} max_results={args.max_results}")
    candidates = run_search(query, args.max_results)
    payload = {
        "query": query,
        "searchedAt": datetime.now(timezone.utc).isoformat(),
        "maxResults": args.max_results,
        "candidates": candidates,
    }
    if not candidates:
        payload["error"] = "No search results"
        log("search", "No results")
    else:
        log("search", f"Found {len(candidates)} candidates")

    write_json(args.output, payload)
    log("search", f"Wrote {args.output}")
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
