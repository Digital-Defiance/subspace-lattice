#!/usr/bin/env bash
# Smoke ladder: MCTS (heuristic leaf) vs MCTS (stub neural leaf).
# Usage: yarn neural:stub-ladder [--sims 40] [--games 2] [--max-plies 80]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ESBUILD="$ROOT/node_modules/.bin/esbuild"
CORE="$ROOT/packages/subspace-lattice"
CLI_SRC="$CORE/src/lib/ai/neural-stub-ladder-cli.ts"
OUT_JS="$CORE/dist/neural-stub-ladder-cli.mjs"

echo "neural-stub-ladder — bundling…"
"$ESBUILD" "$CLI_SRC" \
  --bundle --platform=node --format=esm \
  --outfile="$OUT_JS" >/dev/null

node "$OUT_JS" "$@"
