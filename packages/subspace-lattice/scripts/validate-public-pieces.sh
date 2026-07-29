#!/bin/bash

# Validate the public pieces in the web app, then refresh the react-ui manifest.

set -euo pipefail

PKG_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "${PKG_ROOT}/../.." && pwd)"

RESULT=$(npx tsx "${PKG_ROOT}/src/lib/validate-public-pieces.ts")

if [[ $RESULT == *"Missing 0 pieces"* ]]; then
    echo "All pieces are present"
else
    echo "Some pieces are missing"
    echo "$RESULT"
    exit 1
fi

(cd "${REPO_ROOT}" && yarn pieces:manifest)
