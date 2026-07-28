#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ESBUILD="$ROOT/../../node_modules/.bin/esbuild"
"$ESBUILD" src/lib/sim/heavy-draft-geometry.ts --bundle --platform=node --format=esm --outfile=dist/heavy-draft-geometry.mjs
exec node dist/heavy-draft-geometry.mjs "$@"
