#!/usr/bin/env bash
# Lattice Atlas observe → ply-event JSONL
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ESBUILD="$ROOT/node_modules/.bin/esbuild"
CORE="$ROOT/packages/subspace-lattice"
CLI_SRC="$CORE/src/lib/sim/atlas-observe-cli.ts"
OUT_JS="$CORE/dist/atlas-observe-cli.mjs"

mkdir -p "$CORE/dist"
echo "atlas:observe — bundling…"
"$ESBUILD" "$CLI_SRC" \
  --bundle --platform=node --format=esm \
  --outfile="$OUT_JS" >/dev/null

node "$OUT_JS" "$@"
