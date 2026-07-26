"""Shared helpers for MusicPocket import/search scripts."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

SAFE_ID_RE = re.compile(r"[^a-zA-Z0-9_-]+")
REPO_ROOT = Path(__file__).resolve().parents[1]
PUBLIC = REPO_ROOT / "public"
SONGS_MANIFEST = PUBLIC / "data" / "songs.json"
SEARCH_LATEST = PUBLIC / "data" / "search" / "latest.json"


def log(stage: str, message: str) -> None:
    print(f"[{stage}] {message}", flush=True)


def fail(stage: str, message: str, code: int = 1) -> None:
    print(f"[{stage}] ERROR: {message}", file=sys.stderr, flush=True)
    raise SystemExit(code)


def sanitize_filename(value: str, fallback: str = "track") -> str:
    cleaned = SAFE_ID_RE.sub("-", value.strip()).strip("-_").lower()
    return cleaned[:80] or fallback


def stable_song_id(source_url: str, title: str, artist: str) -> str:
    digest = hashlib.sha1(f"{source_url}|{title}|{artist}".encode("utf-8")).hexdigest()[:10]
    base = sanitize_filename(f"{artist}-{title}")[:40]
    return f"{base}-{digest}"


def validate_https_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme != "https":
        fail("validate", "Source URL must use https://")
    if not parsed.netloc:
        fail("validate", "Source URL is missing a host")
    # Block obvious shell metacharacters by requiring a clean URL
    if any(ch in url for ch in (";", "|", "`", "$(", "\n", "\r")):
        fail("validate", "Source URL contains disallowed characters")
    return url.strip()


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def load_manifest() -> dict[str, Any]:
    data = load_json(
        SONGS_MANIFEST,
        {"version": 1, "updatedAt": "", "songs": []},
    )
    if "songs" not in data or not isinstance(data["songs"], list):
        fail("manifest", "songs.json is invalid")
    return data


def find_duplicate(manifest: dict[str, Any], source_url: str, song_id: str) -> dict[str, Any] | None:
    for song in manifest["songs"]:
        if song.get("id") == song_id or song.get("sourceUrl") == source_url:
            return song
    return None
