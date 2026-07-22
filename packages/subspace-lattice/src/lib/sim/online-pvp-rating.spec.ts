import { describe, expect, it } from 'vitest';
import {
  onlineRatingEventId,
  rateOnlinePvpMatch,
} from './online-pvp-rating';

describe('online-pvp-rating', () => {
  it('builds a stable event id', () => {
    expect(onlineRatingEventId('abc')).toBe('online:abc');
  });

  it('updates both seats and awards the win', () => {
    const next = rateOnlinePvpMatch(
      { mu: 25, sigma: 8, matches: 2, wins: 1 },
      { mu: 25, sigma: 8, matches: 2, wins: 1 },
      'white',
    );
    expect(next.white.matches).toBe(3);
    expect(next.black.matches).toBe(3);
    expect(next.white.wins).toBe(2);
    expect(next.black.wins).toBe(1);
    expect(next.white.mu).toBeGreaterThan(25);
    expect(next.black.mu).toBeLessThan(25);
    expect(next.white.displayGrade).toMatch(/^[A-Z]\d{1,2}$/);
    expect(next.black.displayGrade).toMatch(/^[A-Z]\d{1,2}$/);
  });

  it('starts from default OpenSkill priors when unset', () => {
    const next = rateOnlinePvpMatch(undefined, undefined, 'black');
    expect(next.black.wins).toBe(1);
    expect(next.white.wins).toBe(0);
    expect(next.black.mu).toBeGreaterThan(next.white.mu);
  });
});
