#!/usr/bin/env bash
# Full release pipeline: bump version (optional), then macOS / App Store / iOS / Android.
# Windows Store MSIX is not included (build on Windows: yarn build:windows:store).
#
# Usage:
#   ./scripts/build-all.sh 0.1.1
#   ./scripts/build-all.sh --next-build
#   ./scripts/build-all.sh --next-minor --next-build
#
# Version scheme: 0.{minor}.{build} where build is iOS bundleVersion and Android
# versionCode (Windows/macOS use tauri.conf.json "version").
#
# Secrets for GUI/CI (env only — never on argv / shell history):
#   APPLE_PASSWORD, APPLE_IOS_CERTIFICATE_PASSWORD, ANDROID_KEYSTORE_PASSWORD
#   NONINTERACTIVE=1, LATTICE_PUSH_HOMEBREW_TAP=0

set -e

# shellcheck source=scripts/lib/lattice-env.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/lattice-env.sh"
lattice_env_load macos
lattice_env_cd_root
ROOT="$LATTICE_ROOT"

NEXT_BUILD=0
NEXT_MINOR=0
EXPLICIT_VERSION=""
PUSH_TAP=1
PUSH_GIT_TAG=1

die() {
  echo "error: $*" >&2
  exit 1
}

usage() {
  cat >&2 <<'EOF'
usage:
  yarn build:all:native --next-build
  ./scripts/build-all.sh <0.minor.build>
  ./scripts/build-all.sh --next-build
  ./scripts/build-all.sh --next-minor
  ./scripts/build-all.sh --next-minor --next-build

Examples:
  ./scripts/build-all.sh --next-build
    0.1.0 → 0.1.1 (bundleVersion / versionCode 1)

  ./scripts/build-all.sh --next-minor --next-build

  ./scripts/build-all.sh --no-push-tap
  ./scripts/build-all.sh --no-push-tag

Version is written to apps/desktop/package.json, src-tauri/tauri.conf.json,
and src-tauri/Cargo.toml before building.

NONINTERACTIVE=1 skips macOS publish [y/N] prompts.
LATTICE_PUSH_HOMEBREW_TAP=0 commits homebrew-tap locally without pushing.

(yarn build:all builds JS packages only — use build:all:native for stores.)

Windows (MSIX / native): build on a Windows host —
  yarn build:windows
  yarn build:windows:store
EOF
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --next-build)
      NEXT_BUILD=1
      shift
      ;;
    --next-minor)
      NEXT_MINOR=1
      shift
      ;;
    --no-push-tap)
      PUSH_TAP=0
      shift
      ;;
    --no-push-tag)
      PUSH_GIT_TAG=0
      shift
      ;;
    -h|--help)
      usage
      ;;
    --)
      shift
      break
      ;;
    -*)
      die "unknown option: $1 (try --help)"
      ;;
    *)
      if [ -n "$EXPLICIT_VERSION" ]; then
        die "too many version arguments"
      fi
      EXPLICIT_VERSION="$1"
      shift
      ;;
  esac
done

if [ "$NEXT_BUILD" = 1 ] || [ "$NEXT_MINOR" = 1 ]; then
  BUMP_ARGS=()
  [ "$NEXT_MINOR" = 1 ] && BUMP_ARGS+=(--next-minor)
  [ "$NEXT_BUILD" = 1 ] && BUMP_ARGS+=(--next-build)
  node "${ROOT}/scripts/app-version.mjs" bump "${BUMP_ARGS[@]}"
elif [ -n "$EXPLICIT_VERSION" ]; then
  node "${ROOT}/scripts/app-version.mjs" set "$EXPLICIT_VERSION"
else
  usage
fi

VERSION="$(node "${ROOT}/scripts/app-version.mjs" print)"
echo "Building version ${VERSION}"
MACOS_ARGS=("$VERSION" --publish)
[ "$PUSH_TAP" = 1 ] && MACOS_ARGS+=(--push-tap)
[ "$PUSH_GIT_TAG" = 1 ] || MACOS_ARGS+=(--no-push-tag)
./scripts/build-macos.sh "${MACOS_ARGS[@]}"
./scripts/build-macos-appstore.sh "$VERSION" --upload
./scripts/build-ios-appstore.sh --upload
./scripts/build-android.sh
echo ""
echo "Apple + Android pipeline finished for ${VERSION}."
echo ""
echo "—— Windows (not built here; run on Windows) ——"
echo "  yarn build:windows          # MSI/NSIS"
echo "  yarn build:windows:store    # MSIX (syncs icons first)"
echo "Preflight MSIX tile check (macOS can verify sizes):"
set +e
node "${ROOT}/apps/desktop/scripts/sync-windows-msix-assets.mjs"
SYNC_STATUS=$?
set -e
if [ "$SYNC_STATUS" -ne 0 ]; then
  echo ""
  echo "warning: Windows MSIX assets incomplete — fix icons before yarn build:windows:store" >&2
fi
echo "Done."
