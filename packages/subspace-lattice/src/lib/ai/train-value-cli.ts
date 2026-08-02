/**
 * Train MLP value net on dataset JSONL → weights JSON.
 * Bundled by scripts/train-value.sh — not imported from browser.
 *
 * Usage:
 *   yarn train:value --data docs/sim-runs/dataset.jsonl \
 *     --out packages/subspace-lattice/src/lib/ai/weights/value-mlp-v1.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createSeededRng } from './rng';
import {
  assertMlpWeights,
  createMlpWeights,
  mlpValueForward,
  type MlpValueWeights,
} from './mlp-value';
import { ENCODER_FEATURE_COUNT, ENCODING_VERSION } from './position-encoder';

interface Sample {
  features: Float32Array;
  z: number;
}

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  return argv[i + 1];
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

function loadJsonl(
  file: string,
  target: 'z' | 'q' | 'blend',
  blendAlpha: number,
): Sample[] {
  const text = readFileSync(file, 'utf8');
  const out: Sample[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as {
      encodingVersion?: number;
      features: number[];
      z: number;
      q?: number;
    };
    if (row.encodingVersion != null && row.encodingVersion !== ENCODING_VERSION) {
      continue;
    }
    if (!Array.isArray(row.features) || row.features.length !== ENCODER_FEATURE_COUNT) {
      continue;
    }
    const hasQ = row.q != null && Number.isFinite(row.q);
    const hasZ = row.z === 1 || row.z === -1;
    let y: number | null = null;
    if (target === 'q') {
      if (hasQ) y = Math.max(-1, Math.min(1, row.q!));
    } else if (target === 'blend') {
      if (hasQ && hasZ) {
        y = blendAlpha * row.z + (1 - blendAlpha) * row.q!;
      } else if (hasQ) {
        y = row.q!;
      } else if (hasZ) {
        y = row.z;
      }
    } else {
      // z
      if (hasZ) y = row.z;
    }
    if (y == null) continue;
    out.push({
      features: Float32Array.from(row.features),
      z: y,
    });
  }
  return out;
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function cloneWeights(w: MlpValueWeights): MlpValueWeights {
  return {
    ...w,
    hidden: [...w.hidden],
    layers: w.layers.map((l) => ({
      in: l.in,
      out: l.out,
      w: [...l.w],
      b: [...l.b],
    })),
  };
}

/**
 * One SGD step with MSE loss on tanh output vs z.
 * Backprop through ReLU hidden + tanh out.
 */
function trainStep(
  weights: MlpValueWeights,
  features: Float32Array,
  target: number,
  lr: number,
): number {
  // Forward with activations stored
  const acts: Float32Array[] = [features];
  const pres: Float32Array[] = []; // pre-activation

  let cur = features;
  for (let li = 0; li < weights.layers.length; li++) {
    const layer = weights.layers[li]!;
    const pre = new Float32Array(layer.out);
    const act = new Float32Array(layer.out);
    const last = li === weights.layers.length - 1;
    for (let o = 0; o < layer.out; o++) {
      let sum = layer.b[o]!;
      const row = o * layer.in;
      for (let i = 0; i < layer.in; i++) {
        sum += layer.w[row + i]! * cur[i]!;
      }
      pre[o] = sum;
      if (last) {
        // tanh
        if (sum > 20) act[o] = 1;
        else if (sum < -20) act[o] = -1;
        else {
          const e2 = Math.exp(2 * sum);
          act[o] = (e2 - 1) / (e2 + 1);
        }
      } else {
        act[o] = sum > 0 ? sum : 0;
      }
    }
    pres.push(pre);
    acts.push(act);
    cur = act;
  }

  const pred = acts[acts.length - 1]![0]!;
  const err = pred - target;
  const loss = 0.5 * err * err;

  // dL/dpred = err; d tanh / dpre = 1 - tanh^2
  let delta = new Float32Array(1);
  delta[0] = err * (1 - pred * pred);

  for (let li = weights.layers.length - 1; li >= 0; li--) {
    const layer = weights.layers[li]!;
    const input = acts[li]!;
    const pre = pres[li]!;
    const nextDelta = new Float32Array(layer.in);

    for (let o = 0; o < layer.out; o++) {
      const d = delta[o]!;
      layer.b[o]! -= lr * d;
      const row = o * layer.in;
      for (let i = 0; i < layer.in; i++) {
        const wIdx = row + i;
        nextDelta[i]! += d * layer.w[wIdx]!;
        layer.w[wIdx]! -= lr * d * input[i]!;
      }
    }

    if (li === 0) break;
    // ReLU backward on previous layer's activation
    const prevPre = pres[li - 1]!;
    for (let i = 0; i < nextDelta.length; i++) {
      if (prevPre[i]! <= 0) nextDelta[i] = 0;
    }
    delta = nextDelta;
  }

  return loss;
}

function metrics(weights: MlpValueWeights, samples: Sample[]): {
  loss: number;
  signAcc: number;
} {
  let loss = 0;
  let correct = 0;
  for (const s of samples) {
    const pred = mlpValueForward(weights, s.features);
    const err = pred - s.z;
    loss += 0.5 * err * err;
    if ((pred >= 0 && s.z > 0) || (pred < 0 && s.z < 0)) correct += 1;
  }
  return {
    loss: loss / Math.max(1, samples.length),
    signAcc: correct / Math.max(1, samples.length),
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, '--help') || argv.length === 0) {
    console.log(`Usage:
  train:value --data FILE.jsonl --out FILE.json
    [--target z|q|blend] [--blend-alpha 0.35]
    [--hidden 64,32] [--epochs 40] [--lr 0.01] [--batch 32] [--seed 7]
    [--val 0.15]`);
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const dataPath = argValue(argv, '--data');
  const outPath = argValue(argv, '--out');
  if (!dataPath || !outPath) {
    console.error('train:value — --data and --out required');
    process.exit(1);
  }

  const targetRaw = argValue(argv, '--target') ?? 'z';
  const target =
    targetRaw === 'q' || targetRaw === 'blend' || targetRaw === 'z'
      ? targetRaw
      : 'z';
  const blendAlpha = Number(argValue(argv, '--blend-alpha') ?? '0.35');

  const hidden = (argValue(argv, '--hidden') ?? '64,32')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => n > 0);
  const epochs = Number(argValue(argv, '--epochs') ?? '40');
  const lr = Number(argValue(argv, '--lr') ?? '0.01');
  const batch = Number(argValue(argv, '--batch') ?? '32');
  const seed = Number(argValue(argv, '--seed') ?? '7');
  const valFrac = Number(argValue(argv, '--val') ?? '0.15');

  const all = loadJsonl(dataPath, target, blendAlpha);
  if (all.length < 50) {
    console.error(
      `train:value — need ≥50 labeled samples for target=${target}, got ${all.length}`,
    );
    process.exit(1);
  }

  const rng = createSeededRng(seed);
  shuffleInPlace(all, rng);
  const valN = Math.max(1, Math.floor(all.length * valFrac));
  const val = all.slice(0, valN);
  const train = all.slice(valN);

  console.log(
    `train:value — ${train.length} train / ${val.length} val · target=${target} · hidden=[${hidden.join(',')}] · epochs=${epochs}`,
  );

  let weights = createMlpWeights({ hidden, rng });
  assertMlpWeights(weights);
  let best = cloneWeights(weights);
  let bestVal = -1;

  for (let ep = 1; ep <= epochs; ep++) {
    shuffleInPlace(train, rng);
    let epLoss = 0;
    let n = 0;
    for (let i = 0; i < train.length; i += batch) {
      const end = Math.min(train.length, i + batch);
      for (let j = i; j < end; j++) {
        const s = train[j]!;
        epLoss += trainStep(weights, s.features, s.z, lr);
        n += 1;
      }
    }
    const tr = metrics(weights, train);
    const va = metrics(weights, val);
    if (va.signAcc >= bestVal) {
      bestVal = va.signAcc;
      best = cloneWeights(weights);
    }
    if (ep === 1 || ep % 5 === 0 || ep === epochs) {
      console.log(
        `  epoch ${ep}: train loss ${(epLoss / Math.max(1, n)).toFixed(4)} acc ${(tr.signAcc * 100).toFixed(1)}% · val acc ${(va.signAcc * 100).toFixed(1)}%`,
      );
    }
  }

  best.trainedAt = new Date().toISOString();
  best.trainMeta = {
    samples: all.length,
    train: train.length,
    val: val.length,
    epochs,
    lr,
    bestValAcc: bestVal,
    target,
    blendAlpha,
    data: path.basename(dataPath),
  };
  assertMlpWeights(best);

  mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  writeFileSync(outPath, JSON.stringify(best), 'utf8');
  const finalVal = metrics(best, val);
  console.log(
    `train:value — wrote ${outPath} (val sign-acc ${(finalVal.signAcc * 100).toFixed(1)}%)`,
  );
}

main();
