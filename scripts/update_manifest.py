#!/usr/bin/env python3
"""Update public/data/songs.json with a song entry."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone

from utils import fail, load_manifest, log, write_json, SONGS_MANIFEST


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--song-json", required=True, help="Path to a JSON file with one Song object")
    args = parser.parse_args()

    with open(args.song_json, encoding="utf-8") as fh:
        song = json.load(fh)

    required = ["id", "title", "artist", "audioUrl", "sourceUrl", "importedAt"]
    missing = [k for k in required if not song.get(k)]
    if missing:
        fail("manifest", f"Song missing fields: {', '.join(missing)}")

    manifest = load_manifest()
    songs = [s for s in manifest["songs"] if s.get("id") != song["id"] and s.get("sourceUrl") != song["sourceUrl"]]
    songs.append(song)
    songs.sort(key=lambda s: (s.get("artist", ""), s.get("title", "")))

    manifest["songs"] = songs
    manifest["version"] = int(manifest.get("version") or 1)
    manifest["updatedAt"] = datetime.now(timezone.utc).isoformat()
    write_json(SONGS_MANIFEST, manifest)
    log("manifest", f"Updated {SONGS_MANIFEST} ({len(songs)} songs)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
