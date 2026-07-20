#!/usr/bin/env bash
# Copy player-facing PDFs into apps/web/public so Vite/hosting serve them.
# Source of truth stays under docs/; public copies are generated.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/apps/web/public/docs"
mkdir -p "$DEST"

copy_one() {
  local src="$1"
  local name="$2"
  if [[ ! -f "$src" ]]; then
    echo "warning: missing $src — skip $name" >&2
    return 0
  fi
  cp -f "$src" "$DEST/$name"
  echo "sync-docs-public: $name"
}

copy_one "$ROOT/docs/rules.pdf" "rules.pdf"
copy_one "$ROOT/docs/Subspace Lattice Manual.pdf" "subspace-lattice-manual.pdf"
