import { describe, expect, it } from 'vitest';
import {
  applyMatchResult,
  calibrationPairAccuracy,
  createRating,
  meanAdjacentOrdinalGap,
  meanSigma,
  toAgentSkill,
} from './ratings';
import { HeuristicAi } from '../ai/heuristic-ai';
import { RandomLegalAgent } from '../ai/random-legal-agent';
import { resolveRulesConfig } from '../rules/rules-config';
import { formatLadderReport, runLadder } from './ladder';

describe('OpenSkill ratings', () => {
  it('raises winner mu and ordinal after a decisive match', () => {
    const a = createRating();
    const b = createRating();
    const next = applyMatchResult(a, b, 'white');
    expect(next.white.mu).toBeGreaterThan(a.mu);
    expect(next.black.mu).toBeLessThan(b.mu);
    expect(toAgentSkill('w', next.white).ordinal).toBeGreaterThan(
      toAgentSkill('b', next.black).ordinal,
    );
  });

  it('treats draws as tied ranks', () => {
    const a = createRating();
    const b = createRating();
    const next = applyMatchResult(a, b, 'draw');
    // Sigmas should shrink slightly; mus stay close for equal priors
    expect(Math.abs(next.white.mu - next.black.mu)).toBeLessThan(0.01);
    expect(next.white.sigma).toBeLessThanOrEqual(a.sigma + 1e-9);
  });

  it('calibrationPairAccuracy scores monotonic order', () => {
    const skills = {
      strong: {
        name: 'strong',
        mu: 30,
        sigma: 2,
        ordinal: 24,
        tei: toAgentSkill('strong', createRating(30, 2)).tei,
      },
      mid: {
        name: 'mid',
        mu: 25,
        sigma: 2,
        ordinal: 19,
        tei: toAgentSkill('mid', createRating(25, 2)).tei,
      },
      weak: {
        name: 'weak',
        mu: 20,
        sigma: 2,
        ordinal: 14,
        tei: toAgentSkill('weak', createRating(20, 2)).tei,
      },
    };
    const ok = calibrationPairAccuracy(skills, ['strong', 'mid', 'weak']);
    expect(ok.score).toBe(1);
    expect(meanAdjacentOrdinalGap(skills, ['strong', 'mid', 'weak'])).toBe(5);
    expect(meanSigma(skills, ['strong', 'mid', 'weak'])).toBe(2);
    const bad = calibrationPairAccuracy(skills, ['weak', 'mid', 'strong']);
    expect(bad.score).toBe(0);
  });
});

describe('ladder OpenSkill yardstick', () => {
  it('ranks heuristic above random-legal on classic', () => {
    const ladder = runLadder({
      rules: resolveRulesConfig('classic'),
      gamesPerPairing: 4,
      seed: 5,
      maxPlies: 120,
      createAgents: (rng) => [
        new RandomLegalAgent(rng),
        new HeuristicAi(rng),
      ],
      expectedOrder: ['heuristic', 'random-legal'],
    });
    expect(ladder.openskill.heuristic!.ordinal).toBeGreaterThan(
      ladder.openskill['random-legal']!.ordinal,
    );
    expect(ladder.calibration?.score).toBe(1);
    expect(ladder.ranking[0]!.name).toBe('heuristic');
    expect(ladder.ranking[0]!.tei.formatted).toMatch(/^[EVCIP]\d{2}$/);
    expect(formatLadderReport(ladder)).toContain('TEI');
  });
});
