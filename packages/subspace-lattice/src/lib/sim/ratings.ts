/**
 * OpenSkill (Weng–Lin) ratings for AI ladder calibration.
 *
 * Prefer OpenSkill over Elo here: explicit uncertainty (sigma), better with
 * sparse round-robin matchups, and ordinal ranking for comparing agents.
 * Elo is retained on the ladder only as a familiar secondary number.
 */
import { ordinal, rate, rating, type Rating } from 'openskill';
import { getTeiDisplay, type TeiDisplay, type TeiGrade } from './tei-grade';

function asPlayerRating(r: Rating) {
  return { mu: r.mu, sigma: r.sigma, matches: 0 };
}

export type { Rating };

export interface AgentSkill {
  name: string;
  mu: number;
  sigma: number;
  /** Conservative display rating: mu − 3·sigma (openskill ordinal). */
  ordinal: number;
  /** TEI presentation (Warp universe): e.g. V46 */
  tei: TeiDisplay;
}

export function createRating(mu?: number, sigma?: number): Rating {
  if (mu !== undefined || sigma !== undefined) {
    return rating({ mu, sigma });
  }
  return rating();
}

export function toAgentSkill(
  name: string,
  r: Rating,
  displayGrade?: TeiGrade,
): AgentSkill {
  return {
    name,
    mu: r.mu,
    sigma: r.sigma,
    ordinal: ordinal(r),
    tei: getTeiDisplay(asPlayerRating(r), displayGrade),
  };
}

/**
 * Update ratings after a 1v1 game.
 * `outcome`: 'white' | 'black' | 'draw' (truncated / no winner).
 */
export function applyMatchResult(
  white: Rating,
  black: Rating,
  outcome: 'white' | 'black' | 'draw',
): { white: Rating; black: Rating } {
  if (outcome === 'draw') {
    const [[w], [b]] = rate(
      [[white], [black]],
      { rank: [1, 1] },
    );
    return { white: w!, black: b! };
  }
  if (outcome === 'white') {
    const [[w], [b]] = rate([[white], [black]]);
    return { white: w!, black: b! };
  }
  const [[b], [w]] = rate([[black], [white]]);
  return { white: w!, black: b! };
}

/** Sort agents by ordinal descending (best first). */
export function rankByOrdinal(
  skills: Record<string, AgentSkill>,
): AgentSkill[] {
  return Object.values(skills).sort((a, b) => b.ordinal - a.ordinal);
}

/**
 * Calibration check: known strength order should be monotonic in ordinals.
 * Returns how many adjacent pairs in `expectedStrongestToWeakest` are correctly ordered.
 */
export function calibrationPairAccuracy(
  skills: Record<string, AgentSkill>,
  expectedStrongestToWeakest: string[],
): { correctPairs: number; totalPairs: number; score: number } {
  let correct = 0;
  const total = Math.max(0, expectedStrongestToWeakest.length - 1);
  for (let i = 0; i < total; i++) {
    const stronger = expectedStrongestToWeakest[i]!;
    const weaker = expectedStrongestToWeakest[i + 1]!;
    const a = skills[stronger];
    const b = skills[weaker];
    if (a && b && a.ordinal >= b.ordinal) correct += 1;
  }
  return {
    correctPairs: correct,
    totalPairs: total,
    score: total === 0 ? 1 : correct / total,
  };
}

/**
 * Mean ordinal gap between adjacent agents in expected strongest→weakest order.
 * Larger gaps = clearer skill separation under this ruleset.
 */
export function meanAdjacentOrdinalGap(
  skills: Record<string, AgentSkill>,
  expectedStrongestToWeakest: string[],
): number {
  const gaps: number[] = [];
  for (let i = 0; i < expectedStrongestToWeakest.length - 1; i++) {
    const stronger = skills[expectedStrongestToWeakest[i]!];
    const weaker = skills[expectedStrongestToWeakest[i + 1]!];
    if (stronger && weaker) {
      gaps.push(stronger.ordinal - weaker.ordinal);
    }
  }
  if (gaps.length === 0) return 0;
  return gaps.reduce((a, b) => a + b, 0) / gaps.length;
}

/** Mean OpenSkill σ across named agents (lower ⇒ more confident ratings). */
export function meanSigma(
  skills: Record<string, AgentSkill>,
  names?: string[],
): number {
  const list = names?.length
    ? names.map((n) => skills[n]).filter(Boolean)
    : Object.values(skills);
  if (list.length === 0) return 0;
  return list.reduce((s, a) => s + a!.sigma, 0) / list.length;
}
