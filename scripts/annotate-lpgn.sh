#!/usr/bin/env bash
# Annotate an LPGN file → Board-captured diagrams + TeX + PDF.
# Usage: yarn annotate:lpgn path/to/game.lpgn [--every-ply] [--letter-svg] [--out docs/lpgn-reports]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ESBUILD="$ROOT/node_modules/.bin/esbuild"
CORE="$ROOT/packages/subspace-lattice"
CLI_SRC="$CORE/src/lib/debug/lpgn-annotate-cli.ts"
OUT_JS="$CORE/dist/lpgn-annotate-cli.mjs"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <file.lpgn> [--every-ply] [--letter-svg] [--out <dir>] [--perspective white|black]" >&2
  exit 1
fi

echo "annotate:lpgn — bundling…"
"$ESBUILD" "$CLI_SRC" \
  --bundle --platform=node --format=esm \
  --outfile="$OUT_JS" >/dev/null

# Pass through; CLI writes TeX + plies list, captures Board SVGs unless --letter-svg.
node "$OUT_JS" "$@"
