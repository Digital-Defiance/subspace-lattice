/**
 * TEI Grade System — re-exported from warp12-engine (single source of truth).
 * Format "E97": letter = confidence (σ), number = skill from μ − 3σ.
 */
export type {
  TeiGrade,
  TeiDisplay,
  TeiScoreConfig,
  PlayerRating,
  TeiRankId,
  TeiRank,
} from 'warp12-engine';

export {
  DEFAULT_TEI_CONFIG,
  getTeiGrade,
  getTeiScore,
  getTeiDisplay,
  isTeiProvisional,
  getTeiGradeName,
  getTeiGradeDescription,
  getTeiGradeColor,
  previewTeiChange,
  INITIAL_ANCHORS,
  getAIAnchor,
  TEI_RANKS,
  compareTeiDisplay,
  getTeiRank,
  getTeiRankFromFormatted,
  isFlagOfficerRank,
  parseTeiFormatted,
} from 'warp12-engine';

/** Alias kept for earlier Subspace call sites. */
export { DEFAULT_TEI_CONFIG as DEFAULT_TEI_SCORE_CONFIG } from 'warp12-engine';

import type { PlayerRating } from 'warp12-engine';

/**
 * Local-AI OpenSkill anchors for Fast / Normal / Strong.
 *
 * Calibrated 2026-07-21 under `hybrid-fleet` (heuristic / mcts-50 / mcts-200
 * round-robin, 8 games/pairing, seed 20260721 — see
 * `docs/sim-runs/evolve-20260721-ai-tier-calibration.jsonl`).
 * μ from measured ladder; σ uses tight “known opponent” values so display
 * letters match Warp-style officer tracks (not provisional ladder σ).
 *
 * Display TEI: Fast P0 · Normal I10 · Strong I52.
 */
export const TEI_AI_ANCHORS = {
  ensign: {
    mu: 13.5,
    sigma: 4.0,
    matches: 999,
    label: 'Ensign',
  },
  lieutenant: {
    mu: 24.5,
    sigma: 3.5,
    matches: 999,
    label: 'Lieutenant',
  },
  commander: {
    mu: 40.0,
    sigma: 3.0,
    matches: 999,
    label: 'Commander',
  },
} as const satisfies Record<string, PlayerRating & { label: string }>;
