#!/usr/bin/env bash
# Train Deep Lattice MLP value net from JSONL.
# Usage: yarn train:value --data docs/sim-runs/dataset.jsonl --out packages/subspace-lattice/src/lib/ai/weights/value-mlp-v1.json
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ESBUILD="$ROOT/node_modules/.bin/esbuild"
CORE="$ROOT/packages/subspace-lattice"
CLI_SRC="$CORE/src/lib/ai/train-value-cli.ts"
OUT_JS="$CORE/dist/train-value-cli.mjs"

echo "train:value — bundling…"
"$ESBUILD" "$CLI_SRC" \
  --bundle --platform=node --format=esm \
  --outfile="$OUT_JS" >/dev/null

node "$OUT_JS" "$@"
