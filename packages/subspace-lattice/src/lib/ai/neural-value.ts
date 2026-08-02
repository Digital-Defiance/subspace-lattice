/**
 * Pluggable neural leaf value for Deep Lattice (ADR 007).
 * Default: unset → heuristic only. Load MLP weights via createMlpNeuralValue.
 * (Do not import node:fs here — this module ships in the Vite graph.)
 */
import { SubspaceLatticeEngine } from '../game-engine';
import { PlayerColor } from '../interfaces/playerColor';
import {
  ENCODER_FEATURE_COUNT,
  ENCODING_VERSION,
  encodePosition,
} from './position-encoder';
import {
  assertMlpWeights,
  mlpValueForward,
  type MlpValueWeights,
} from './mlp-value';

export type NeuralValueFn = (
  engine: SubspaceLatticeEngine,
  perspective: PlayerColor,
) => number | null;

let activeEvaluator: NeuralValueFn | null = null;

export function setNeuralValueEvaluator(fn: NeuralValueFn | null): void {
  activeEvaluator = fn;
}

export function getNeuralValueEvaluator(): NeuralValueFn | null {
  return activeEvaluator;
}

/**
 * Stub forward: sparse linear readout of encoder scalars + piece occupancy.
 * Weak on purpose — used to prove evaluatePosition wiring and ladder harness.
 */
export function createStubNeuralValue(options?: {
  /** Scale output into heuristic-ish range. Default 50. */
  scale?: number;
}): NeuralValueFn {
  const scale = options?.scale ?? 50;
  const weights = new Float32Array(ENCODER_FEATURE_COUNT);
  let h = ENCODING_VERSION * 2654435761;
  for (let i = 0; i < weights.length; i++) {
    h = Math.imul(h ^ i, 1597334677);
    weights[i] = ((h >>> 0) / 0xffffffff) * 2 - 1;
  }

  return (engine, perspective) => {
    const stm = engine.getState().currentPlayer;
    const enc = encodePosition(engine);
    let sum = 0;
    const f = enc.features;
    for (let i = 0; i < f.length; i++) {
      sum += f[i]! * weights[i]!;
    }
    const value = (sum / Math.sqrt(ENCODER_FEATURE_COUNT)) * scale;
    return perspective === stm ? value : -value;
  };
}

/**
 * Trained MLP leaf. Output ∈ (-1,1) × scale (default 200) to match MCTS
 * logistic `1/(1+exp(-eval/200))`.
 */
export function createMlpNeuralValue(
  weights: MlpValueWeights,
  options?: { scale?: number },
): NeuralValueFn {
  assertMlpWeights(weights);
  const scale = options?.scale ?? 200;
  return (engine, perspective) => {
    const stm = engine.getState().currentPlayer;
    const enc = encodePosition(engine);
    const v = mlpValueForward(weights, enc.features) * scale;
    return perspective === stm ? v : -v;
  };
}

/** Run active neural evaluator, or null if unset / abstaining. */
export function tryNeuralValue(
  engine: SubspaceLatticeEngine,
  perspective: PlayerColor,
): number | null {
  if (!activeEvaluator) return null;
  return activeEvaluator(engine, perspective);
}

export type { MlpValueWeights };
export { mlpValueForward, assertMlpWeights } from './mlp-value';
