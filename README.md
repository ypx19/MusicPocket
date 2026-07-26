# MusicPocket

Personal self-hosted music library and web player.

## What this is

MusicPocket is a **personal audio-library tool**. You search for authorized sources, review candidates, import media you own or have permission to store, and play it from a PWA-friendly web UI with synchronized lyrics.

## Legal notice

- **You** are responsible for verifying that you own the content or have permission to download and store it.
- A publicly available URL does **not** automatically grant download or redistribution rights.
- Do **not** use this project to bypass DRM, paywalls, subscriptions, login controls, region locks, or other access restrictions.
- This project is **not** a tool for downloading arbitrary copyrighted music or avoiding licensed streaming services.

Import workflows require an explicit rights confirmation checkbox.

## Stack

- React + TypeScript + Vite
- GitHub Pages (frontend)
- GitHub Actions (search + import + deploy)
- yt-dlp (search / authorized extraction)
- FFmpeg (MP3 conversion)
- LRCLIB (optional synchronized lyrics)
- Static `public/data/songs.json` manifest
- PWA + HTMLAudioElement + Media Session API

## Local development

```bash
npm install
npm run dev
```

Optional env vars:

- `VITE_BASE` — asset base path (default in build workflow: `/<repo>/`)
- `VITE_GITHUB_REPO` — `owner/name` for Actions deep links in the Import tab

```bash
npm run lint
npm run build
```

## Deploy

1. Push to `main` (or `master`).
2. Enable **GitHub Pages** → Source: **GitHub Actions**.
3. Ensure Actions has permission to write contents (Settings → Actions → General → Workflow permissions).

The `Deploy GitHub Pages` workflow builds with `VITE_BASE=/<repo-name>/`.

## Import flow (MVP)

### One-time browser setup

On the **Import** tab, open **GitHub setup** and save:

1. Repository as `owner/name`
2. Branch (`main`)
3. A fine-grained PAT with **Actions: Read and write** (and Contents read)

The token is stored only in **this browser’s localStorage**. It is never committed and is not part of the frontend bundle.

### Search from the site

1. Enter a keyword in the search box
2. Press **Search**
3. The page calls the GitHub API to start **Search Authorized Audio**
4. When the workflow finishes and commits `public/data/search/latest.json`, candidates appear automatically

You do **not** need to open the Actions UI for normal search/import. Optional “View workflow” / “open run” links are only for debugging.

### Import from a candidate

1. Choose **Select and import**
2. Confirm rights, edit title/artist if needed
3. Press **Import now** — the page starts **Import Authorized Audio** and waits for completion

### YouTube bot-checks (required for most Action imports)

GitHub-hosted runners are often blocked by YouTube (“Sign in to confirm you’re not a bot”).

**Preferred secret format (base64)** — plain text secrets often break TAB characters in `cookies.txt`:

```bash
# macOS — after exporting Netscape cookies.txt for youtube.com
base64 -i cookies.txt | pbcopy
```

1. Repo **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `YTDLP_COOKIES_B64`
3. Paste the base64 value → Save
4. You can delete the old `YTDLP_COOKIES` secret

Re-export cookies while logged into youtube.com if they are stale.

### Local import (most reliable)

If Actions still fails (common — datacenter IPs get blocked), import on your Mac:

```bash
chmod +x scripts/import_local.sh
# Chrome by default; or: YTDLP_COOKIES_FROM_BROWSER=safari
scripts/import_local.sh "https://www.youtube.com/watch?v=VIDEO_ID" "可以了" "陈奕迅"
git add public && git commit -m "feat: import authorized audio" && git push
```

### Manual Actions UI (fallback)

You can still run the workflows from the Actions tab if you prefer.

## Library layout

```
public/
  music/<song-id>.mp3
  covers/<song-id>.jpg
  lyrics/<song-id>.lrc
  data/songs.json
  data/search/latest.json
```

## Background / lock-screen playback

The app uses a single persistent `HTMLAudioElement`, the Media Session API, and PWA install metadata. This is the best standards-based behavior for iOS Safari / home-screen PWAs; it is **not** guaranteed to match a native app in every iOS version.

## Sample tracks

The repo ships two short synthetic FFmpeg sine tones (CC0 demo assets) so Phase 1 playback works offline before any import.
