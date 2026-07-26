#!/usr/bin/env python3
"""Fetch synchronized LRC lyrics from LRCLIB (best-effort, never fatal)."""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from utils import log

LRCLIB_API = "https://lrclib.net/api/search"

NOISE_PATTERNS = [
    re.compile(r"\[(?:official|lyrics?|audio|mv|hd|4k|hq)[^\]]*\]", re.I),
    re.compile(r"\((?:official|lyrics?|audio|mv|hd|4k|hq|music\s*video)[^)]*\)", re.I),
    re.compile(r"【[^】]*】"),
    re.compile(r"\s*[-–—|]\s*(?:official|lyrics?|audio|mv).*$", re.I),
]


def _clean_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" -\t\n\r\"'")


def normalize_title(title: str) -> str:
    value = title
    for pattern in NOISE_PATTERNS:
        value = pattern.sub(" ", value)
    value = value.replace("《", " ").replace("》", " ")
    value = value.replace("「", " ").replace("」", " ")
    value = value.replace("『", " ").replace("』", " ")
    return _clean_whitespace(value)


def extract_quoted_titles(title: str) -> list[str]:
    found: list[str] = []
    for pattern in (r"《([^》]+)》", r"「([^」]+)」", r"『([^』]+)』", r'"([^"]+)"', r"'([^']+)'"):
        found.extend(m.strip() for m in re.findall(pattern, title) if m.strip())
    return found


def artist_variants(artist: str, title: str) -> list[str]:
    variants: list[str] = []
    for raw in (artist, *[p.strip() for p in re.split(r"[,/|&]| featuring | feat\.| ft\.", artist, flags=re.I)]):
        cleaned = _clean_whitespace(raw)
        if cleaned and cleaned not in variants:
            variants.append(cleaned)

    # Titles like "陳奕迅 Eason Chan 《可以了》…" often include the artist.
    # Pull leading CJK name tokens as extra artist candidates.
    leading = re.match(r"^([\u4e00-\u9fff]{2,6})", title.strip())
    if leading:
        name = leading.group(1)
        if name not in variants:
            variants.append(name)

    latin = re.search(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b", title)
    if latin:
        name = latin.group(1)
        if name not in variants:
            variants.append(name)

    return variants or [artist]


def title_variants(title: str, artist: str) -> list[str]:
    variants: list[str] = []

    def add(value: str) -> None:
        cleaned = _clean_whitespace(value)
        if cleaned and cleaned not in variants and cleaned.lower() != artist.lower():
            variants.append(cleaned)

    for quoted in extract_quoted_titles(title):
        add(quoted)

    cleaned = normalize_title(title)
    add(cleaned)

    # Drop leading artist prefixes: "Artist - Title" / "Artist Title"
    for art in artist_variants(artist, title):
        if cleaned.lower().startswith(art.lower()):
            add(cleaned[len(art) :].lstrip(" -–—|:"))
        add(re.sub(re.escape(art), " ", cleaned, flags=re.I))

    # If both CJK and Latin remain, try each chunk separately.
    cjk = _clean_whitespace("".join(re.findall(r"[\u4e00-\u9fff]+", cleaned)))
    if cjk:
        add(cjk)
    latin_chunks = re.findall(r"[A-Za-z][A-Za-z'’ ]{1,40}", cleaned)
    for chunk in latin_chunks:
        add(chunk)

    add(title)
    return variants


def query_candidates(title: str, artist: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for track in title_variants(title, artist):
        for art in artist_variants(artist, title):
            pair = (track, art)
            if pair not in pairs:
                pairs.append(pair)
    return pairs[:12]


def _search_lrclib(track_name: str, artist_name: str, album: str = "") -> list[dict]:
    params = {"track_name": track_name, "artist_name": artist_name}
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
        log("lyrics", f"HTTP {err.code} for {track_name!r}/{artist_name!r}")
        return []
    except Exception as err:  # noqa: BLE001 — lyrics are optional
        log("lyrics", f"Request failed ({err})")
        return []

    return data if isinstance(data, list) else []


def _pick_best(results: list[dict], duration: int | None) -> dict | None:
    best = None
    best_score = -1.0
    for item in results:
        synced = item.get("syncedLyrics") or ""
        plain = item.get("plainLyrics") or ""
        if not synced and not plain:
            continue
        score = 10.0 if synced else 3.0
        if duration is not None and item.get("duration"):
            try:
                delta = abs(float(item["duration"]) - float(duration))
                score += max(0.0, 8.0 - delta)
            except (TypeError, ValueError):
                pass
        if score > best_score:
            best_score = score
            best = item
    return best


def fetch_lrc(title: str, artist: str, album: str = "", duration: int | None = None) -> str | None:
    best = None
    for track_name, artist_name in query_candidates(title, artist):
        results = _search_lrclib(track_name, artist_name, album)
        if not results:
            continue
        candidate = _pick_best(results, duration)
        if not candidate:
            continue
        # Prefer any synced hit immediately when duration is close or unknown.
        if candidate.get("syncedLyrics"):
            best = candidate
            log("lyrics", f"Matched {track_name!r} / {artist_name!r}")
            break
        if best is None:
            best = candidate
            log("lyrics", f"Plain match {track_name!r} / {artist_name!r}")

    if not best:
        log("lyrics", "No LRCLIB matches")
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
