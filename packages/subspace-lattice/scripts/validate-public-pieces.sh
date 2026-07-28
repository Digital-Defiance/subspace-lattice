#!/bin/bash

# Validate the public pieces in the web app.

# run the validate-public-pieces.ts script
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

RESULT=$(npx tsx "${ROOT}/src/lib/validate-public-pieces.ts")

if [[ $RESULT == *"Missing 0 pieces"* ]]; then
    echo "All pieces are present"
else
    echo "Some pieces are missing"
    echo $RESULT
    exit 1
fi
