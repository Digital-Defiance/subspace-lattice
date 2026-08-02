/**
 * Tiny MLP value net for Deep Lattice (ADR 007 Phase B).
 * Pure CPU matmul — no native deps. Input = encodePosition features.
 */
import {
  ENCODER_FEATURE_COUNT,
  ENCODING_VERSION,
} from './position-encoder';

export interface MlpValueWeights {
  encodingVersion: typeof ENCODING_VERSION;
  featureCount: number;
  hidden: number[];
  /** Flattened row-major layers: [W0, b0, W1, b1, ...] */
  layers: Array<{
    /** out × in, row-major */
    w: number[];
    b: number[];
    in: number;
    out: number;
  }>;
  /** Trained to predict z ∈ {-1,+1}; multiply by scale in evaluate. */
  trainedAt?: string;
  trainMeta?: Record<string, number | string>;
}

export function assertMlpWeights(w: MlpValueWeights): void {
  if (w.encodingVersion !== ENCODING_VERSION) {
    throw new Error(
      `MLP encodingVersion ${w.encodingVersion} ≠ encoder ${ENCODING_VERSION}`,
    );
  }
  if (w.featureCount !== ENCODER_FEATURE_COUNT) {
    throw new Error(
      `MLP featureCount ${w.featureCount} ≠ ${ENCODER_FEATURE_COUNT}`,
    );
  }
  if (!w.layers.length) throw new Error('MLP has no layers');
  let expectedIn = w.featureCount;
  for (const layer of w.layers) {
    if (layer.in !== expectedIn) {
      throw new Error(`MLP layer in ${layer.in} ≠ expected ${expectedIn}`);
    }
    if (layer.w.length !== layer.out * layer.in) {
      throw new Error('MLP weight size mismatch');
    }
    if (layer.b.length !== layer.out) {
      throw new Error('MLP bias size mismatch');
    }
    expectedIn = layer.out;
  }
  if (w.layers[w.layers.length - 1]!.out !== 1) {
    throw new Error('MLP final layer must be size 1');
  }
}

function relu(x: number): number {
  return x > 0 ? x : 0;
}

function tanh(x: number): number {
  if (x > 20) return 1;
  if (x < -20) return -1;
  const e2 = Math.exp(2 * x);
  return (e2 - 1) / (e2 + 1);
}

/**
 * Forward: features → scalar in (-1, 1) (tanh). Side-to-move relative.
 */
export function mlpValueForward(
  weights: MlpValueWeights,
  features: ArrayLike<number>,
): number {
  if (features.length !== weights.featureCount) {
    throw new Error(
      `features length ${features.length} ≠ ${weights.featureCount}`,
    );
  }
  let cur = new Float32Array(features.length);
  for (let i = 0; i < features.length; i++) cur[i] = features[i]!;

  for (let li = 0; li < weights.layers.length; li++) {
    const layer = weights.layers[li]!;
    const next = new Float32Array(layer.out);
    const last = li === weights.layers.length - 1;
    for (let o = 0; o < layer.out; o++) {
      let sum = layer.b[o]!;
      const row = o * layer.in;
      for (let i = 0; i < layer.in; i++) {
        sum += layer.w[row + i]! * cur[i]!;
      }
      next[o] = last ? tanh(sum) : relu(sum);
    }
    cur = next;
  }
  return cur[0]!;
}

/** Xavier/Glorot uniform init for a dense layer. */
export function initDenseLayer(
  out: number,
  inn: number,
  rng: () => number,
): { w: number[]; b: number[]; in: number; out: number } {
  const limit = Math.sqrt(6 / (inn + out));
  const w = new Array<number>(out * inn);
  for (let i = 0; i < w.length; i++) {
    w[i] = (rng() * 2 - 1) * limit;
  }
  const b = new Array<number>(out).fill(0);
  return { w, b, in: inn, out };
}

export function createMlpWeights(options: {
  hidden: number[];
  rng: () => number;
}): MlpValueWeights {
  const hidden = options.hidden;
  const layers: MlpValueWeights['layers'] = [];
  let prev = ENCODER_FEATURE_COUNT;
  for (const h of hidden) {
    layers.push(initDenseLayer(h, prev, options.rng));
    prev = h;
  }
  layers.push(initDenseLayer(1, prev, options.rng));
  return {
    encodingVersion: ENCODING_VERSION,
    featureCount: ENCODER_FEATURE_COUNT,
    hidden: [...hidden],
    layers,
  };
}
