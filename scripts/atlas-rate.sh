#!/usr/bin/env bash
# Rate opening moves — deep-leaf (per-move Deep MCTS) or root mode
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ESBUILD="$ROOT/node_modules/.bin/esbuild"
CORE="$ROOT/packages/subspace-lattice"
CLI_SRC="$CORE/src/lib/sim/atlas-rate-cli.ts"
WORKER_SRC="$CORE/src/lib/sim/atlas-rate-worker.ts"
OUT_JS="$CORE/dist/atlas-rate-cli.mjs"
WORKER_JS="$CORE/dist/atlas-rate-worker.mjs"

mkdir -p "$CORE/dist"
echo "atlas:rate — bundling worker + CLI…"
"$ESBUILD" "$WORKER_SRC" \
  --bundle --platform=node --format=esm \
  --outfile="$WORKER_JS" >/dev/null

"$ESBUILD" "$CLI_SRC" \
  --bundle --platform=node --format=esm \
  --outfile="$OUT_JS" >/dev/null

node "$OUT_JS" "$@"
