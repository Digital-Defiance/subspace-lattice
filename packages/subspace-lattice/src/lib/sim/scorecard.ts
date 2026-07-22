import { Agent } from '../ai/agent';
import { HeuristicAi } from '../ai/heuristic-ai';
import { MctsAi } from '../ai/mcts-ai';
import { RandomLegalAgent } from '../ai/random-legal-agent';
import { createSeededRng } from '../ai/rng';
import { WinnerReason } from '../interfaces/gameState';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { RulesConfig } from '../rules/rules-config';
import { runLadder } from './ladder';
import { MatchResult, playMatch } from './match-runner';
import { rulesConfigId } from './param-space';
import {
  calibrationPairAccuracy,
  meanAdjacentOrdinalGap,
  meanSigma,
  type AgentSkill,
} from './ratings';

/**
 * Win-path telemetry: Sector Integration is an endgame clock, not a 50/50
 * primary goal. Prefer ~25–40% sector among decided games, with sector
 * resolutions later than hub captures (clock signature).
 */
export interface WinPathStats {
  /** Share of decided games ending in hub capture. */
  hubCaptureRate: number;
  /** Share of decided games ending in sector integration. */
  sectorIntegrationRate: number;
  /** Share of decided games ending in no-moves. */
  noMovesRate: number;
  decidedGames: number;
  hubSampleCount: number;
  sectorSampleCount: number;
  medianHubPlies: number | null;
  medianSectorPlies: number | null;
  /**
   * true when both paths have ≥ minClockSamples and median(sector) > median(hub).
   * null when either path lacks enough samples to hard-judge.
   */
  clockSignature: boolean | null;
}

/** OpenSkill structure of a mini skill ladder under this ruleset. */
export interface OpenSkillSkillStats {
  /** Adjacent-pair accuracy vs expected strength order (0–1). */
  calibration: number;
  /** Mean ordinal gap between adjacent expected tiers (higher = sharper). */
  separation: number;
  /** Mean σ after the ladder (lower = more confident). */
  meanSigma: number;
  expectedOrder: string[];
  /** Games played on the skill ladder (all directed pairings). */
  ladderGames: number;
}

export interface WinPathCounts {
  total: number;
  hubCapture: number;
  sectorIntegration: number;
  noMoves: number;
}

/** Raw outcome counts. Never hide color balance behind the derived score. */
export type WinsByColorAndPath = Record<PlayerColor, WinPathCounts>;

export interface Scorecard {
  configId: string;
  rules: RulesConfig;
  /** Design track used for thresholds (`A` fleet / `B` territory). */
  track: EvolutionTrack;
  games: number;
  /** 1 − truncated fraction (fairness matches only). */
  decisiveRate: number;
  /** White win share among decided fairness games (≈0.5 is fair). */
  whiteWinRate: number;
  /** 1 − 2·|whiteWinRate − 0.5| clipped to [0,1] */
  fairness: number;
  /** Decided fairness games grouped by winner and terminal condition. */
  winsByColorAndPath: WinsByColorAndPath;
  /**
   * Legacy strong-vs-random White WR when provided; otherwise mirrors
   * `skillCalibration` so older readers still see a skill signal.
   */
  skillDiscrimination: number;
  /** OpenSkill adjacent-pair calibration (0–1). */
  skillCalibration: number;
  /** OpenSkill mean adjacent ordinal gap. */
  skillSeparation: number;
  /** OpenSkill mean σ (lower is more confident). */
  skillMeanSigma: number;
  avgPlies: number;
  /** Fraction of fairness games with plies in [minInteresting, maxInteresting]. */
  interestingMidgame: number;
  /** Fraction of fairness games ending in ≤ instantPlies. */
  instantWinRate: number;
  deadlockRate: number;
  winPath: WinPathStats;
  /** Mean infiltrator captures per fairness game. */
  infiltratorCapturesPerGame: number;
  spoolAnnouncesPerGame: number;
  spoolFailuresPerGame: number;
  capturesByMoverType: Partial<Record<PieceType, number>>;
  rejected: boolean;
  rejectReasons: string[];
  /** Higher is better; only set for non-rejected. */
  composite: number;
}

export interface ScorecardThresholds {
  maxInstantWinRate: number;
  maxDeadlockRate: number;
  minDecisiveRate: number;
  /** Legacy strong-vs-random floor (skipped when no legacy skill matches). */
  minSkillDiscrimination: number;
  /** OpenSkill calibration floor (skipped when no skill ladder). */
  minSkillCalibration: number;
  minFairness: number;
  minInterestingPlies: number;
  maxInterestingPlies: number;
  instantPlies: number;
  /** Reject if sector share of decided games is below this (dead mechanic). */
  minSectorIntegrationRate: number;
  /** Reject if sector share exceeds this (hyper-territorial). */
  maxSectorIntegrationRate: number;
  /** Soft preference band for sector-as-clock (composite bonus). */
  sweetSectorMin: number;
  sweetSectorMax: number;
  /**
   * Min hub *and* sector samples before a failed clock is a hard reject.
   * Below this, thin-sample clock failure only down-ranks composite.
   */
  minClockSamples: number;
  /** When both paths are sampled enough, reject if sector is not later. */
  requireClockSignature: boolean;
}

/** Track A: Surgical Strike primary; Sector Integration is a forcing clock. */
export type EvolutionTrack = 'A' | 'B';
export type FairnessAgentKind = 'auto' | 'heuristic' | 'mcts' | 'random';

export const DEFAULT_SCORECARD_THRESHOLDS: ScorecardThresholds = {
  maxInstantWinRate: 0.35,
  maxDeadlockRate: 0.4,
  minDecisiveRate: 0.5,
  minSkillDiscrimination: 0.6,
  minSkillCalibration: 0.5,
  // fairness >= .80 is equivalent to a decided-game color split within 40–60.
  minFairness: 0.8,
  minInterestingPlies: 6,
  maxInterestingPlies: 100,
  instantPlies: 3,
  minSectorIntegrationRate: 0.05,
  maxSectorIntegrationRate: 0.85,
  sweetSectorMin: 0.25,
  sweetSectorMax: 0.4,
  minClockSamples: 8,
  requireClockSignature: true,
};

/**
 * Track A — fleet battle / Surgical Strike primary.
 * Sector must be a real but secondary win path: hard-gate its share of
 * decided games to 15–45% (sweet band 25–40% remains a composite bonus).
 *
 * The clock is validated *functionally*, not by win-time medians: sector
 * pressure mostly cashes out as faster hub captures, so `medSec > medHub`
 * was the wrong operationalization (see ADR 005 and the 2026-07-21 act80
 * counterfactual: disabling sector octupled deadlocks). Use evolve's
 * `--counterfactual` mode to verify clock function; the legacy signature
 * stays a soft composite bonus only.
 */
export const TRACK_A_THRESHOLDS: ScorecardThresholds = {
  ...DEFAULT_SCORECARD_THRESHOLDS,
  minSectorIntegrationRate: 0.15,
  maxSectorIntegrationRate: 0.45,
  requireClockSignature: false,
};

/**
 * Track B — territory co-equal / Sector Integration as a real win path.
 * Looser sector ceiling; no clock-signature hard reject.
 */
export const TRACK_B_THRESHOLDS: ScorecardThresholds = {
  ...DEFAULT_SCORECARD_THRESHOLDS,
  maxSectorIntegrationRate: 0.95,
  sweetSectorMin: 0.45,
  sweetSectorMax: 0.65,
  requireClockSignature: false,
};

export function thresholdsForTrack(track: EvolutionTrack): ScorecardThresholds {
  return track === 'B' ? TRACK_B_THRESHOLDS : TRACK_A_THRESHOLDS;
}

export function isEvolutionTrack(value: unknown): value is EvolutionTrack {
  return value === 'A' || value === 'B';
}

export interface EvaluateRulesOptions {
  rules: RulesConfig;
  seed?: number;
  /** Self-play / mirror games for fairness. */
  fairnessGames?: number;
  /**
   * Skill-ladder budget. Converted to games-per-directed-pairing so total
   * ladder games stay near this count (3 agents ⇒ 6 pairings).
   */
  skillGames?: number;
  maxPlies?: number;
  /**
   * MCTS simulations for fairness self-play. `0` = heuristic vs heuristic
   * (fast unit tests). Evolve CLI defaults to a modest budget so net races
   * are explored more realistically than pure heuristic paint.
   */
  fairnessMctsSims?: number;
  /**
   * Agent family for equal-strength fairness games. `auto` preserves legacy
   * behavior (MCTS when simulations > 0, otherwise heuristic).
   */
  fairnessAgent?: FairnessAgentKind;
  /**
   * MCTS budget for the strong skill-ladder agent. When `0`, reuses
   * `fairnessMctsSims` if that is > 0; otherwise heuristic vs random only.
   */
  skillMctsSims?: number;
  /** Design track for win-path gates. Default `A`. */
  track?: EvolutionTrack;
  thresholds?: Partial<ScorecardThresholds>;
  /**
   * When false, skip the OpenSkill ladder and keep legacy strong-vs-random
   * skillDiscrimination only (fast unit tests). Default true.
   */
  useSkillLadder?: boolean;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function reasonOf(m: MatchResult): WinnerReason | undefined {
  return m.truncated ? undefined : m.winnerReason;
}

export function computeWinPathStats(
  matches: MatchResult[],
  minClockSamples: number,
): WinPathStats {
  const decided = matches.filter((m) => !m.truncated && m.winner);
  const n = decided.length;
  const hubPlies = decided
    .filter((m) => reasonOf(m) === 'hub-capture')
    .map((m) => m.plies);
  const sectorPlies = decided
    .filter((m) => reasonOf(m) === 'sector-integration')
    .map((m) => m.plies);
  const noMoves = decided.filter((m) => reasonOf(m) === 'no-moves').length;

  const medianHubPlies = median(hubPlies);
  const medianSectorPlies = median(sectorPlies);
  let clockSignature: boolean | null = null;
  if (
    hubPlies.length >= minClockSamples &&
    sectorPlies.length >= minClockSamples &&
    medianHubPlies !== null &&
    medianSectorPlies !== null
  ) {
    clockSignature = medianSectorPlies > medianHubPlies;
  }

  return {
    hubCaptureRate: n === 0 ? 0 : hubPlies.length / n,
    sectorIntegrationRate: n === 0 ? 0 : sectorPlies.length / n,
    noMovesRate: n === 0 ? 0 : noMoves / n,
    decidedGames: n,
    hubSampleCount: hubPlies.length,
    sectorSampleCount: sectorPlies.length,
    medianHubPlies,
    medianSectorPlies,
    clockSignature,
  };
}

/** Soft clock score when samples are too thin for a hard verdict. */
function softClockBonus(winPath: WinPathStats): number {
  if (winPath.clockSignature === true) return 1;
  if (winPath.clockSignature === false) return 0;
  if (
    winPath.hubSampleCount >= 2 &&
    winPath.sectorSampleCount >= 2 &&
    winPath.medianHubPlies !== null &&
    winPath.medianSectorPlies !== null
  ) {
    return winPath.medianSectorPlies > winPath.medianHubPlies ? 0.65 : 0.2;
  }
  return 0.5;
}

function sectorSweetSpotScore(
  rate: number,
  min: number,
  max: number,
): number {
  if (rate >= min && rate <= max) return 1;
  if (rate < min) return Math.max(0, rate / min);
  return Math.max(0, 1 - (rate - max) / Math.max(1e-9, 1 - max));
}

/** Map ordinal gap onto [0,1] for composite (≈5+ ordinal points = full credit). */
function separationScore(separation: number): number {
  return Math.max(0, Math.min(1, separation / 5));
}

/** Map mean σ onto [0,1] confidence (OpenSkill prior σ ≈ 8.33). */
function sigmaConfidence(meanSig: number): number {
  return Math.max(0, Math.min(1, 1 - meanSig / 8.333));
}

export function skillStatsFromLadder(
  openskill: Record<string, AgentSkill>,
  expectedOrder: string[],
  ladderGames: number,
): OpenSkillSkillStats {
  const { score } = calibrationPairAccuracy(openskill, expectedOrder);
  return {
    calibration: score,
    separation: meanAdjacentOrdinalGap(openskill, expectedOrder),
    meanSigma: meanSigma(openskill, expectedOrder),
    expectedOrder,
    ladderGames,
  };
}

export function computeWinsByColorAndPath(
  matches: MatchResult[],
): WinsByColorAndPath {
  const empty = (): WinPathCounts => ({
    total: 0,
    hubCapture: 0,
    sectorIntegration: 0,
    noMoves: 0,
  });
  const result: WinsByColorAndPath = {
    [PlayerColor.White]: empty(),
    [PlayerColor.Black]: empty(),
  };

  for (const match of matches) {
    if (match.truncated || !match.winner) continue;
    const counts = result[match.winner];
    counts.total += 1;
    if (match.winnerReason === 'hub-capture') counts.hubCapture += 1;
    if (match.winnerReason === 'sector-integration') {
      counts.sectorIntegration += 1;
    }
    if (match.winnerReason === 'no-moves') counts.noMoves += 1;
  }
  return result;
}

export function scoreMatches(
  configId: string,
  rules: RulesConfig,
  fairnessMatches: MatchResult[],
  skillMatches: MatchResult[],
  thresholds: ScorecardThresholds = DEFAULT_SCORECARD_THRESHOLDS,
  options: {
    track?: EvolutionTrack;
    skillStats?: OpenSkillSkillStats | null;
  } = {},
): Scorecard {
  const track = options.track ?? 'A';
  const skillStats = options.skillStats ?? null;

  // Design rates from equal-strength play only (skill ladder is separate).
  const design = fairnessMatches;
  const decidedFair = design.filter((m) => !m.truncated && m.winner);
  const whiteWins = decidedFair.filter(
    (m) => m.winner === PlayerColor.White,
  ).length;
  const whiteWinRate =
    decidedFair.length === 0 ? 0.5 : whiteWins / decidedFair.length;
  const fairness = Math.max(0, 1 - 2 * Math.abs(whiteWinRate - 0.5));
  const winsByColorAndPath = computeWinsByColorAndPath(design);

  const skillDecided = skillMatches.filter((m) => !m.truncated && m.winner);
  const skillWins = skillDecided.filter(
    (m) => m.winner === PlayerColor.White,
  ).length;
  const legacySkillWr =
    skillDecided.length === 0 ? 0 : skillWins / skillDecided.length;

  const skillCalibration = skillStats?.calibration ?? 0;
  const skillSeparation = skillStats?.separation ?? 0;
  const skillMeanSigma = skillStats?.meanSigma ?? 0;
  const skillDiscrimination =
    skillDecided.length > 0 ? legacySkillWr : skillCalibration;

  const truncated = design.filter((m) => m.truncated).length;
  const deadlockRate = design.length === 0 ? 1 : truncated / design.length;
  const decisiveRate = 1 - deadlockRate;
  const avgPlies = mean(design.map((m) => m.plies));
  const instantWinRate =
    design.length === 0
      ? 0
      : design.filter((m) => !m.truncated && m.plies <= thresholds.instantPlies)
          .length / design.length;
  const interestingMidgame =
    design.length === 0
      ? 0
      : design.filter(
          (m) =>
            m.plies >= thresholds.minInterestingPlies &&
            m.plies <= thresholds.maxInterestingPlies,
        ).length / design.length;

  const winPath = computeWinPathStats(
    fairnessMatches,
    thresholds.minClockSamples,
  );

  const infiltratorCapturesPerGame =
    fairnessMatches.length === 0
      ? 0
      : fairnessMatches.reduce((s, m) => s + m.infiltratorCaptures, 0) /
        fairnessMatches.length;
  const spoolAnnouncesPerGame =
    fairnessMatches.length === 0
      ? 0
      : fairnessMatches.reduce((s, m) => s + m.spoolAnnounces, 0) /
        fairnessMatches.length;
  const spoolFailuresPerGame =
    fairnessMatches.length === 0
      ? 0
      : fairnessMatches.reduce((s, m) => s + m.spoolFailures, 0) /
        fairnessMatches.length;
  const capturesByMoverType: Partial<Record<PieceType, number>> = {};
  for (const m of fairnessMatches) {
    for (const [k, v] of Object.entries(m.capturesByMoverType)) {
      const key = k as PieceType;
      capturesByMoverType[key] = (capturesByMoverType[key] ?? 0) + (v ?? 0);
    }
  }

  const rejectReasons: string[] = [];
  if (instantWinRate > thresholds.maxInstantWinRate) {
    rejectReasons.push(
      `instantWinRate ${instantWinRate.toFixed(2)} > ${thresholds.maxInstantWinRate}`,
    );
  }
  if (deadlockRate > thresholds.maxDeadlockRate) {
    rejectReasons.push(
      `deadlockRate ${deadlockRate.toFixed(2)} > ${thresholds.maxDeadlockRate}`,
    );
  }
  if (decisiveRate < thresholds.minDecisiveRate) {
    rejectReasons.push(
      `decisiveRate ${decisiveRate.toFixed(2)} < ${thresholds.minDecisiveRate}`,
    );
  }
  if (decidedFair.length >= 4 && fairness < thresholds.minFairness) {
    rejectReasons.push(
      `fairness ${fairness.toFixed(2)} < ${thresholds.minFairness}`,
    );
  }
  if (
    skillDecided.length >= 4 &&
    legacySkillWr < thresholds.minSkillDiscrimination
  ) {
    rejectReasons.push(
      `skillDiscrimination ${legacySkillWr.toFixed(2)} < ${thresholds.minSkillDiscrimination}`,
    );
  }
  if (
    skillStats &&
    skillStats.expectedOrder.length >= 2 &&
    skillCalibration < thresholds.minSkillCalibration
  ) {
    rejectReasons.push(
      `skillCalibration ${skillCalibration.toFixed(2)} < ${thresholds.minSkillCalibration} (OpenSkill order scrambled)`,
    );
  }
  if (winPath.decidedGames >= 4) {
    if (winPath.sectorIntegrationRate < thresholds.minSectorIntegrationRate) {
      rejectReasons.push(
        `sectorIntegrationRate ${winPath.sectorIntegrationRate.toFixed(2)} < ${thresholds.minSectorIntegrationRate} (cosmetic net)`,
      );
    }
    if (winPath.sectorIntegrationRate > thresholds.maxSectorIntegrationRate) {
      rejectReasons.push(
        `sectorIntegrationRate ${winPath.sectorIntegrationRate.toFixed(2)} > ${thresholds.maxSectorIntegrationRate} (hyper-territorial)`,
      );
    }
  }
  if (
    thresholds.requireClockSignature &&
    winPath.clockSignature === false
  ) {
    rejectReasons.push(
      `clockSignature failed: medianSectorPlies=${winPath.medianSectorPlies} ≤ medianHubPlies=${winPath.medianHubPlies} (n_hub=${winPath.hubSampleCount} n_sec=${winPath.sectorSampleCount})`,
    );
  }

  const rejected = rejectReasons.length > 0;
  const clockBonus = softClockBonus(winPath);
  const sectorBand = sectorSweetSpotScore(
    winPath.sectorIntegrationRate,
    thresholds.sweetSectorMin,
    thresholds.sweetSectorMax,
  );
  const cal = skillStats ? skillCalibration : skillDiscrimination;
  const sep = skillStats
    ? separationScore(skillSeparation)
    : skillDiscrimination;
  const conf = skillStats ? sigmaConfidence(skillMeanSigma) : 0.5;
  const composite = rejected
    ? 0
    : 0.22 * fairness +
      0.18 * cal +
      0.12 * sep +
      0.08 * conf +
      0.15 * interestingMidgame +
      0.1 * decisiveRate +
      0.1 * sectorBand +
      0.05 * clockBonus -
      0.25 * instantWinRate;

  const ladderGames = skillStats?.ladderGames ?? 0;
  return {
    configId,
    rules,
    track,
    games: design.length + skillMatches.length + ladderGames,
    decisiveRate,
    whiteWinRate,
    fairness,
    winsByColorAndPath,
    skillDiscrimination,
    skillCalibration,
    skillSeparation,
    skillMeanSigma,
    avgPlies,
    interestingMidgame,
    instantWinRate,
    deadlockRate,
    winPath,
    infiltratorCapturesPerGame,
    spoolAnnouncesPerGame,
    spoolFailuresPerGame,
    capturesByMoverType,
    rejected,
    rejectReasons,
    composite,
  };
}

export function evaluateRulesConfig(
  options: EvaluateRulesOptions,
): Scorecard {
  const seed = options.seed ?? 1;
  const fairnessGames = options.fairnessGames ?? 8;
  const skillGames = options.skillGames ?? 8;
  const maxPlies = options.maxPlies ?? 200;
  const fairnessMctsSims = options.fairnessMctsSims ?? 0;
  const fairnessAgent = options.fairnessAgent ?? 'auto';
  const skillMctsSims = options.skillMctsSims ?? 0;
  const track = options.track ?? 'A';
  const useSkillLadder = options.useSkillLadder ?? true;
  const thresholds = {
    ...thresholdsForTrack(track),
    ...options.thresholds,
  };
  const rules = options.rules;
  const id = rulesConfigId(rules);

  const fairnessMatches: MatchResult[] = [];
  const createFairnessAgent = (agentSeed: number): Agent => {
    const rng = createSeededRng(agentSeed);
    if (fairnessAgent === 'random') return new RandomLegalAgent(rng);
    if (fairnessAgent === 'heuristic') return new HeuristicAi(rng);
    if (fairnessAgent === 'mcts') {
      return new MctsAi({ simulations: Math.max(1, fairnessMctsSims), rng });
    }
    return fairnessMctsSims > 0
      ? new MctsAi({ simulations: fairnessMctsSims, rng })
      : new HeuristicAi(rng);
  };
  for (let g = 0; g < fairnessGames; g += 2) {
    const pair = Math.floor(g / 2);
    const firstSeed = seed + pair * 17;
    const secondSeed = firstSeed + 1;

    // Common-random-number color pair: replay the same two agent streams with
    // seats swapped. This isolates first-player / rules asymmetry from one RNG
    // stream happening to produce stronger choices than the other.
    fairnessMatches.push(
      playMatch(
        createFairnessAgent(firstSeed),
        createFairnessAgent(secondSeed),
        { rules, maxPlies },
      ),
    );
    if (g + 1 < fairnessGames) {
      fairnessMatches.push(
        playMatch(
          createFairnessAgent(secondSeed),
          createFairnessAgent(firstSeed),
          { rules, maxPlies },
        ),
      );
    }
  }

  let skillMatches: MatchResult[] = [];
  let skillStats: OpenSkillSkillStats | null = null;

  if (useSkillLadder && skillGames > 0) {
    const ladderMcts =
      skillMctsSims > 0 ? skillMctsSims : fairnessMctsSims;
    const agentCount = ladderMcts > 0 ? 3 : 2;
    const directedPairings = agentCount * (agentCount - 1);
    const gamesPerPairing = Math.max(
      1,
      Math.ceil(skillGames / directedPairings),
    );
    const expectedOrder =
      ladderMcts > 0
        ? [`mcts-${ladderMcts}`, 'heuristic', 'random-legal']
        : ['heuristic', 'random-legal'];
    const ladder = runLadder({
      rules,
      seed: seed + 10_000,
      gamesPerPairing,
      maxPlies,
      createAgents: (rng) => {
        const agents: Agent[] = [
          new RandomLegalAgent(rng),
          new HeuristicAi(rng),
        ];
        if (ladderMcts > 0) {
          agents.push(new MctsAi({ simulations: ladderMcts, rng }));
        }
        return agents;
      },
      expectedOrder,
    });
    skillStats = skillStatsFromLadder(
      ladder.openskill,
      expectedOrder,
      gamesPerPairing * directedPairings,
    );
  } else if (skillGames > 0) {
    for (let g = 0; g < skillGames; g++) {
      const rng = createSeededRng(seed + 10_000 + g * 31);
      const strong =
        skillMctsSims > 0
          ? new MctsAi({ simulations: skillMctsSims, rng })
          : new HeuristicAi(rng);
      skillMatches.push(
        playMatch(
          strong,
          new RandomLegalAgent(
            createSeededRng(seed + 10_000 + g * 31 + 1),
          ),
          { rules, maxPlies },
        ),
      );
    }
  }

  return scoreMatches(id, rules, fairnessMatches, skillMatches, thresholds, {
    track,
    skillStats,
  });
}

/** Keep non-dominated scorecards on fairness, OpenSkill skill, midgame, decisive. */
export function selectParetoFront(cards: Scorecard[]): Scorecard[] {
  const viable = cards.filter((c) => !c.rejected);
  return viable.filter((a) => {
    return !viable.some((b) => {
      if (b.configId === a.configId) return false;
      const aSkill = Math.max(a.skillCalibration, a.skillDiscrimination);
      const bSkill = Math.max(b.skillCalibration, b.skillDiscrimination);
      const betterOrEqual =
        b.fairness >= a.fairness &&
        bSkill >= aSkill &&
        b.skillSeparation >= a.skillSeparation &&
        b.interestingMidgame >= a.interestingMidgame &&
        b.decisiveRate >= a.decisiveRate;
      const strictlyBetter =
        b.fairness > a.fairness ||
        bSkill > aSkill ||
        b.skillSeparation > a.skillSeparation ||
        b.interestingMidgame > a.interestingMidgame ||
        b.decisiveRate > a.decisiveRate;
      return betterOrEqual && strictlyBetter;
    });
  });
}

export interface AiEvolveResult {
  params: { simulations: number; exploration: number; maxRolloutPlies: number };
  winRateVsHeuristic: number;
  games: number;
  avgPlies: number;
}

/** Evolve MCTS hyperparameters against a frozen rules config. */
export function evaluateAiHyperParams(options: {
  rules: RulesConfig;
  params: { simulations: number; exploration: number; maxRolloutPlies: number };
  games?: number;
  seed?: number;
  maxPlies?: number;
}): AiEvolveResult {
  const games = options.games ?? 6;
  const seed = options.seed ?? 1;
  const maxPlies = options.maxPlies ?? 150;
  let wins = 0;
  let plies = 0;

  for (let g = 0; g < games; g++) {
    const rng = createSeededRng(seed + g * 97);
    const mcts: Agent = new MctsAi({
      simulations: options.params.simulations,
      exploration: options.params.exploration,
      maxRolloutPlies: options.params.maxRolloutPlies,
      rng,
    });
    const heuristic = new HeuristicAi(createSeededRng(seed + g * 97 + 1));
    const mctsWhite = g % 2 === 0;
    const result = playMatch(
      mctsWhite ? mcts : heuristic,
      mctsWhite ? heuristic : mcts,
      { rules: options.rules, maxPlies },
    );
    plies += result.plies;
    if (!result.truncated && result.winner) {
      const mctsWon =
        (mctsWhite && result.winner === PlayerColor.White) ||
        (!mctsWhite && result.winner === PlayerColor.Black);
      if (mctsWon) wins += 1;
    }
  }

  return {
    params: options.params,
    winRateVsHeuristic: wins / games,
    games,
    avgPlies: plies / games,
  };
}
