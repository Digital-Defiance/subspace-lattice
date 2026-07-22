import { createSeededRng } from '../ai/rng';
import {
  resolveRulesConfig,
  type RulesVersion,
} from '../rules/rules-config';
import {
  generateRulesCandidates,
  sampleAiHyperParams,
} from './param-space';
import {
  evaluateAiHyperParams,
  evaluateRulesConfig,
  selectParetoFront,
  Scorecard,
  AiEvolveResult,
  type EvolutionTrack,
  type FairnessAgentKind,
} from './scorecard';
import type { RulesConfig } from '../rules/rules-config';
import { PlayerColor } from '../interfaces/playerColor';

export interface EvolutionRunResult {
  /** ISO timestamp — for humans; not used as promotion authority. */
  ranAt: string;
  seed: number;
  /** Never auto-promoted; human must edit RulesConfig defaults. */
  humanGateRequired: true;
  track: EvolutionTrack;
  scorecards: Scorecard[];
  paretoFront: Scorecard[];
  bestComposite: Scorecard | null;
  aiTrials: AiEvolveResult[];
  bestAi: AiEvolveResult | null;
  /**
   * Clock-function controls (ADR 005): each entry i is the same cell as
   * scorecards[i] but with Sector Integration unreachable, evaluated with the
   * same seed. Null unless the run requested `--counterfactual`.
   */
  counterfactuals: Scorecard[] | null;
}

/** Sector-disabled twin for clock-function counterfactuals (ADR 005). */
export function disabledSectorTwin(rules: RulesConfig): RulesConfig {
  return { ...rules, sectorIntegrationRatio: 1.01 };
}

/**
 * Clock is functional when removing the sector win path degrades the game:
 * deadlocks rise by ≥10pp or average game length grows by ≥20%.
 */
export function clockFunctionVerdict(
  base: Scorecard,
  counterfactual: Scorecard,
): boolean {
  const deadlockJump = counterfactual.deadlockRate - base.deadlockRate;
  const lengthGrowth =
    base.avgPlies > 0
      ? (counterfactual.avgPlies - base.avgPlies) / base.avgPlies
      : 0;
  return deadlockJump >= 0.1 || lengthGrowth >= 0.2;
}

export interface RunEvolutionOptions {
  seed?: number;
  candidates?: number;
  /**
   * Evaluate one exact rules version instead of sampling parameter candidates.
   * Intended for matched A/B runs such as hybrid vs hybrid-spool.
   */
  rulesVersion?: RulesVersion;
  /**
   * Exact RulesConfig cells (from `--fixed`). Takes precedence over
   * `rulesVersion` / candidate sampling.
   */
  fixedRules?: RulesConfig[];
  fairnessGames?: number;
  skillGames?: number;
  maxPlies?: number;
  aiTrials?: number;
  aiGames?: number;
  /** Worker / async pool size (default: CPUs − 1). */
  jobs?: number;
  /** MCTS budget for fairness self-play (0 = heuristic). Default 20. */
  fairnessMctsSims?: number;
  /** Agent family used for equal-strength fairness matches. */
  fairnessAgent?: FairnessAgentKind;
  /** MCTS budget for skill ladder strong agent (0 = reuse fairnessMcts). */
  skillMctsSims?: number;
  /** Design track A (fleet) or B (territory). Default A. */
  track?: EvolutionTrack;
  /**
   * For each cell, also evaluate a sector-disabled twin with the same seed
   * and report deadlock / length deltas (functional clock test, ADR 005).
   */
  counterfactualClock?: boolean;
}

function resolveEvolutionConfigs(options: RunEvolutionOptions): RulesConfig[] {
  if (options.fixedRules?.length) return options.fixedRules;
  if (options.rulesVersion) {
    return [resolveRulesConfig(options.rulesVersion)];
  }
  return generateRulesCandidates(options.candidates ?? 6, options.seed ?? 42, true);
}

export function finalizeEvolution(
  seed: number,
  scorecards: Scorecard[],
  aiTrials: AiEvolveResult[],
  track: EvolutionTrack = 'A',
  counterfactuals: Scorecard[] | null = null,
): EvolutionRunResult {
  const paretoFront = selectParetoFront(scorecards);
  const bestComposite =
    scorecards
      .filter((c) => !c.rejected)
      .sort((a, b) => b.composite - a.composite)[0] ?? null;
  const bestAi =
    [...aiTrials].sort(
      (a, b) => b.winRateVsHeuristic - a.winRateVsHeuristic,
    )[0] ?? null;

  return {
    ranAt: new Date().toISOString(),
    seed,
    humanGateRequired: true,
    track,
    scorecards,
    paretoFront,
    bestComposite,
    aiTrials,
    bestAi,
    counterfactuals,
  };
}

/**
 * Sample rules configs + AI hyperparameters, score them, select Pareto front.
 * Does **not** mutate default rules — results are candidates for human review.
 */
export function runEvolution(
  options: RunEvolutionOptions = {},
): EvolutionRunResult {
  const seed = options.seed ?? 42;
  const fairnessGames = options.fairnessGames ?? 6;
  const skillGames = options.skillGames ?? 6;
  const maxPlies = options.maxPlies ?? 180;
  const aiTrialCount = options.aiTrials ?? 4;
  const aiGames = options.aiGames ?? 4;
  const fairnessMctsSims = options.fairnessMctsSims ?? 20;
  const skillMctsSims = options.skillMctsSims ?? 0;
  const track = options.track ?? 'A';

  const configs = resolveEvolutionConfigs(options);
  // Fixed-cell matrices use common random numbers (same seed per cell) so
  // cells differ only by rules; random candidate sweeps keep per-index seeds.
  const pairedSeeds = Boolean(options.fixedRules?.length);
  const cellSeed = (i: number): number =>
    pairedSeeds ? seed : seed + i * 1000;
  const scorecards = configs.map((rules, i) =>
    evaluateRulesConfig({
      rules,
      seed: cellSeed(i),
      fairnessGames,
      skillGames,
      maxPlies,
      fairnessMctsSims,
      fairnessAgent: options.fairnessAgent,
      skillMctsSims,
      track,
    }),
  );

  // Clock-function controls: same cell, sector unreachable, same seed.
  // Skill ladder skipped — only fairness telemetry matters for the verdict.
  const counterfactuals = options.counterfactualClock
    ? configs.map((rules, i) =>
        evaluateRulesConfig({
          rules: disabledSectorTwin(rules),
          seed: cellSeed(i),
          fairnessGames,
          skillGames: 0,
          maxPlies,
          fairnessMctsSims,
          fairnessAgent: options.fairnessAgent,
          skillMctsSims,
          track,
        }),
      )
    : null;

  const frozen = configs[0] ?? resolveRulesConfig(options.rulesVersion ?? 'hybrid');
  const rng = createSeededRng(seed + 99_000);
  const aiTrials: AiEvolveResult[] = [];
  for (let i = 0; i < aiTrialCount; i++) {
    const params = sampleAiHyperParams(rng);
    aiTrials.push(
      evaluateAiHyperParams({
        rules: frozen,
        params,
        games: aiGames,
        seed: seed + 50_000 + i * 13,
        maxPlies: 120,
      }),
    );
  }

  return finalizeEvolution(seed, scorecards, aiTrials, track, counterfactuals);
}

function formatCounterfactualSection(result: EvolutionRunResult): string[] {
  if (!result.counterfactuals) return [];
  const lines = [
    '',
    'Clock counterfactual (sector disabled, paired seeds):',
  ];
  result.scorecards.forEach((base, i) => {
    const cf = result.counterfactuals![i];
    if (!cf) return;
    const functional = clockFunctionVerdict(base, cf);
    const dl = `deadlock ${(base.deadlockRate * 100).toFixed(0)}%→${(cf.deadlockRate * 100).toFixed(0)}%`;
    const len = `avgPlies ${base.avgPlies.toFixed(0)}→${cf.avgPlies.toFixed(0)}`;
    lines.push(
      `  ${base.configId}: ${dl} ${len} → clock function ${functional ? '✓' : '✗'}`,
    );
  });
  return lines;
}

export function formatEvolutionReport(result: EvolutionRunResult): string {
  const lines: string[] = [
    `Evolution run (seed ${result.seed}, track ${result.track}) — HUMAN GATE REQUIRED before promoting defaults`,
    `Ran at: ${result.ranAt}`,
    '',
    'Rules candidates:',
  ];
  for (const c of result.scorecards) {
    const wp = c.winPath;
    const whitePercent = c.whiteWinRate * 100;
    const blackPercent = 100 - whitePercent;
    const whitePaths = c.winsByColorAndPath[PlayerColor.White];
    const blackPaths = c.winsByColorAndPath[PlayerColor.Black];
    const clock =
      wp.clockSignature === true
        ? 'clock✓'
        : wp.clockSignature === false
          ? 'clock✗'
          : 'clock?';
    const medHub =
      wp.medianHubPlies === null ? '—' : wp.medianHubPlies.toFixed(0);
    const medSec =
      wp.medianSectorPlies === null ? '—' : wp.medianSectorPlies.toFixed(0);
    let delta = 'Δ=?';
    if (wp.medianHubPlies !== null && wp.medianSectorPlies !== null) {
      const d = wp.medianSectorPlies - wp.medianHubPlies;
      delta = `Δ=${d >= 0 ? '+' : ''}${d.toFixed(0)}`;
    }
    lines.push(
      `  ${c.rejected ? 'REJECT' : 'OK   '} ${c.configId} W=${whitePercent.toFixed(0)}% B=${blackPercent.toFixed(0)}% paths W[h${whitePaths.hubCapture}/s${whitePaths.sectorIntegration}/n${whitePaths.noMoves}] B[h${blackPaths.hubCapture}/s${blackPaths.sectorIntegration}/n${blackPaths.noMoves}] composite=${c.composite.toFixed(3)} fair=${c.fairness.toFixed(2)} cal=${c.skillCalibration.toFixed(2)} sep=${c.skillSeparation.toFixed(1)} σ=${c.skillMeanSigma.toFixed(1)} mid=${c.interestingMidgame.toFixed(2)} avgPlies=${c.avgPlies.toFixed(1)} hub=${(wp.hubCaptureRate * 100).toFixed(0)}% sec=${(wp.sectorIntegrationRate * 100).toFixed(0)}% ${clock} medHub=${medHub} medSec=${medSec} ${delta} (n_hub=${wp.hubSampleCount} n_sec=${wp.sectorSampleCount}) infilCap/g=${c.infiltratorCapturesPerGame.toFixed(2)}`,
    );
    if (c.rejectReasons.length) {
      lines.push(`         reasons: ${c.rejectReasons.join('; ')}`);
    }
  }
  lines.push(...formatCounterfactualSection(result));
  lines.push('', 'Pareto front:');
  if (result.paretoFront.length === 0) {
    lines.push('  (none — all rejected)');
  } else {
    for (const c of result.paretoFront) {
      lines.push(`  ${c.configId} composite=${c.composite.toFixed(3)}`);
    }
  }
  if (result.bestComposite) {
    lines.push(
      '',
      `Best composite (candidate only): ${result.bestComposite.configId}`,
      `  ${JSON.stringify(result.bestComposite.rules)}`,
    );
  }
  lines.push('', 'AI hyperparameter trials (frozen selected rules):');
  for (const t of result.aiTrials) {
    lines.push(
      `  sims=${t.params.simulations} explore=${t.params.exploration} rollout=${t.params.maxRolloutPlies} → winRate vs heuristic ${t.winRateVsHeuristic.toFixed(2)} avgPlies=${t.avgPlies.toFixed(1)}`,
    );
  }
  if (result.bestAi) {
    lines.push(
      `Best AI trial: sims=${result.bestAi.params.simulations} explore=${result.bestAi.params.exploration} (${result.bestAi.winRateVsHeuristic.toFixed(2)})`,
    );
  }
  lines.push(
    '',
    'To promote: manually update HYBRID_RULES / AI_STRENGTH_PRESETS after review.',
  );
  return lines.join('\n');
}

/** One JSON object per line for scorecards + summary. */
export function evolutionToJsonl(result: EvolutionRunResult): string {
  const lines: string[] = [
    JSON.stringify({
      type: 'evolution-summary',
      ranAt: result.ranAt,
      seed: result.seed,
      humanGateRequired: true,
      track: result.track,
      paretoIds: result.paretoFront.map((c) => c.configId),
      bestCompositeId: result.bestComposite?.configId ?? null,
      bestAi: result.bestAi,
    }),
  ];
  for (const c of result.scorecards) {
    lines.push(JSON.stringify({ type: 'rules-scorecard', ...c }));
  }
  if (result.counterfactuals) {
    result.counterfactuals.forEach((cf, i) => {
      const base = result.scorecards[i];
      lines.push(
        JSON.stringify({
          type: 'counterfactual-scorecard',
          baseConfigId: base?.configId ?? null,
          clockFunctional: base ? clockFunctionVerdict(base, cf) : null,
          ...cf,
        }),
      );
    });
  }
  for (const t of result.aiTrials) {
    lines.push(JSON.stringify({ type: 'ai-trial', ...t }));
  }
  return lines.join('\n') + '\n';
}
