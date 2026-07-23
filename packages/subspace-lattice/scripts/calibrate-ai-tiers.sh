#!/usr/bin/env bash
# Calibrate Fast / Normal / Strong under hybrid-fleet (TEI ladder).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ESBUILD="$ROOT/../../node_modules/.bin/esbuild"
"$ESBUILD" src/lib/sim/calibrate-ai-tiers.ts --bundle --platform=node --format=esm --outfile=dist/calibrate-ai-tiers.mjs
exec node dist/calibrate-ai-tiers.mjs "$@"
