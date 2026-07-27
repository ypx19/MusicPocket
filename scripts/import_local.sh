#!/usr/bin/env bash
# Local import using your browser cookies (most reliable).
#
# Usage:
#   scripts/import_local.sh [--push] <source_url> <title> <artist> [album]
#
# Examples:
#   scripts/import_local.sh "https://www.youtube.com/watch?v=..." "Title" "Artist"
#   scripts/import_local.sh --push "https://..." "葡萄成熟时" "陈奕迅"
#
# Env:
#   YTDLP_COOKIES_FROM_BROWSER=chrome|safari|firefox|edge   (default: chrome)
#   IMPORT_PUSH=1                                           (same as --push)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DO_PUSH=0
if [[ "${IMPORT_PUSH:-}" == "1" || "${IMPORT_PUSH:-}" == "true" ]]; then
  DO_PUSH=1
fi

ARGS=()
for arg in "$@"; do
  case "$arg" in
    --push|-p) DO_PUSH=1 ;;
    -h|--help)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) ARGS+=("$arg") ;;
  esac
done

SOURCE_URL="${ARGS[0]:-}"
TITLE="${ARGS[1]:-}"
ARTIST="${ARGS[2]:-}"
ALBUM="${ARGS[3]:-}"
BROWSER="${YTDLP_COOKIES_FROM_BROWSER:-chrome}"

if [[ -z "$SOURCE_URL" || -z "$TITLE" || -z "$ARTIST" ]]; then
  echo "Usage: $0 [--push] <source_url> <title> <artist> [album]" >&2
  echo "Optional env: YTDLP_COOKIES_FROM_BROWSER=chrome|safari|firefox|edge" >&2
  echo "              IMPORT_PUSH=1" >&2
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

commit_message() {
  # Keep commit subject short and shell-safe.
  local safe_title
  safe_title="$(printf '%s' "$TITLE" | tr '\n\r' '  ' | cut -c1-80)"
  printf 'feat: import %s' "$safe_title"
}

publish_public() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "[git] Not a git repository; skip commit/push" >&2
    return 1
  fi

  git add public

  if ! git diff --cached --quiet; then
    git commit -m "$(commit_message)"
  else
    echo "[git] No new files under public/ to commit"
  fi

  local branch remote upstream_remote upstream_branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  if upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"; then
    upstream_remote="${upstream%%/*}"
    upstream_branch="${upstream#*/}"
  else
    upstream_remote="origin"
    upstream_branch="$branch"
  fi

  echo "[git] Integrating ${upstream_remote}/${upstream_branch} (pull --rebase)..."
  if ! git pull --rebase "$upstream_remote" "$upstream_branch"; then
    echo "[git] ERROR: rebase failed. Resolve conflicts, then:" >&2
    echo "  git add -A && git rebase --continue && git push" >&2
    echo "Or abort with: git rebase --abort" >&2
    return 1
  fi

  local ahead
  ahead="$(git rev-list --count "${upstream_remote}/${upstream_branch}..HEAD" 2>/dev/null || echo 1)"
  if [[ "$ahead" == "0" ]]; then
    echo "[git] Nothing to push (already synced)."
    return 0
  fi

  echo "[git] Pushing ${ahead} commit(s) to ${upstream_remote}/${upstream_branch}..."
  if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    git push
  else
    git push -u "$upstream_remote" "$branch"
  fi

  echo "[git] Done. Pages deploy should start from this push."
}

echo
if [[ "$DO_PUSH" -eq 1 ]]; then
  publish_public
else
  echo "Import finished. To commit + rebase + push in one step, re-run with --push, or:"
  echo "  git add public && git commit -m '$(commit_message)' && git pull --rebase && git push"
fi
