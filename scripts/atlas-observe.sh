#!/usr/bin/env bash
# Lattice Atlas observe → ply-event JSONL
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ESBUILD="$ROOT/node_modules/.bin/esbuild"
CORE="$ROOT/packages/subspace-lattice"
CLI_SRC="$CORE/src/lib/sim/atlas-observe-cli.ts"
WORKER_SRC="$CORE/src/lib/sim/atlas-observe-worker.ts"
OUT_JS="$CORE/dist/atlas-observe-cli.mjs"
WORKER_JS="$CORE/dist/atlas-observe-worker.mjs"

mkdir -p "$CORE/dist"
echo "atlas:observe — bundling worker + CLI…"
"$ESBUILD" "$WORKER_SRC" \
  --bundle --platform=node --format=esm \
  --outfile="$WORKER_JS" >/dev/null

"$ESBUILD" "$CLI_SRC" \
  --bundle --platform=node --format=esm \
  --outfile="$OUT_JS" >/dev/null

node "$OUT_JS" "$@"
