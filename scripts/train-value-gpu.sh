#!/usr/bin/env bash
# Train Deep Lattice value MLP on Apple GPU (MPS) / CUDA / CPU via PyTorch.
# Usage: yarn train:value:gpu --data docs/sim-runs/dataset-q-combined.jsonl \
#          --out packages/subspace-lattice/src/lib/ai/weights/value-mlp-v3-gpu.json
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="${PYTHON:-python3}"

if ! "$PY" -c "import torch" 2>/dev/null; then
  echo "train:value:gpu — PyTorch not found for $PY" >&2
  echo "  Install: pip3 install torch" >&2
  echo "  Apple Silicon uses MPS automatically when available." >&2
  exit 1
fi

exec "$PY" "$ROOT/scripts/train-value-gpu.py" "$@"
