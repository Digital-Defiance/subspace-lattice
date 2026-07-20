#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ESBUILD="$ROOT/../../node_modules/.bin/esbuild"
"$ESBUILD" src/lib/sim/sim-worker.ts --bundle --platform=node --format=esm --outfile=dist/sim-worker.mjs
"$ESBUILD" src/lib/sim/evolve-cli.ts --bundle --platform=node --format=esm --outfile=dist/evolve-cli.mjs
exec node dist/evolve-cli.mjs "$@"
