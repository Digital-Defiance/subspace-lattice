# Deep Lattice value weights

| File | In git? | Notes |
|------|---------|-------|
| `value-mlp-v5-gpu.json` | **yes** | Current lab checkpoint (+ mcts-random q dump) |
| `value-mlp-v1`…`v4*.json` | no (gitignored) | Intermediate trains — regenerate locally |

```bash
# CPU (pure TS) — fine for tiny nets, does not use GPU
yarn train:value --data docs/sim-runs/dataset-q-combined.jsonl --target blend \
  --out packages/subspace-lattice/src/lib/ai/weights/value-mlp-v3.json

# Apple GPU (MPS) / CUDA — watch Activity Monitor → GPU
yarn train:value:gpu --data docs/sim-runs/dataset-q-combined-v5.jsonl --target blend \
  --hidden 128,64 --epochs 80 --batch 512 \
  --out packages/subspace-lattice/src/lib/ai/weights/value-mlp-v4-gpu.json

yarn neural:strength-bar --weights packages/subspace-lattice/src/lib/ai/weights/value-mlp-v5-gpu.json \
  --deep-sims 40 --games 2 --jobs 10
```

Datasets under `docs/sim-runs/dataset*.jsonl` are gitignored — rebuild with
`yarn dataset:jsonl` (see [deep-lattice-lab](../../../../docs/deep-lattice-lab.md)).

**Note:** Dataset labeling (`--label-sims` MCTS) is still CPU — that is where wall-clock goes, not training. Game inference stays portable CPU matmul until Phase D (Core ML / WebGPU).

Ladders print per-game progress (`onGameComplete`). Strength-bar / stub-ladder stay quiet until each game ends — fans may not spin on M4 Max (single-thread Node).

Opt-in at runtime via `createMlpNeuralValue(weights)` + `setNeuralValueEvaluator`. Shipping Deep still uses heuristic until human-gated (ADR 002 / 007).
