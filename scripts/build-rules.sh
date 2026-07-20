#!/usr/bin/env bash
# Rebuild docs/rules.pdf from docs/rules.tex only when the .tex content hash changes.
# Avoids pointless PDF churn (LaTeX embeds build timestamps by default).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEX="$ROOT/docs/rules.tex"
PDF="$ROOT/docs/rules.pdf"
HASH_FILE="$ROOT/docs/rules.tex.sha256"
DOCS="$ROOT/docs"

if [[ ! -f "$TEX" ]]; then
  echo "error: missing $TEX" >&2
  exit 1
fi

if ! command -v pdflatex >/dev/null 2>&1; then
  echo "error: pdflatex not found on PATH" >&2
  exit 1
fi

hash_tex() {
  # Prefer shasum (macOS); fall back to sha256sum (Linux).
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$TEX" | awk '{print $1}'
  else
    sha256sum "$TEX" | awk '{print $1}'
  fi
}

CURRENT="$(hash_tex)"

if [[ -f "$HASH_FILE" && -f "$PDF" ]]; then
  STORED="$(tr -d '[:space:]' <"$HASH_FILE")"
  if [[ "$CURRENT" == "$STORED" ]]; then
    echo "build:rules — docs/rules.tex unchanged ($CURRENT); skipping pdflatex"
    exit 0
  fi
fi

echo "build:rules — docs/rules.tex changed; building PDF…"

# Deterministic CreationDate/ModDate when TeX Live honors SOURCE_DATE_EPOCH.
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-0}"
export FORCE_SOURCE_DATE=1

# SVG sources → PDF for pdflatex (requires rsvg-convert / librsvg).
FIGURES="$DOCS/figures"
if command -v rsvg-convert >/dev/null 2>&1; then
  shopt -s nullglob
  for svg in "$FIGURES"/*.svg; do
    pdf="${svg%.svg}.pdf"
    if [[ ! -f "$pdf" || "$svg" -nt "$pdf" ]]; then
      echo "  converting $(basename "$svg") → $(basename "$pdf")"
      rsvg-convert -f pdf -o "$pdf" "$svg"
    fi
  done
  shopt -u nullglob
else
  echo "warning: rsvg-convert not found; using existing figures/*.pdf if present" >&2
fi

cd "$DOCS"
pdflatex -interaction=nonstopmode -halt-on-error rules.tex >/dev/null
pdflatex -interaction=nonstopmode -halt-on-error rules.tex >/dev/null

# Drop aux artifacts; keep .tex / .pdf / hash stamp.
rm -f rules.aux rules.log rules.out rules.toc rules.lof rules.lot rules.fls rules.fdb_latexmk

printf '%s\n' "$CURRENT" >"$HASH_FILE"
echo "build:rules — wrote docs/rules.pdf (hash $CURRENT)"

# Keep web public copies in sync for local serve / next hosting deploy.
if [[ -x "$ROOT/scripts/sync-docs-public.sh" ]]; then
  /usr/bin/env bash "$ROOT/scripts/sync-docs-public.sh"
fi
