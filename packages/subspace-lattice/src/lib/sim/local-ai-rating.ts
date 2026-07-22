/**
 * Local-AI rating updates against fixed TEI AI anchors (Warp points track).
 * Used by Cloud Functions (`reportLatticeLocalAiMatch`) and unit tests.
 */
import type { AiStrengthId } from '../ai/mcts-ai';
import {
  applyMatchResult,
  createRating,
  type Rating,
} from './ratings';
import { getTeiDisplay, TEI_AI_ANCHORS, type TeiDisplay } from './tei-grade';

export function aiAnchorRatingForStrength(strength: AiStrengthId): Rating {
  const anchor =
    strength === 'strong'
      ? TEI_AI_ANCHORS.commander
      : strength === 'normal'
        ? TEI_AI_ANCHORS.lieutenant
        : TEI_AI_ANCHORS.ensign;
  return createRating(anchor.mu, anchor.sigma);
}

export interface LocalAiRatingPrior {
  mu?: number;
  sigma?: number;
  matches?: number;
  wins?: number;
}

export interface LocalAiRatingUpdate {
  mu: number;
  sigma: number;
  matches: number;
  wins: number;
  displayGrade: string;
  tei: TeiDisplay;
}

/**
 * Apply one human-vs-AI result. Human is treated as White in OpenSkill update
 * for a consistent seat (does not mirror board color).
 */
export function rateLocalAiMatch(
  prior: LocalAiRatingPrior | undefined,
  strength: AiStrengthId,
  humanWon: boolean,
): LocalAiRatingUpdate {
  const human = createRating(prior?.mu, prior?.sigma);
  const ai = aiAnchorRatingForStrength(strength);
  const next = applyMatchResult(human, ai, humanWon ? 'white' : 'black');
  const matches = (prior?.matches ?? 0) + 1;
  const wins = (prior?.wins ?? 0) + (humanWon ? 1 : 0);
  const tei = getTeiDisplay({
    mu: next.white.mu,
    sigma: next.white.sigma,
    matches,
  });
  return {
    mu: next.white.mu,
    sigma: next.white.sigma,
    matches,
    wins,
    displayGrade: tei.formatted,
    tei,
  };
}
