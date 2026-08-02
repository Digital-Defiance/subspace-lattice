#!/usr/bin/env bash
# Lattice Atlas diff — compare two observe JSONL corpora
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ESBUILD="$ROOT/node_modules/.bin/esbuild"
CORE="$ROOT/packages/subspace-lattice"
CLI_SRC="$CORE/src/lib/sim/atlas-diff-cli.ts"
OUT_JS="$CORE/dist/atlas-diff-cli.mjs"

mkdir -p "$CORE/dist"
echo "atlas:diff — bundling…"
"$ESBUILD" "$CLI_SRC" \
  --bundle --platform=node --format=esm \
  --outfile="$OUT_JS" >/dev/null

node "$OUT_JS" "$@"
