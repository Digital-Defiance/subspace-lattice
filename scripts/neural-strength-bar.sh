#!/usr/bin/env bash
# Deep Lattice strength bar: terminal goldens + ladder vs deepish MCTS.
# Usage: yarn neural:strength-bar --weights packages/subspace-lattice/src/lib/ai/weights/value-mlp-v1.json
# Parallel games: --jobs N (default: CPU cores − 1)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ESBUILD="$ROOT/node_modules/.bin/esbuild"
CORE="$ROOT/packages/subspace-lattice"
CLI_SRC="$CORE/src/lib/ai/neural-strength-bar-cli.ts"
WORKER_SRC="$CORE/src/lib/ai/neural-match-worker.ts"
OUT_JS="$CORE/dist/neural-strength-bar-cli.mjs"
WORKER_JS="$CORE/dist/neural-match-worker.mjs"

mkdir -p "$CORE/dist"

echo "neural:strength-bar — bundling worker + CLI…"
"$ESBUILD" "$WORKER_SRC" \
  --bundle --platform=node --format=esm \
  --outfile="$WORKER_JS" >/dev/null

"$ESBUILD" "$CLI_SRC" \
  --bundle --platform=node --format=esm \
  --outfile="$OUT_JS" >/dev/null

node "$OUT_JS" "$@"
