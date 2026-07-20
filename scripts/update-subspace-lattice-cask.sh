#!/usr/bin/env bash
# Update Homebrew cask version + sha256 after a GitHub DMG release.
#
# Usage:
#   bash scripts/update-subspace-lattice-cask.sh <version> <sha256>
#   HOMEBREW_TAP_DIR=/Volumes/Code/homebrew-tap bash scripts/update-subspace-lattice-cask.sh 0.1.1 <sha256>

set -euo pipefail

# shellcheck source=scripts/lib/lattice-env.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/lattice-env.sh"
lattice_env_load desktop
lattice_env_cd_root

VERSION="${1:-}"
SHA256="${2:-}"
HOMEBREW_TAP_DIR="${HOMEBREW_TAP_DIR:-}"
GITHUB_REPO="${GITHUB_REPO:-Digital-Defiance/subspace-lattice}"
CASK_PATH="${CASK_PATH:-${HOMEBREW_TAP_DIR}/Casks/subspace-lattice.rb}"
# Ruby cask interpolation (#{version}), not shell ${version}.
DMG_ASSET='Subspace_Lattice_#{version}_universal.dmg'

die() {
  echo "error: $*" >&2
  exit 1
}

[ -n "$VERSION" ] || die "usage: bash scripts/update-subspace-lattice-cask.sh <version> <sha256>"
[ -n "$SHA256" ] || die "usage: bash scripts/update-subspace-lattice-cask.sh <version> <sha256>"
[ -n "$HOMEBREW_TAP_DIR" ] || die "HOMEBREW_TAP_DIR unset (e.g. /Volumes/Code/homebrew-tap)"
[ -f "$CASK_PATH" ] || die "missing cask: ${CASK_PATH} (set HOMEBREW_TAP_DIR / CASK_PATH)"

if sed --version >/dev/null 2>&1; then
  SED_INPLACE=(sed -i)
else
  SED_INPLACE=(sed -i '')
fi

"${SED_INPLACE[@]}" "s|^  version .*|  version \"${VERSION}\"|" "$CASK_PATH"
"${SED_INPLACE[@]}" "s|^  sha256 .*|  sha256 \"${SHA256}\"|" "$CASK_PATH"
"${SED_INPLACE[@]}" "s|^  url .*|  url \"https://github.com/${GITHUB_REPO}/releases/download/v#{version}/${DMG_ASSET}\"|" "$CASK_PATH"

echo "Updated ${CASK_PATH}"
echo "  version ${VERSION}"
echo "  sha256  ${SHA256}"
echo "  repo    ${GITHUB_REPO}"
