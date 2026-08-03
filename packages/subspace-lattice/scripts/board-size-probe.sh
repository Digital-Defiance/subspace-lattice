#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ESBUILD="$ROOT/../../node_modules/.bin/esbuild"
"$ESBUILD" src/lib/sim/board-size-probe.ts --bundle --platform=node --format=esm --outfile=dist/board-size-probe.mjs
exec node dist/board-size-probe.mjs "$@"
