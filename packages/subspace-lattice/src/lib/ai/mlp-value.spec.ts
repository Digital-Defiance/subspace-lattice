import { describe, expect, it } from 'vitest';
import { createSeededRng } from './rng';
import {
  assertMlpWeights,
  createMlpWeights,
  mlpValueForward,
} from './mlp-value';
import { ENCODER_FEATURE_COUNT } from './position-encoder';
import { createMlpNeuralValue, setNeuralValueEvaluator } from './neural-value';
import { SubspaceLatticeEngine } from '../game-engine';
import { PlayerColor } from '../interfaces/playerColor';
import { resolveRulesConfig } from '../rules/rules-config';
import { evaluatePosition } from './evaluate';
import { afterEach } from 'vitest';

describe('mlp value', () => {
  afterEach(() => setNeuralValueEvaluator(null));

  it('forwards a finite tanh value', () => {
    const w = createMlpWeights({
      hidden: [8],
      rng: createSeededRng(1),
    });
    assertMlpWeights(w);
    const features = new Float32Array(ENCODER_FEATURE_COUNT);
    features[0] = 1;
    features[100] = 1;
    const v = mlpValueForward(w, features);
    expect(v).toBeGreaterThan(-1);
    expect(v).toBeLessThan(1);
  });

  it('hooks into evaluatePosition via createMlpNeuralValue', () => {
    const w = createMlpWeights({
      hidden: [8],
      rng: createSeededRng(2),
    });
    setNeuralValueEvaluator(createMlpNeuralValue(w, { scale: 200 }));
    const engine = new SubspaceLatticeEngine({
      rules: resolveRulesConfig('hybrid-fleet'),
    });
    const score = evaluatePosition(engine, PlayerColor.White);
    expect(Number.isFinite(score)).toBe(true);
    expect(Math.abs(score)).toBeLessThanOrEqual(200.0001);
  });
});
