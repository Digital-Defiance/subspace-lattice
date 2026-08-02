#!/usr/bin/env bash
# Lattice Atlas census → docs/atlas/census.json (+ census.md)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ESBUILD="$ROOT/node_modules/.bin/esbuild"
CORE="$ROOT/packages/subspace-lattice"
CLI_SRC="$CORE/src/lib/sim/atlas-census-cli.ts"
OUT_JS="$CORE/dist/atlas-census-cli.mjs"

mkdir -p "$CORE/dist"
echo "atlas:census — bundling…"
"$ESBUILD" "$CLI_SRC" \
  --bundle --platform=node --format=esm \
  --outfile="$OUT_JS" >/dev/null

node "$OUT_JS" "$@"
