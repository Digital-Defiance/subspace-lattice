#!/bin/bash

# Validate the public pieces in the web app.

# run the validate-public-pieces.ts script
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

npx tsx "${ROOT}/src/lib/validate-public-pieces.ts"

