/**
 * Online human-vs-human OpenSkill updates (separate track from local AI).
 */
import { applyMatchResult, createRating, type Rating } from './ratings';
import { getTeiDisplay, type TeiDisplay } from './tei-grade';

export interface OnlineRatingPrior {
  mu?: number;
  sigma?: number;
  matches?: number;
  wins?: number;
}

export interface OnlineSeatUpdate {
  mu: number;
  sigma: number;
  matches: number;
  wins: number;
  displayGrade: string;
  tei: TeiDisplay;
}

export interface OnlinePvpRatingUpdate {
  white: OnlineSeatUpdate;
  black: OnlineSeatUpdate;
}

function seatUpdate(
  prior: OnlineRatingPrior | undefined,
  next: Rating,
  won: boolean,
): OnlineSeatUpdate {
  const matches = (prior?.matches ?? 0) + 1;
  const wins = (prior?.wins ?? 0) + (won ? 1 : 0);
  const tei = getTeiDisplay({
    mu: next.mu,
    sigma: next.sigma,
    matches,
  });
  return {
    mu: next.mu,
    sigma: next.sigma,
    matches,
    wins,
    displayGrade: tei.formatted,
    tei,
  };
}

/**
 * Apply one White-vs-Black human result. Priors are board seats (not viewer).
 */
export function rateOnlinePvpMatch(
  priorWhite: OnlineRatingPrior | undefined,
  priorBlack: OnlineRatingPrior | undefined,
  winner: 'white' | 'black',
): OnlinePvpRatingUpdate {
  const white = createRating(priorWhite?.mu, priorWhite?.sigma);
  const black = createRating(priorBlack?.mu, priorBlack?.sigma);
  const next = applyMatchResult(white, black, winner);
  return {
    white: seatUpdate(priorWhite, next.white, winner === 'white'),
    black: seatUpdate(priorBlack, next.black, winner === 'black'),
  };
}

/** Idempotency key for latticeRatingEvents. */
export function onlineRatingEventId(roomId: string): string {
  return `online:${roomId}`;
}
