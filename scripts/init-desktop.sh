#!/usr/bin/env bash
# First-time (and re-runnable) desktop / mobile Tauri scaffold for Subspace Lattice.
#
# What this does:
#   1. yarn install (if needed)
#   2. yarn tauri:icon + ensure:tauri-cli-links
#   3. `tauri ios init`     if gen/apple is missing
#   4. `tauri android init` if gen/android is missing
#   5. Sync platform icons when gen/ trees exist
#
# Usage:
#   yarn init:desktop
#   yarn init:desktop --ios-only
#   yarn init:desktop --android-only
#   yarn init:desktop --skip-install

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/lib/lattice-env.sh
. "${ROOT}/scripts/lib/lattice-env.sh"
lattice_env_load desktop
lattice_env_cd_root

DESKTOP_DIR="$(lattice_env_desktop_dir)"
TAURI_DIR="$(lattice_env_tauri_dir)"
TAURI_BIN="${ROOT}/node_modules/.bin/tauri"
DO_IOS=1
DO_ANDROID=1
SKIP_INSTALL=0

die() {
  echo "error: $*" >&2
  exit 1
}

usage() {
  cat >&2 <<'EOF'
Usage: bash scripts/init-desktop.sh [OPTIONS]

  --ios-only       Only ensure iOS scaffold
  --android-only   Only ensure Android scaffold
  --skip-install   Skip yarn install
  --help           Show this help

After init:
  yarn tauri:dev              # desktop
  yarn tauri:ios:dev          # simulator / device (needs Xcode)
  yarn tauri:android:dev      # emulator / device (needs Android Studio)
  yarn build:mac              # universal macOS
  yarn build:android          # Play Store AAB (needs keystore)
  yarn build:ios-appstore     # signed IPA (needs certs)
EOF
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --ios-only) DO_ANDROID=0; shift ;;
    --android-only) DO_IOS=0; shift ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    -h|--help) usage ;;
    *) die "unknown arg: $1" ;;
  esac
done

[ -d "$DESKTOP_DIR" ] || die "missing ${DESKTOP_DIR}"
[ -f "${TAURI_DIR}/tauri.conf.json" ] || die "missing tauri.conf.json"

if [ "$SKIP_INSTALL" != 1 ]; then
  echo "→ yarn install"
  yarn install --immutable 2>/dev/null || yarn install
fi

[ -x "$TAURI_BIN" ] || die "tauri CLI missing — yarn install failed?"

echo "→ icons + CLI links"
bash "${ROOT}/scripts/tauri-icon.sh"
bash "${ROOT}/scripts/ensure-tauri-cli-links.sh"

cd "$DESKTOP_DIR"

if [ "$DO_IOS" = 1 ]; then
  APPLE_GEN="${TAURI_DIR}/gen/apple"
  APPICONS="${APPLE_GEN}/Assets.xcassets/AppIcon.appiconset"
  if [ -d "$APPICONS" ]; then
    echo "✓ iOS already initialized (${APPLE_GEN})"
  else
    if [ -d "$APPLE_GEN" ] && [ ! -d "${APPLE_GEN}/Assets.xcassets" ]; then
      echo "→ removing incomplete ${APPLE_GEN} before ios init"
      rm -rf "$APPLE_GEN"
    fi
    echo "→ tauri ios init (Xcode project under gen/apple)"
    echo "  Requires: Xcode + CocoaPods (optional) on macOS"
    "$TAURI_BIN" ios init
  fi
  if [ -d "$APPICONS" ]; then
    bash "${ROOT}/scripts/sync-ios-icons.sh" || true
  fi
fi

if [ "$DO_ANDROID" = 1 ]; then
  ANDROID_GEN="${TAURI_DIR}/gen/android"
  ANDROID_MARKER="${ANDROID_GEN}/app/src/main/AndroidManifest.xml"
  if [ -f "$ANDROID_MARKER" ]; then
    echo "✓ Android already initialized (${ANDROID_GEN})"
  else
    if [ -d "$ANDROID_GEN" ] && [ ! -f "$ANDROID_MARKER" ]; then
      echo "→ removing incomplete ${ANDROID_GEN} before android init"
      rm -rf "$ANDROID_GEN"
    fi
    echo "→ tauri android init (Gradle project under gen/android)"
    echo "  Requires: Android Studio / SDK (NDK installable later)"
    "$TAURI_BIN" android init
  fi
  if [ -d "${ANDROID_GEN}/app/src/main/res" ]; then
    bash "${ROOT}/scripts/ensure-tauri-cli-links.sh"
    if [ -n "${APPLE_BUNDLE_ID:-}" ]; then
      bash "${ROOT}/scripts/inject-android-manifest.sh" || true
    fi
    bash "${ROOT}/scripts/sync-android-icons.sh" || true
  fi
fi

echo ""
echo "Desktop ecosystem ready."
echo "  Bundle ID default: ${APPLE_BUNDLE_ID:-org.digitaldefiance.app.subspacelattice}"
echo "  Set APPLE_TEAM_ID / APPLE_PUBLISHER_NAME / APPLE_BUNDLE_ID in .env for signed builds."
echo "  See docs/desktop-build.md"
