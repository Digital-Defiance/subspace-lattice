#!/usr/bin/env bash
# Compatibility shim: Warp-style `lattice_env_*` names → `subspace_env_*`.
# Prefer sourcing scripts/lib/subspace-env.sh directly in new scripts.
#
# shellcheck source=scripts/lib/subspace-env.sh

if [ "${BASH_SOURCE[0]:-$0}" = "$0" ]; then
  echo "error: source scripts/lib/lattice-env.sh; do not execute it" >&2
  exit 1
fi

_lattice_shim_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "${_lattice_shim_dir}/subspace-env.sh"

lattice_env_die() { subspace_env_die "$@"; }
lattice_env_repo_root() { subspace_env_repo_root; }
lattice_env_load_file() { subspace_env_load_file "$@"; }
lattice_env_require() { subspace_env_require "$@"; }
lattice_env_require_file() { subspace_env_require_file "$@"; }
lattice_env_cd_root() { subspace_env_cd_root; }
lattice_env_abs_path() { subspace_env_abs_path "$@"; }
lattice_env_write_tauri_local_config() { subspace_env_write_tauri_local_config; }

lattice_env_desktop_dir() {
  printf '%s' "$(subspace_env_repo_root)/apps/desktop"
}

lattice_env_tauri_dir() {
  printf '%s' "$(lattice_env_desktop_dir)/src-tauri"
}

lattice_env_load() {
  local mode="${1:-base}"
  case "$mode" in
    macos | macos-appstore | ios | android)
      subspace_env_load desktop
      # Apple / store packaging defaults (IWGF)
      _subspace_env_export_if_unset FIREBASE_PROJECT "warp-12"
      _subspace_env_export_if_unset TAURI_PRODUCT_NAME "Subspace Lattice"
      _subspace_env_export_if_unset TAURI_IDENTIFIER "org.digitaldefiance.app.subspacelattice"
      _subspace_env_export_if_unset APPLE_BUNDLE_ID "${TAURI_IDENTIFIER}"
      _subspace_env_export_if_unset APPLE_PRODUCT_NAME "${TAURI_PRODUCT_NAME}"
      if [ -n "${APPLE_TEAM_ID:-}" ] && [ -n "${APPLE_PUBLISHER_NAME:-}" ]; then
        _subspace_env_export_if_unset \
          APPLE_IOS_SIGN_IDENTITY \
          "Apple Distribution: ${APPLE_PUBLISHER_NAME} (${APPLE_TEAM_ID})"
      fi
      if [ -n "${APPLE_API_KEY:-}" ] && [ -z "${APPLE_API_KEY_PATH:-}" ]; then
        local key_dir="${APPLE_API_KEY_DIR:-$HOME/private_keys}"
        case "$key_dir" in
          \$HOME/*) key_dir="${HOME}/${key_dir#\$HOME/}" ;;
          \~/*) key_dir="${HOME}/${key_dir#\~/}" ;;
        esac
        if [ -f "${key_dir}/AuthKey_${APPLE_API_KEY}.p8" ]; then
          _subspace_env_export_if_unset APPLE_API_KEY_PATH "${key_dir}/AuthKey_${APPLE_API_KEY}.p8"
        fi
      fi
      export LATTICE_ROOT="${SUBSPACE_ROOT}"
      ;;
    desktop | base | web | functions | deploy | e2e)
      subspace_env_load "$mode"
      export LATTICE_ROOT="${SUBSPACE_ROOT}"
      ;;
    *)
      subspace_env_die "unknown lattice_env_load mode: ${mode}"
      ;;
  esac
}

lattice_env_validate() {
  local mode="${1:-base}"
  case "$mode" in
    macos | macos-appstore | ios)
      subspace_env_require APPLE_TEAM_ID APPLE_BUNDLE_ID APPLE_PUBLISHER_NAME
      ;;
    android)
      subspace_env_require APPLE_BUNDLE_ID
      ;;
    base | desktop | web | functions | deploy | e2e)
      subspace_env_validate "$mode"
      ;;
    *)
      subspace_env_die "unknown lattice_env_validate mode: ${mode}"
      ;;
  esac
}
