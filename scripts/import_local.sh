#!/usr/bin/env bash
# Local import using your browser cookies (most reliable).
# Usage:
#   scripts/import_local.sh "https://www.youtube.com/watch?v=..." "Title" "Artist"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SOURCE_URL="${1:-}"
TITLE="${2:-}"
ARTIST="${3:-}"
ALBUM="${4:-}"
BROWSER="${YTDLP_COOKIES_FROM_BROWSER:-chrome}"

if [[ -z "$SOURCE_URL" || -z "$TITLE" || -z "$ARTIST" ]]; then
  echo "Usage: $0 <source_url> <title> <artist> [album]" >&2
  echo "Optional env: YTDLP_COOKIES_FROM_BROWSER=chrome|safari|firefox|edge" >&2
  exit 1
fi

if ! command -v yt-dlp >/dev/null 2>&1; then
  python3 -m pip install -U -r scripts/requirements.txt
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required (brew install ffmpeg)" >&2
  exit 1
fi

export YTDLP_COOKIES_FROM_BROWSER="$BROWSER"

python3 scripts/import_audio.py \
  --source-url "$SOURCE_URL" \
  --title "$TITLE" \
  --artist "$ARTIST" \
  --album "$ALBUM" \
  --confirm-rights true

echo
echo "Import finished. Commit and push when ready:"
echo "  git add public && git commit -m 'feat: import authorized audio' && git push"
