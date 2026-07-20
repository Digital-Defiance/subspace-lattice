#!/usr/bin/env bash
# Universal macOS DMG (optional GitHub release + Homebrew cask update).
#
# Usage:
#   yarn build:mac
#   yarn build:mac 0.1.1
#   yarn build:mac 0.1.1 --publish
#   yarn build:mac 0.1.1 --publish --push-tap
#   yarn build:mac --skip-notarize
#
# Release asset name: Subspace_Lattice_<version>_universal.dmg
# Cask: $HOMEBREW_TAP_DIR/Casks/subspace-lattice.rb

set -euo pipefail

# shellcheck source=scripts/lib/lattice-env.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/lattice-env.sh"
lattice_env_load desktop
lattice_env_cd_root

ROOT="${LATTICE_ROOT:-$SUBSPACE_ROOT}"
DESKTOP_DIR="${ROOT}/apps/desktop"
TAURI_DIR="${DESKTOP_DIR}/src-tauri"
PKG_JSON="${DESKTOP_DIR}/package.json"
TAURI_CONF="${TAURI_DIR}/tauri.conf.json"
TAURI_BIN="${ROOT}/node_modules/.bin/tauri"
DMG_DIR="${TAURI_DIR}/target/universal-apple-darwin/release/bundle/dmg"

SKIP_NOTARIZE=0
PUBLISH=0
PUSH_TAP=0
PUSH_GIT_TAG=1
APP_VERSION=""

die() {
  echo "error: $*" >&2
  exit 1
}

usage() {
  cat >&2 <<'EOF'
Usage: bash scripts/build-macos.sh [OPTIONS] [VERSION]

  VERSION          Semver (default: apps/desktop/package.json).
  --skip-notarize  Skip notarization even if Apple credentials are set.
  --publish        Create GitHub release, upload DMG, update homebrew cask
  --push-tap       After --publish, commit and push HOMEBREW_TAP_DIR
  --no-push-tag    Do not create/push git tag v<VERSION> (release must exist)

Env:
  GITHUB_REPO              default Digital-Defiance/subspace-lattice
  HOMEBREW_TAP_DIR         path to homebrew-tap checkout (required for --publish)
  LATTICE_PUSH_HOMEBREW_TAP=0  Commit cask only; do not push
EOF
  exit 1
}

looks_like_version() {
  case "$1" in
    v[0-9]*.[0-9]*.[0-9]*) return 0 ;;
    [0-9]*.[0-9]*.[0-9]*) return 0 ;;
    *) return 1 ;;
  esac
}

normalize_version() {
  printf '%s' "$1" | sed 's/^v//'
}

is_interactive() {
  [ -z "${CI:-}" ] && [ "${NONINTERACTIVE:-}" != "1" ]
}

dmg_asset_basename() {
  printf 'Subspace_Lattice_%s_universal.dmg' "$APP_VERSION"
}

find_built_dmg() {
  local expected newest
  expected="${DMG_DIR}/$(dmg_asset_basename)"
  if [ -f "$expected" ]; then
    printf '%s' "$expected"
    return 0
  fi
  newest="$(ls -1t "${DMG_DIR}"/*.dmg 2>/dev/null | head -1 || true)"
  [ -n "$newest" ] && [ -f "$newest" ] || return 1
  printf '%s' "$newest"
}

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

release_tag_name() {
  printf 'v%s' "$APP_VERSION"
}

ensure_git_release_tag() {
  local _tag
  _tag="$(release_tag_name)"
  if git rev-parse "$_tag" >/dev/null 2>&1; then
    echo "Tag ${_tag} already exists locally." >&2
  else
    if is_interactive; then
      printf "Create git tag %s on HEAD? [y/N] " "$_tag"
      read -r _ans
      _ans="$(printf '%s' "${_ans:-N}" | tr '[:upper:]' '[:lower:]')"
      case "$_ans" in
        y|yes) ;;
        *) die "aborted — create tag ${_tag} or pass --no-push-tag" ;;
      esac
    fi
    git tag "$_tag"
    echo "Created tag ${_tag}." >&2
  fi
  if [ "$PUSH_GIT_TAG" -eq 1 ]; then
    echo "Pushing ${_tag} to origin..." >&2
    git push origin "$_tag"
  fi
}

publish_github_and_homebrew() {
  local _src_dmg _staging _sha _tag _asset_name _title _cask
  [ -n "${GITHUB_REPO:-}" ] || export GITHUB_REPO="Digital-Defiance/subspace-lattice"
  [ -n "${HOMEBREW_TAP_DIR:-}" ] || die "HOMEBREW_TAP_DIR required for --publish"
  _src_dmg="$(find_built_dmg)" || die "DMG not found under ${DMG_DIR}/"
  command -v gh >/dev/null 2>&1 || die "gh CLI not found (brew install gh && gh auth login)"

  _tag="$(release_tag_name)"
  _asset_name="$(dmg_asset_basename)"
  if [ "$(basename "$_src_dmg")" = "$_asset_name" ]; then
    _staging="$_src_dmg"
  else
    _staging="${DMG_DIR}/${_asset_name}"
    cp -f "$_src_dmg" "$_staging"
  fi

  _sha="$(sha256_file "$_staging")"
  echo "DMG: ${_staging}" >&2
  echo "sha256: ${_sha}" >&2
  echo "Release tag: ${_tag}" >&2

  if [ "$PUSH_GIT_TAG" -eq 1 ]; then
    ensure_git_release_tag
  elif ! gh release view "$_tag" --repo "$GITHUB_REPO" >/dev/null 2>&1; then
    die "GitHub release ${_tag} missing; create tag or omit --no-push-tag"
  fi

  _title="Subspace Lattice ${APP_VERSION}"
  if gh release view "$_tag" --repo "$GITHUB_REPO" >/dev/null 2>&1; then
    echo "Uploading to existing release ${_tag}..." >&2
    gh release upload "$_tag" "$_staging" --repo "$GITHUB_REPO" --clobber
  else
    echo "Creating GitHub release ${_tag}..." >&2
    gh release create "$_tag" "$_staging" \
      --repo "$GITHUB_REPO" \
      --title "$_title" \
      --generate-notes
  fi

  bash "${ROOT}/scripts/update-subspace-lattice-cask.sh" "$APP_VERSION" "$_sha"

  _cask="${HOMEBREW_TAP_DIR}/Casks/subspace-lattice.rb"
  if [ "$PUSH_TAP" -eq 1 ]; then
    [ -d "${HOMEBREW_TAP_DIR}/.git" ] || die "not a git repo: ${HOMEBREW_TAP_DIR}"
    (
      cd "$HOMEBREW_TAP_DIR"
      git add "Casks/subspace-lattice.rb"
      if git diff --cached --quiet; then
        echo "homebrew-tap: no cask changes to commit." >&2
      else
        git commit -m "subspace-lattice ${APP_VERSION}"
        if [ "${LATTICE_PUSH_HOMEBREW_TAP:-}" = "0" ]; then
          echo "homebrew-tap: committed locally; push skipped (LATTICE_PUSH_HOMEBREW_TAP=0)." >&2
        elif is_interactive; then
          printf "Push homebrew-tap to origin? [y/N] "
          read -r _push_ans
          _push_ans="$(printf '%s' "${_push_ans:-N}" | tr '[:upper:]' '[:lower:]')"
          case "$_push_ans" in
            y|yes) git push origin HEAD ;;
            *) echo "Skipped push. Commit is local in ${HOMEBREW_TAP_DIR}" >&2 ;;
          esac
        else
          git push origin HEAD
        fi
      fi
    )
  else
    echo "homebrew-tap updated locally. Commit with:" >&2
    echo "  cd ${HOMEBREW_TAP_DIR} && git add Casks/subspace-lattice.rb && git commit -m 'subspace-lattice ${APP_VERSION}' && git push" >&2
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage ;;
    --skip-notarize) SKIP_NOTARIZE=1; shift ;;
    --publish) PUBLISH=1; shift ;;
    --push-tap) PUBLISH=1; PUSH_TAP=1; shift ;;
    --no-push-tag) PUSH_GIT_TAG=0; shift ;;
    --version)
      [ $# -ge 2 ] || die "--version needs a value"
      APP_VERSION="$(normalize_version "$2")"
      shift 2
      ;;
    *)
      if looks_like_version "$1"; then
        APP_VERSION="$(normalize_version "$1")"
        shift
      else
        die "unknown arg: $1 (see --help)"
      fi
      ;;
  esac
done

[ -x "$TAURI_BIN" ] || die "missing tauri CLI — run yarn install"
[ -f "$TAURI_CONF" ] || die "missing ${TAURI_CONF}"

if [ -z "$APP_VERSION" ]; then
  APP_VERSION="$(node -e "const p=require(process.argv[1]); process.stdout.write(String(p.version||'0.0.1'));" "$PKG_JSON")"
fi

if [ -z "${GITHUB_REPO:-}" ]; then
  export GITHUB_REPO="Digital-Defiance/subspace-lattice"
fi

node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
  pkg.version = process.argv[2];
  fs.writeFileSync(process.argv[1], JSON.stringify(pkg, null, 2) + '\n');
  const conf = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  conf.version = process.argv[2];
  fs.writeFileSync(process.argv[3], JSON.stringify(conf, null, 2) + '\n');
" "$PKG_JSON" "$APP_VERSION" "$TAURI_CONF"

bash "${ROOT}/scripts/tauri-icon.sh"
bash "${ROOT}/scripts/ensure-tauri-cli-links.sh"

echo "Building Subspace Lattice ${APP_VERSION} (universal macOS)…"
cd "$DESKTOP_DIR"

if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
  export APPLE_SIGNING_IDENTITY
  echo "Signing with APPLE_SIGNING_IDENTITY"
else
  echo "APPLE_SIGNING_IDENTITY unset — unsigned build"
fi

if [ "$SKIP_NOTARIZE" = 1 ]; then
  echo "Skipping notarization (--skip-notarize)"
  unset APPLE_ID APPLE_PASSWORD APPLE_API_KEY APPLE_API_ISSUER APPLE_API_KEY_PATH || true
elif [ -n "${APPLE_ID:-}" ] || [ -n "${APPLE_API_KEY:-}" ]; then
  echo "Notarization credentials detected — Tauri will notarize if configured"
else
  echo "No notarization credentials — local build only"
fi

"$TAURI_BIN" build --target universal-apple-darwin

echo "Done. Look under ${TAURI_DIR}/target/universal-apple-darwin/release/bundle/"
if [ -d "$DMG_DIR" ]; then
  echo "  Expected release asset: $(dmg_asset_basename)"
  ls -1t "${DMG_DIR}"/*.dmg 2>/dev/null | head -3 || true
fi

if [ "$PUBLISH" -eq 1 ]; then
  echo "Publishing GitHub release and updating homebrew-tap..." >&2
  publish_github_and_homebrew
fi
