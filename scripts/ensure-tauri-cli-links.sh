#!/usr/bin/env bash
# Gradle/Xcode invoke `node tauri …` from src-tauri (Android) or gen/apple (iOS).
# Yarn hoists the CLI to repo-root node_modules — these symlinks bridge that gap.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAURI_CLI="${ROOT}/node_modules/@tauri-apps/cli/tauri.js"
TAURI_DIR="${ROOT}/apps/desktop/src-tauri"
APPLE_DIR="${TAURI_DIR}/gen/apple"

die() {
  echo "error: $*" >&2
  exit 1
}

[ -f "$TAURI_CLI" ] || die "tauri CLI not found at ${TAURI_CLI} — run yarn install from repo root"

link_tauri() {
  local dir="$1"
  local rel="$2"
  local link="${dir}/tauri"
  mkdir -p "$dir"
  ln -sf "$rel" "$link"
}

# Android Gradle: workingDir = src-tauri
link_tauri "$TAURI_DIR" "../../../node_modules/@tauri-apps/cli/tauri.js"
echo "Linked tauri CLI into ${TAURI_DIR}"

# iOS Xcode: build-rust-code.sh runs from gen/apple/ (created by `tauri ios init`)
if [ -d "$APPLE_DIR" ]; then
  link_tauri "$APPLE_DIR" "../../../../../node_modules/@tauri-apps/cli/tauri.js"
  echo "Linked tauri CLI into ${APPLE_DIR}"
else
  echo "Note: ${APPLE_DIR} not present yet — run yarn tauri:ios:dev once to generate it."
fi
