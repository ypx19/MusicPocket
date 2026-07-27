#!/usr/bin/env python3
"""Fetch synchronized LRC lyrics (best-effort, never fatal).

Sources tried in order (first synced hit wins; else best plain):
  1. LRCLIB  — track/artist pairs + fuzzy q=
  2. 网易云音乐 NetEase
  3. 酷狗音乐 Kugou
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable

from utils import log

LRCLIB_API = "https://lrclib.net/api/search"
NETEASE_SEARCH = "https://music.163.com/api/search/get"
NETEASE_LYRIC = "https://music.163.com/api/song/lyric"
KUGOU_SEARCH = "http://mobilecdn.kugou.com/api/v3/search/song"
KUGOU_LRC_SEARCH = "https://lyrics.kugou.com/search"
KUGOU_LRC_DOWNLOAD = "https://lyrics.kugou.com/download"

USER_AGENT = "MusicPocket/0.1 (personal library; +https://github.com/)"
NETEASE_HEADERS = {
    "User-Agent": USER_AGENT,
    "Referer": "https://music.163.com/",
    "Host": "music.163.com",
}

NOISE_PATTERNS = [
    re.compile(r"\[(?:official|lyrics?|audio|mv|hd|4k|hq)[^\]]*\]", re.I),
    re.compile(r"\((?:official|lyrics?|audio|mv|hd|4k|hq|music\s*video)[^)]*\)", re.I),
    re.compile(r"【[^】]*】"),
    re.compile(r"\s*[-–—|]\s*(?:official|lyrics?|audio|mv).*$", re.I),
]

LRC_LINE = re.compile(r"\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]")


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

    cleaned_title = normalize_title(title)
    leading = re.match(r"^([\u4e00-\u9fff]{2,6})", title.strip())
    if leading:
        name = leading.group(1)
        # Avoid treating the song title itself as an artist (e.g. 凡人诀 / 奉献).
        if name not in variants and name != cleaned_title and not cleaned_title.startswith(name):
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

    for art in artist_variants(artist, title):
        if cleaned.lower().startswith(art.lower()):
            add(cleaned[len(art) :].lstrip(" -–—|:"))
        add(re.sub(re.escape(art), " ", cleaned, flags=re.I))

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


def keyword_queries(title: str, artist: str) -> list[str]:
    queries: list[str] = []
    for track, art in query_candidates(title, artist):
        for q in (f"{track} {art}", track):
            if q not in queries:
                queries.append(q)
    return queries[:8]


def _http_json(url: str, headers: dict[str, str] | None = None, timeout: int = 30) -> Any:
    req = urllib.request.Request(url, headers=headers or {"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _looks_like_lrc(text: str) -> bool:
    if not text or not text.strip():
        return False
    if "纯音乐" in text and LRC_LINE.search(text) is None:
        return False
    return LRC_LINE.search(text) is not None


def _normalize_lrc(text: str) -> str | None:
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        return None
    # Drop common NetEase instrumental placeholders.
    if re.fullmatch(r"\[00:00(?:\.\d+)?\]\s*纯音乐[，,].*", text, flags=re.S):
        return None
    if not _looks_like_lrc(text) and len(text.splitlines()) < 2:
        return None
    return text if text.endswith("\n") else text + "\n"


def _similarity(a: str, b: str) -> float:
    a_n = _clean_whitespace(a).lower()
    b_n = _clean_whitespace(b).lower()
    if not a_n or not b_n:
        return 0.0
    if a_n == b_n:
        return 1.0
    if a_n in b_n or b_n in a_n:
        return 0.85
    # Character overlap for CJK short titles.
    sa, sb = set(a_n), set(b_n)
    return len(sa & sb) / max(len(sa | sb), 1)


# --- LRCLIB -----------------------------------------------------------------

def _search_lrclib_params(params: dict[str, str]) -> list[dict]:
    query = urllib.parse.urlencode(params)
    url = f"{LRCLIB_API}?{query}"
    log("lyrics", f"LRCLIB GET {url}")
    try:
        data = _http_json(url, headers={"User-Agent": USER_AGENT})
    except urllib.error.HTTPError as err:
        log("lyrics", f"LRCLIB HTTP {err.code}")
        return []
    except Exception as err:  # noqa: BLE001
        log("lyrics", f"LRCLIB failed ({err})")
        return []
    return data if isinstance(data, list) else []


def _pick_lrclib(
    results: list[dict],
    duration: int | None,
    want_title: str = "",
    want_artist: str = "",
) -> tuple[str | None, bool]:
    best_text: str | None = None
    best_synced = False
    best_score = -1.0
    for item in results:
        synced = item.get("syncedLyrics") or ""
        plain = item.get("plainLyrics") or ""
        text = synced or plain
        if not text:
            continue
        track = str(item.get("trackName") or item.get("name") or "")
        art = str(item.get("artistName") or "")
        title_score = _similarity(want_title, track) if want_title else 0.6
        artist_score = _similarity(want_artist, art) if want_artist else 0.0
        # Reject unrelated fuzzy hits (e.g. 奉献 → 亚洲雄风).
        if want_title and title_score < 0.55:
            continue
        synced_flag = bool(synced)
        score = (10.0 if synced_flag else 3.0) + 4.0 * title_score + 2.0 * artist_score
        if duration is not None and item.get("duration"):
            try:
                delta = abs(float(item["duration"]) - float(duration))
                score += max(0.0, 8.0 - delta)
            except (TypeError, ValueError):
                pass
        if score > best_score:
            best_score = score
            best_text = text
            best_synced = synced_flag
    if best_text:
        return _normalize_lrc(best_text), best_synced
    return None, False


def fetch_from_lrclib(title: str, artist: str, album: str, duration: int | None) -> tuple[str | None, bool]:
    best_plain: str | None = None
    for track_name, artist_name in query_candidates(title, artist):
        params = {"track_name": track_name, "artist_name": artist_name}
        if album:
            params["album_name"] = album
        text, synced = _pick_lrclib(_search_lrclib_params(params), duration, track_name, artist_name)
        if text and synced:
            log("lyrics", f"LRCLIB synced match {track_name!r}/{artist_name!r}")
            return text, True
        if text and best_plain is None:
            best_plain = text
            log("lyrics", f"LRCLIB plain match {track_name!r}/{artist_name!r}")

    for q in keyword_queries(title, artist)[:4]:
        text, synced = _pick_lrclib(_search_lrclib_params({"q": q}), duration, title, artist)
        if text and synced:
            log("lyrics", f"LRCLIB fuzzy synced q={q!r}")
            return text, True
        if text and best_plain is None:
            best_plain = text
            log("lyrics", f"LRCLIB fuzzy plain q={q!r}")

    return best_plain, False


# --- NetEase ----------------------------------------------------------------

def _netease_search(keyword: str, limit: int = 8) -> list[dict]:
    params = urllib.parse.urlencode({"s": keyword, "type": 1, "limit": limit, "offset": 0, "total": "true"})
    url = f"{NETEASE_SEARCH}?{params}"
    log("lyrics", f"NetEase search {keyword!r}")
    try:
        data = _http_json(url, headers=NETEASE_HEADERS)
    except Exception as err:  # noqa: BLE001
        log("lyrics", f"NetEase search failed ({err})")
        return []
    songs = (((data or {}).get("result") or {}).get("songs")) or []
    return songs if isinstance(songs, list) else []


def _netease_lyric(song_id: int | str) -> str | None:
    params = urllib.parse.urlencode({"id": str(song_id), "lv": -1, "tv": -1, "kv": -1, "os": "pc"})
    url = f"{NETEASE_LYRIC}?{params}"
    try:
        data = _http_json(url, headers=NETEASE_HEADERS)
    except Exception as err:  # noqa: BLE001
        log("lyrics", f"NetEase lyric failed ({err})")
        return None
    lrc = ((data or {}).get("lrc") or {}).get("lyric") or ""
    return _normalize_lrc(lrc)


def fetch_from_netease(title: str, artist: str, duration: int | None) -> tuple[str | None, bool]:
    best: tuple[float, str] | None = None
    for keyword in keyword_queries(title, artist):
        songs = _netease_search(keyword)
        for song in songs[:8]:
            if not isinstance(song, dict):
                continue
            song_title = str(song.get("name") or "")
            artists = song.get("artists") or song.get("ar") or []
            if isinstance(artists, list):
                artist_names = " ".join(
                    str(a.get("name") or "") for a in artists if isinstance(a, dict)
                )
            else:
                artist_names = str(artists)
            blob = f"{song_title} {artist_names}"
            score = 4.0 * _similarity(title, song_title) + 3.0 * max(
                _similarity(artist, artist_names),
                _similarity(artist, blob),
            )
            if artist and artist in song_title:
                score += 2.0
            dur_ms = song.get("duration") if song.get("duration") is not None else song.get("dt")
            if duration is not None and dur_ms is not None:
                try:
                    delta = abs(float(dur_ms) / 1000.0 - float(duration))
                    score += max(0.0, 6.0 - delta / 2.0)
                except (TypeError, ValueError):
                    pass
            if score < 3.5:
                continue
            text = _netease_lyric(song.get("id"))
            if not text:
                continue
            synced = _looks_like_lrc(text)
            total = score + (5.0 if synced else 0.0)
            if best is None or total > best[0]:
                best = (total, text)
                log(
                    "lyrics",
                    f"NetEase candidate id={song.get('id')} {song_title!r}/{artist_names!r} score={total:.1f}",
                )
                if synced and score >= 5.5:
                    return text, True
    if best:
        return best[1], _looks_like_lrc(best[1])
    return None, False


# --- Kugou ------------------------------------------------------------------

def _kugou_search(keyword: str, limit: int = 8) -> list[dict]:
    params = urllib.parse.urlencode(
        {"format": "json", "keyword": keyword, "page": 1, "pagesize": limit, "showtype": 1},
    )
    url = f"{KUGOU_SEARCH}?{params}"
    log("lyrics", f"Kugou search {keyword!r}")
    try:
        data = _http_json(url, headers={"User-Agent": USER_AGENT})
    except Exception as err:  # noqa: BLE001
        log("lyrics", f"Kugou search failed ({err})")
        return []
    info = (((data or {}).get("data") or {}).get("info")) or []
    return info if isinstance(info, list) else []


def _kugou_download_lrc(keyword: str, duration_ms: int | None, file_hash: str) -> str | None:
    params: dict[str, str] = {
        "ver": "1",
        "man": "yes",
        "client": "mobi",
        "keyword": keyword,
        "hash": file_hash,
    }
    if duration_ms is not None:
        params["duration"] = str(int(duration_ms))
    url = f"{KUGOU_LRC_SEARCH}?{urllib.parse.urlencode(params)}"
    try:
        data = _http_json(url, headers={"User-Agent": USER_AGENT})
    except Exception as err:  # noqa: BLE001
        log("lyrics", f"Kugou lrc search failed ({err})")
        return None
    candidates = (data or {}).get("candidates") or []
    if not candidates:
        return None
    cand = candidates[0]
    dl_params = urllib.parse.urlencode(
        {
            "ver": "1",
            "client": "pc",
            "id": str(cand.get("id") or ""),
            "accesskey": str(cand.get("accesskey") or ""),
            "fmt": "lrc",
            "charset": "utf8",
        },
    )
    try:
        payload = _http_json(f"{KUGOU_LRC_DOWNLOAD}?{dl_params}", headers={"User-Agent": USER_AGENT})
    except Exception as err:  # noqa: BLE001
        log("lyrics", f"Kugou lrc download failed ({err})")
        return None
    content = (payload or {}).get("content") or ""
    if not content:
        return None
    try:
        decoded = base64.b64decode(content).decode("utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        decoded = content
    return _normalize_lrc(decoded)


def fetch_from_kugou(title: str, artist: str, duration: int | None) -> tuple[str | None, bool]:
    best: tuple[float, str] | None = None
    for keyword in keyword_queries(title, artist):
        songs = _kugou_search(keyword)
        for song in songs[:6]:
            song_title = str(song.get("songname") or song.get("SongName") or song.get("song_name") or "")
            artist_names = str(
                song.get("singername") or song.get("SingerName") or song.get("author_name") or "",
            )
            file_hash = str(
                song.get("hash")
                or song.get("FileHash")
                or song.get("hqhash")
                or song.get("HQFileHash")
                or song.get("sqhash")
                or "",
            )
            if not file_hash:
                continue
            score = 4.0 * _similarity(title, song_title) + 3.0 * _similarity(artist, artist_names)
            duration_ms = None
            if song.get("duration") is not None:
                try:
                    # Kugou duration often seconds
                    dur = float(song["duration"])
                    duration_ms = int(dur * 1000 if dur < 10000 else dur)
                    if duration is not None:
                        delta = abs(duration_ms / 1000.0 - float(duration))
                        score += max(0.0, 6.0 - delta / 2.0)
                except (TypeError, ValueError):
                    duration_ms = None
            elif duration is not None:
                duration_ms = int(float(duration) * 1000)
            if score < 3.5:
                continue
            text = _kugou_download_lrc(f"{song_title} - {artist_names}", duration_ms, file_hash)
            if not text:
                continue
            synced = _looks_like_lrc(text)
            total = score + (5.0 if synced else 0.0)
            if best is None or total > best[0]:
                best = (total, text)
                log("lyrics", f"Kugou candidate {song_title!r}/{artist_names!r} score={total:.1f}")
                if synced and score >= 5.5:
                    return text, True
    if best:
        return best[1], _looks_like_lrc(best[1])
    return None, False


Provider = Callable[[str, str, str, int | None], tuple[str | None, bool]]


def fetch_lrc(title: str, artist: str, album: str = "", duration: int | None = None) -> str | None:
    providers: list[tuple[str, Callable[[], tuple[str | None, bool]]]] = [
        ("LRCLIB", lambda: fetch_from_lrclib(title, artist, album, duration)),
        ("NetEase", lambda: fetch_from_netease(title, artist, duration)),
        ("Kugou", lambda: fetch_from_kugou(title, artist, duration)),
    ]

    best_plain: str | None = None
    for name, runner in providers:
        try:
            text, synced = runner()
        except Exception as err:  # noqa: BLE001 — lyrics are optional
            log("lyrics", f"{name} provider error ({err})")
            continue
        if text and synced:
            log("lyrics", f"Using synchronized LRC from {name}")
            return text
        if text and best_plain is None:
            best_plain = text
            log("lyrics", f"Keeping plain/unsynced candidate from {name}")

    if best_plain:
        log("lyrics", "Using best non-synced lyrics")
        return best_plain

    log("lyrics", "No lyrics from LRCLIB / NetEase / Kugou")
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
