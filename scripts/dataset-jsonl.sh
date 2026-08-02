#!/usr/bin/env bash
# Dump Deep Lattice training JSONL (self-play and/or LPGN).
# Usage: yarn dataset:jsonl --games 20 --out docs/sim-runs/dataset.jsonl
#        yarn dataset:jsonl --games 40 --label-sims 50 --jobs 10 --out …
#        yarn dataset:jsonl --lpgn path/to/game.lpgn --out …
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ESBUILD="$ROOT/node_modules/.bin/esbuild"
CORE="$ROOT/packages/subspace-lattice"
CLI_SRC="$CORE/src/lib/ai/dataset-cli.ts"
WORKER_SRC="$CORE/src/lib/ai/dataset-game-worker.ts"
OUT_JS="$CORE/dist/dataset-cli.mjs"
WORKER_JS="$CORE/dist/dataset-game-worker.mjs"

mkdir -p "$CORE/dist"

echo "dataset:jsonl — bundling worker + CLI…"
"$ESBUILD" "$WORKER_SRC" \
  --bundle --platform=node --format=esm \
  --outfile="$WORKER_JS" >/dev/null

"$ESBUILD" "$CLI_SRC" \
  --bundle --platform=node --format=esm \
  --outfile="$OUT_JS" >/dev/null

node "$OUT_JS" "$@"
