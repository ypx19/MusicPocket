#!/usr/bin/env python3
"""Import authorized audio into the MusicPocket library."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from fetch_lyrics import fetch_lrc
from utils import (
    PUBLIC,
    SONGS_MANIFEST,
    fail,
    find_duplicate,
    load_manifest,
    log,
    stable_song_id,
    validate_https_url,
    write_json,
)


def run(cmd: list[str], stage: str) -> subprocess.CompletedProcess[str]:
    log(stage, " ".join(cmd))
    try:
        completed = subprocess.run(cmd, check=False, capture_output=True, text=True)
    except FileNotFoundError:
        fail(stage, f"Command not found: {cmd[0]}")
    if completed.returncode != 0:
        err = (completed.stderr or completed.stdout or "").strip()
        fail(stage, err or f"{cmd[0]} failed with code {completed.returncode}")
    return completed


def probe_duration(path: Path) -> float | None:
    try:
        completed = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        if completed.returncode == 0 and completed.stdout.strip():
            return float(completed.stdout.strip())
    except (FileNotFoundError, ValueError):
        return None
    return None


def extract_metadata(url: str) -> dict:
    completed = run(
        ["yt-dlp", "--dump-json", "--no-download", "--no-playlist", url],
        "metadata",
    )
    try:
        return json.loads(completed.stdout.splitlines()[0])
    except (json.JSONDecodeError, IndexError):
        fail("metadata", "Unable to parse yt-dlp metadata JSON")


def main() -> int:
    parser = argparse.ArgumentParser(description="Import authorized audio")
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--artist", required=True)
    parser.add_argument("--album", default="")
    parser.add_argument("--license", default="")
    parser.add_argument("--attribution", default="")
    parser.add_argument(
        "--confirm-rights",
        required=True,
        choices=["true", "false"],
        help="Must be true; user affirms rights to download/store",
    )
    args = parser.parse_args()

    log("rights", f"confirm_rights={args.confirm_rights}")
    if args.confirm_rights != "true":
        fail("rights", "Import rejected: rights confirmation is required")

    source_url = validate_https_url(args.source_url)
    title = args.title.strip()
    artist = args.artist.strip()
    if not title or not artist:
        fail("validate", "title and artist are required")

    song_id = stable_song_id(source_url, title, artist)
    log("id", f"song_id={song_id}")

    manifest = load_manifest()
    dup = find_duplicate(manifest, source_url, song_id)
    if dup:
        fail("duplicate", f"Song already imported as id={dup.get('id')}")

    meta = extract_metadata(source_url)
    source_name = str(meta.get("extractor") or meta.get("extractor_key") or "unknown")

    music_dir = PUBLIC / "music"
    covers_dir = PUBLIC / "covers"
    lyrics_dir = PUBLIC / "lyrics"
    music_dir.mkdir(parents=True, exist_ok=True)
    covers_dir.mkdir(parents=True, exist_ok=True)
    lyrics_dir.mkdir(parents=True, exist_ok=True)

    mp3_path = music_dir / f"{song_id}.mp3"
    cover_path = covers_dir / f"{song_id}.jpg"
    lyrics_path = lyrics_dir / f"{song_id}.lrc"

    with tempfile.TemporaryDirectory(prefix="musicpocket-") as tmp:
        tmp_dir = Path(tmp)
        outtmpl = str(tmp_dir / "download.%(ext)s")
        log("download", "Downloading selected media with yt-dlp")
        run(
            [
                "yt-dlp",
                "--no-playlist",
                "-f",
                "bestaudio/best",
                "-o",
                outtmpl,
                "--write-thumbnail",
                "--convert-thumbnails",
                "jpg",
                source_url,
            ],
            "download",
        )

        downloads = list(tmp_dir.glob("download.*"))
        media_files = [p for p in downloads if p.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}]
        if not media_files:
            fail("download", "No media file downloaded")
        media = media_files[0]
        log("download", f"Got {media.name}")

        log("ffmpeg", "Converting to MP3")
        run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(media),
                "-vn",
                "-acodec",
                "libmp3lame",
                "-q:a",
                "2",
                str(tmp_dir / "track.mp3"),
            ],
            "ffmpeg",
        )
        shutil.move(str(tmp_dir / "track.mp3"), str(mp3_path))
        log("ffmpeg", f"Wrote {mp3_path}")

        thumb = next(iter(tmp_dir.glob("download*.jpg")), None)
        if thumb and thumb.exists():
            shutil.copy2(thumb, cover_path)
            log("artwork", f"Saved cover {cover_path}")
        else:
            art = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(media),
                    "-an",
                    "-vcodec",
                    "mjpeg",
                    "-frames:v",
                    "1",
                    str(cover_path),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            if art.returncode != 0 or not cover_path.exists():
                log("artwork", "No cover art available; continuing")
                if cover_path.exists():
                    cover_path.unlink()
            else:
                log("artwork", f"Extracted embedded cover {cover_path}")

    duration = probe_duration(mp3_path)
    duration_int = int(duration) if duration is not None else None

    log("lyrics", "Searching LRCLIB (non-fatal)")
    lyrics_text = fetch_lrc(title, artist, args.album, duration_int)
    lyrics_url = None
    if lyrics_text:
        lyrics_path.write_text(
            lyrics_text if lyrics_text.endswith("\n") else lyrics_text + "\n",
            encoding="utf-8",
        )
        lyrics_url = f"lyrics/{song_id}.lrc"
        log("lyrics", f"Wrote {lyrics_path}")
    else:
        log("lyrics", "No lyrics found; import continues")

    song = {
        "id": song_id,
        "title": title,
        "artist": artist,
        "audioUrl": f"music/{song_id}.mp3",
        "sourceUrl": source_url,
        "sourceName": source_name,
        "importedAt": datetime.now(timezone.utc).isoformat(),
    }
    if args.album:
        song["album"] = args.album
    if duration_int is not None:
        song["duration"] = duration_int
    if cover_path.exists():
        song["coverUrl"] = f"covers/{song_id}.jpg"
    if lyrics_url:
        song["lyricsUrl"] = lyrics_url
    if args.license:
        song["license"] = args.license
    if args.attribution:
        song["attribution"] = args.attribution

    data = load_manifest()
    data["songs"] = [s for s in data["songs"] if s.get("id") != song_id]
    data["songs"].append(song)
    data["songs"].sort(key=lambda s: (s.get("artist", ""), s.get("title", "")))
    data["updatedAt"] = datetime.now(timezone.utc).isoformat()
    data["version"] = int(data.get("version") or 1)
    write_json(SONGS_MANIFEST, data)
    log("manifest", f"Updated {SONGS_MANIFEST}")

    song_meta_path = PUBLIC / "data" / "imports" / f"{song_id}.json"
    write_json(song_meta_path, song)
    log("done", f"Imported {song_id}")
    print(json.dumps(song, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
