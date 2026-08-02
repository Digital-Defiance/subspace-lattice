#!/usr/bin/env bash
# Mine opening / middlegame / endgame draft from an observe JSONL
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ESBUILD="$ROOT/node_modules/.bin/esbuild"
CORE="$ROOT/packages/subspace-lattice"
CLI_SRC="$CORE/src/lib/sim/atlas-book-cli.ts"
OUT_JS="$CORE/dist/atlas-book-cli.mjs"

mkdir -p "$CORE/dist"
echo "atlas:book — bundling…"
"$ESBUILD" "$CLI_SRC" \
  --bundle --platform=node --format=esm \
  --outfile="$OUT_JS" >/dev/null

node "$OUT_JS" "$@"
