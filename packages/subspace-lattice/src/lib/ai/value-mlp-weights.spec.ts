import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertMlpWeights,
  mlpValueForward,
  type MlpValueWeights,
} from './mlp-value';
import {
  createMlpNeuralValue,
  setNeuralValueEvaluator,
} from './neural-value';
import { evaluatePosition } from './evaluate';
import { SubspaceLatticeEngine } from '../game-engine';
import { PlayerColor } from '../interfaces/playerColor';
import { resolveRulesConfig } from '../rules/rules-config';
import { ENCODER_FEATURE_COUNT } from './position-encoder';

const here = path.dirname(fileURLToPath(import.meta.url));
const weightsDir = path.join(here, 'weights');

function loadIfPresent(name: string): MlpValueWeights | null {
  const file = path.join(weightsDir, name);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as MlpValueWeights;
}

describe('shipped MLP weights', () => {
  afterEach(() => setNeuralValueEvaluator(null));

  it('loads value-mlp-v4-gpu.json when present', () => {
    const w = loadIfPresent('value-mlp-v4-gpu.json');
    if (!w) {
      expect(true).toBe(true);
      return;
    }
    assertMlpWeights(w);
    expect(w.featureCount).toBe(ENCODER_FEATURE_COUNT);
    expect(w.hidden).toEqual([128, 64]);
    const features = new Float32Array(ENCODER_FEATURE_COUNT);
    features[0] = 1;
    const v = mlpValueForward(w, features);
    expect(v).toBeGreaterThan(-1);
    expect(v).toBeLessThan(1);

    setNeuralValueEvaluator(createMlpNeuralValue(w));
    const engine = new SubspaceLatticeEngine({
      rules: resolveRulesConfig('hybrid-fleet'),
    });
    const score = evaluatePosition(engine, PlayerColor.White);
    expect(Number.isFinite(score)).toBe(true);
  });

  it('loads value-mlp-v3-gpu.json when present', () => {
    const w = loadIfPresent('value-mlp-v3-gpu.json');
    if (!w) {
      expect(true).toBe(true);
      return;
    }
    assertMlpWeights(w);
    expect(w.featureCount).toBe(ENCODER_FEATURE_COUNT);
    expect(w.hidden).toEqual([128, 64]);
    const features = new Float32Array(ENCODER_FEATURE_COUNT);
    features[0] = 1;
    const v = mlpValueForward(w, features);
    expect(v).toBeGreaterThan(-1);
    expect(v).toBeLessThan(1);

    setNeuralValueEvaluator(createMlpNeuralValue(w));
    const engine = new SubspaceLatticeEngine({
      rules: resolveRulesConfig('hybrid-fleet'),
    });
    const score = evaluatePosition(engine, PlayerColor.White);
    expect(Number.isFinite(score)).toBe(true);
    expect(Math.abs(score)).toBeLessThanOrEqual(200.0001);
  });
});
