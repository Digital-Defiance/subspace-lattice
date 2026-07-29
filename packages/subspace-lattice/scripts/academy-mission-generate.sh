#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ESBUILD="$ROOT/../../node_modules/.bin/esbuild"
"$ESBUILD" src/lib/sim/academy-mission-generate.ts --bundle --platform=node --format=esm --outfile=dist/academy-mission-generate.mjs
exec node dist/academy-mission-generate.mjs "$@"
