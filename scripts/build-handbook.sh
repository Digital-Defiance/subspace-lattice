#!/usr/bin/env bash
# Build the VitePress handbook (apps/handbook) from repo docs/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HB="$ROOT/apps/handbook"
PUBLIC="$HB/public"

mkdir -p "$PUBLIC"

# Ship the same player PDFs alongside Markdown pages.
copy_pdf() {
  local src="$1"
  local name="$2"
  if [[ -f "$src" ]]; then
    cp -f "$src" "$PUBLIC/$name"
    echo "handbook:public $name"
  else
    echo "warning: missing $src" >&2
  fi
}

copy_pdf "$ROOT/docs/rules.pdf" "rules.pdf"
copy_pdf "$ROOT/docs/Subspace Lattice Manual.pdf" "subspace-lattice-manual.pdf"
copy_pdf "$ROOT/docs/advanced-manual.pdf" "advanced-manual.pdf"
copy_pdf "$ROOT/docs/Subspace Lattice Story.pdf" "story.pdf"

cd "$ROOT"
yarn workspace @subspace-lattice/handbook build
echo "handbook — wrote $HB/dist"
