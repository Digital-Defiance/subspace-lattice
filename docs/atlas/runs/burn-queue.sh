#!/usr/bin/env bash
# Sequential Atlas CPU burn — log to burn-20260802.log (caller may redirect).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

echo "=== burn start $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

echo "=== 1/4 MvM@200 opening n=40 ==="
yarn atlas:observe --games 40 --jobs 12 --seed 41 \
  --white mcts --black mcts --sims 200 --max-plies 400 \
  --out docs/atlas/runs/observe-MvM-open-s41-m200.jsonl
yarn atlas:book --in docs/atlas/runs/observe-MvM-open-s41-m200.jsonl --depth 8 --top 20

echo "=== 2/4 MvM@40 middlegame n=120 ==="
yarn atlas:observe --games 120 --jobs 12 --seed 42 \
  --white mcts --black mcts --sims 40 --max-plies 400 \
  --out docs/atlas/runs/observe-MvM-mid-s42-n120.jsonl
yarn atlas:book --in docs/atlas/runs/observe-MvM-mid-s42-n120.jsonl --depth 8 --top 20

echo "=== 3/4 Relay counterfactual n=40 each ==="
yarn atlas:observe --games 40 --jobs 12 --seed 50 --relay-count 0 \
  --white mcts --black mcts --sims 40 --max-plies 400 \
  --out docs/atlas/runs/observe-MvM-relay0-s50-n40.jsonl
yarn atlas:observe --games 40 --jobs 12 --seed 50 --relay-count 1 \
  --white mcts --black mcts --sims 40 --max-plies 400 \
  --out docs/atlas/runs/observe-MvM-relay1-s50-n40.jsonl
yarn atlas:diff \
  --a docs/atlas/runs/observe-MvM-relay0-s50-n40.jsonl \
  --b docs/atlas/runs/observe-MvM-relay1-s50-n40.jsonl \
  | tee docs/atlas/runs/diff-relay-s50.txt
yarn atlas:book --in docs/atlas/runs/observe-MvM-relay0-s50-n40.jsonl --top 12
yarn atlas:book --in docs/atlas/runs/observe-MvM-relay1-s50-n40.jsonl --top 12

echo "=== burn done $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
