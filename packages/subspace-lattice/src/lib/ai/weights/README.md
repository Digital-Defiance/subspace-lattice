# Deep Lattice value weights

| File | Encoder | Arch | Notes |
|------|---------|------|-------|
| `value-mlp-v1.json` | v1 | 1948→64→32→1 | Outcome `z` on HvR `dataset.jsonl` |
| `value-mlp-v3.json` | v1 | 1948→64→32→1 | TS CPU train on combined q dumps |
| `value-mlp-v3-gpu.json` | v1 | 1948→128→64→1 | PyTorch MPS on q+v3 |
| `value-mlp-v4-gpu.json` | v1 | 1948→128→64→1 | MPS on q+v3+v5 |
| `value-mlp-v5-gpu.json` | v1 | 1948→128→64→1 | **Current** — + mcts-random q dump |

```bash
# CPU (pure TS) — fine for tiny nets, does not use GPU
yarn train:value --data docs/sim-runs/dataset-q-combined.jsonl --target blend \
  --out packages/subspace-lattice/src/lib/ai/weights/value-mlp-v3.json

# Apple GPU (MPS) / CUDA — watch Activity Monitor → GPU
yarn train:value:gpu --data docs/sim-runs/dataset-q-combined-v5.jsonl --target blend \
  --hidden 128,64 --epochs 80 --batch 512 \
  --out packages/subspace-lattice/src/lib/ai/weights/value-mlp-v4-gpu.json

yarn neural:strength-bar --weights packages/subspace-lattice/src/lib/ai/weights/value-mlp-v4-gpu.json \
  --deep-sims 40 --games 2 --jobs 10
```

**Note:** Dataset labeling (`--label-sims` MCTS) is still CPU — that is where wall-clock goes, not training. Game inference stays portable CPU matmul until Phase D (Core ML / WebGPU).

Ladders print per-game progress (`onGameComplete`). Strength-bar / stub-ladder stay quiet until each game ends — fans may not spin on M4 Max (single-thread Node).

Opt-in at runtime via `createMlpNeuralValue(weights)` + `setNeuralValueEvaluator`. Shipping Deep still uses heuristic until human-gated (ADR 002 / 007).
