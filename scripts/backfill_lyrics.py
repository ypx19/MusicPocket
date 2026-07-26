#!/usr/bin/env python3
"""Backfill missing lyrics for songs already in the manifest."""

from __future__ import annotations

import argparse
from pathlib import Path

from fetch_lyrics import fetch_lrc
from utils import PUBLIC, SONGS_MANIFEST, load_manifest, log, write_json


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--song-id", default="", help="Only backfill this song id")
    args = parser.parse_args()

    manifest = load_manifest()
    changed = 0
    for song in manifest["songs"]:
        if args.song_id and song.get("id") != args.song_id:
            continue
        song_id = song.get("id")
        if not song_id:
            continue
        lyrics_path = PUBLIC / "lyrics" / f"{song_id}.lrc"
        if song.get("lyricsUrl") and lyrics_path.exists():
            log("backfill", f"skip {song_id} (already has lyrics)")
            continue

        title = song.get("title") or ""
        artist = song.get("artist") or ""
        duration = song.get("duration")
        log("backfill", f"searching lyrics for {song_id}: {title!r} / {artist!r}")
        text = fetch_lrc(title, artist, song.get("album") or "", duration)
        if not text:
            log("backfill", f"no lyrics for {song_id}")
            continue

        lyrics_path.parent.mkdir(parents=True, exist_ok=True)
        lyrics_path.write_text(text if text.endswith("\n") else text + "\n", encoding="utf-8")
        song["lyricsUrl"] = f"lyrics/{song_id}.lrc"
        changed += 1
        log("backfill", f"wrote {lyrics_path}")

    if changed:
        write_json(SONGS_MANIFEST, manifest)
        log("backfill", f"updated manifest ({changed} songs)")
    else:
        log("backfill", "no changes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
