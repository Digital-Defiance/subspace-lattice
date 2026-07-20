#!/usr/bin/env bash
# Regenerate iOS AppIcon assets from the master square PNG.
#
# Current @tauri-apps/cli writes iOS PNGs directly into
#   apps/desktop/src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset/
# The legacy src-tauri/icons/ios/ tree is NOT updated and must not be copied
# over the asset catalog (that reverts to a stale icon).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP_DIR="${ROOT}/apps/desktop"
DEST="${DESKTOP_DIR}/src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset"
SOURCE_ICON="${ROOT}/assets/SubspaceLattice-1-1.png"
TAURI_BIN="${ROOT}/node_modules/.bin/tauri"
LEGACY_IOS_ICONS="${DESKTOP_DIR}/src-tauri/icons/ios"

die() {
  echo "error: $*" >&2
  exit 1
}

[ -d "$DEST" ] || die "missing Xcode asset catalog: ${DEST} (run: yarn tauri ios init from apps/desktop)"
[ -f "$SOURCE_ICON" ] || die "missing source icon: ${SOURCE_ICON}"
[ -x "$TAURI_BIN" ] || die "missing tauri CLI at ${TAURI_BIN}"

bash "${ROOT}/scripts/tauri-icon.sh" "$SOURCE_ICON"

[ -f "${DEST}/AppIcon-512@2x.png" ] || die "tauri icon did not write ${DEST}/AppIcon-512@2x.png"

# Keep icons/ios in sync for docs/tools that still look there — never the reverse.
if [ -d "$LEGACY_IOS_ICONS" ]; then
  cp "${DEST}"/*.png "${LEGACY_IOS_ICONS}/"
fi

echo "Synced iOS app icons → ${DEST}"
echo "Source: ${SOURCE_ICON}"
