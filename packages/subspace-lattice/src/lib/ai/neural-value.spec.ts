import { afterEach, describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from '../game-engine';
import { PlayerColor } from '../interfaces/playerColor';
import { resolveRulesConfig } from '../rules/rules-config';
import { evaluatePosition } from './evaluate';
import {
  createStubNeuralValue,
  setNeuralValueEvaluator,
} from './neural-value';

describe('neural value hook', () => {
  afterEach(() => {
    setNeuralValueEvaluator(null);
  });

  it('falls back to heuristic when unset', () => {
    const engine = new SubspaceLatticeEngine({
      rules: resolveRulesConfig('hybrid-fleet'),
    });
    const h = evaluatePosition(engine, PlayerColor.White);
    expect(Number.isFinite(h)).toBe(true);
    expect(Math.abs(h)).toBeLessThan(50_000);
  });

  it('uses neural when set (non-terminal)', () => {
    setNeuralValueEvaluator(() => 1234);
    const engine = new SubspaceLatticeEngine({
      rules: resolveRulesConfig('hybrid-fleet'),
    });
    expect(evaluatePosition(engine, PlayerColor.White)).toBe(1234);
  });

  it('stub is deterministic and STM-relative', () => {
    const stub = createStubNeuralValue({ scale: 40 });
    setNeuralValueEvaluator(stub);
    const engine = new SubspaceLatticeEngine({
      rules: resolveRulesConfig('hybrid-fleet'),
    });
    const a = evaluatePosition(engine, PlayerColor.White);
    const b = evaluatePosition(engine, PlayerColor.White);
    expect(a).toBe(b);
    expect(evaluatePosition(engine, PlayerColor.Black)).toBeCloseTo(-a, 5);
  });
});
