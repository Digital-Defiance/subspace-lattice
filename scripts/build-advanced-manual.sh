#!/usr/bin/env bash
# Build docs/advanced-manual.pdf: generate .tex from the academy missions,
# capture any missing board SVGs (headless), convert SVG→PDF, run pdflatex.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCS="$ROOT/docs"
TEX="$DOCS/advanced-manual.tex"
REACT_PKG="$ROOT/packages/subspace-lattice-react"
ESBUILD="$ROOT/node_modules/.bin/esbuild"

echo "advanced-manual — bundling generator…"
"$ESBUILD" "$REACT_PKG/src/tutorial/manual-cli.ts" \
  --bundle --platform=node --format=esm \
  --alias:@subspace-lattice/core="$ROOT/packages/subspace-lattice/src/index.ts" \
  --outfile="$REACT_PKG/dist/manual-cli.mjs" >/dev/null

set +e
node "$REACT_PKG/dist/manual-cli.mjs" "$TEX"
GEN_STATUS=$?
set -e

if [[ $GEN_STATUS -eq 2 ]]; then
  echo "advanced-manual — capturing missing mission figures (headless)…"
  node "$ROOT/scripts/capture-mission-figures.mjs"
  node "$REACT_PKG/dist/manual-cli.mjs" "$TEX"
elif [[ $GEN_STATUS -ne 0 ]]; then
  exit $GEN_STATUS
fi

if ! command -v pdflatex >/dev/null 2>&1; then
  echo "advanced-manual — pdflatex not found; wrote $TEX only" >&2
  exit 0
fi

# SVG → PDF for pdflatex.
if command -v rsvg-convert >/dev/null 2>&1; then
  shopt -s nullglob
  for svg in "$DOCS"/figures/missions/*/*.svg; do
    pdf="${svg%.svg}.pdf"
    if [[ ! -f "$pdf" || "$svg" -nt "$pdf" ]]; then
      rsvg-convert -f pdf -o "$pdf" "$svg"
    fi
  done
  shopt -u nullglob
else
  echo "warning: rsvg-convert not found; using existing figures/**.pdf" >&2
fi

export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-0}"
export FORCE_SOURCE_DATE=1

cd "$DOCS"
pdflatex -interaction=nonstopmode -halt-on-error advanced-manual.tex >/dev/null
pdflatex -interaction=nonstopmode -halt-on-error advanced-manual.tex >/dev/null
rm -f advanced-manual.aux advanced-manual.log advanced-manual.out advanced-manual.toc

echo "advanced-manual — wrote docs/advanced-manual.pdf"

if [[ -x "$ROOT/scripts/sync-docs-public.sh" ]]; then
  /usr/bin/env bash "$ROOT/scripts/sync-docs-public.sh"
fi
