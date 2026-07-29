#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ESBUILD="$ROOT/../../node_modules/.bin/esbuild"
"$ESBUILD" src/lib/sim/emp-balance-probe.ts --bundle --platform=node --format=esm --outfile=dist/emp-balance-probe.mjs
exec node dist/emp-balance-probe.mjs "$@"
