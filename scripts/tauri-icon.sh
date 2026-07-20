#!/usr/bin/env bash
# Regenerate desktop + web icons from the master square PNG.
#
# Usage:
#   yarn tauri:icon
#   yarn tauri:icon path/to/other.png
#
# Default source: assets/SubspaceLattice-1-1.png
# Writes:
#   apps/desktop/src-tauri/icons/*   (via `tauri icon`)
#   apps/web/public/favicon.png
#   apps/web/public/apple-touch-icon.png

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP_DIR="${ROOT}/apps/desktop"
SOURCE_ICON="${1:-${ROOT}/assets/SubspaceLattice-1-1.png}"
TAURI_BIN="${ROOT}/node_modules/.bin/tauri"
WEB_PUBLIC="${ROOT}/apps/web/public"

die() {
  echo "error: $*" >&2
  exit 1
}

[ -f "$SOURCE_ICON" ] || die "missing source icon: ${SOURCE_ICON}"
[ -x "$TAURI_BIN" ] || die "missing tauri CLI at ${TAURI_BIN} — run yarn install"
[ -d "$DESKTOP_DIR" ] || die "missing desktop app: ${DESKTOP_DIR}"

mkdir -p "$WEB_PUBLIC"
cp "$SOURCE_ICON" "${WEB_PUBLIC}/favicon.png"
cp "$SOURCE_ICON" "${WEB_PUBLIC}/apple-touch-icon.png"

(cd "$DESKTOP_DIR" && "$TAURI_BIN" icon "$SOURCE_ICON" -o src-tauri/icons)

echo "Synced Tauri icons → ${DESKTOP_DIR}/src-tauri/icons"
echo "Synced web favicons → ${WEB_PUBLIC}/favicon.png (+ apple-touch-icon.png)"
echo "Source: ${SOURCE_ICON}"
