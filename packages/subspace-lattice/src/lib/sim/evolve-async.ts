/**
 * Node-only parallel evolution (worker_threads). Do not import from browser bundles.
 */
import { createSeededRng } from '../ai/rng';
import { resolveRulesConfig } from '../rules/rules-config';
import {
  generateRulesCandidates,
  sampleAiHyperParams,
} from './param-space';
import {
  evaluateAiHyperParams,
  evaluateRulesConfig,
} from './scorecard';
import {
  disabledSectorTwin,
  finalizeEvolution,
  type EvolutionRunResult,
  type RunEvolutionOptions,
} from './evolve';

/**
 * Parallel evolve using worker threads when `dist/sim-worker.mjs` is present
 * (CLI builds it). Falls back to in-process work otherwise.
 */
export async function runEvolutionAsync(
  options: RunEvolutionOptions = {},
): Promise<EvolutionRunResult> {
  const { mapWithSimWorkers, destroySimWorkerPool } = await import(
    './worker-pool'
  );
  const { defaultConcurrency } = await import('./parallel');

  const seed = options.seed ?? 42;
  const candidates = options.candidates ?? 6;
  const fairnessGames = options.fairnessGames ?? 6;
  const skillGames = options.skillGames ?? 6;
  const maxPlies = options.maxPlies ?? 180;
  const aiTrialCount = options.aiTrials ?? 4;
  const aiGames = options.aiGames ?? 4;
  const fairnessMctsSims = options.fairnessMctsSims ?? 20;
  const skillMctsSims = options.skillMctsSims ?? 0;
  const track = options.track ?? 'A';
  const jobs = options.jobs ?? defaultConcurrency();

  const configs = options.fixedRules?.length
    ? options.fixedRules
    : options.rulesVersion
      ? [resolveRulesConfig(options.rulesVersion)]
      : generateRulesCandidates(candidates, seed, true);
  const frozen = configs[0] ?? resolveRulesConfig(options.rulesVersion ?? 'hybrid');
  const rng = createSeededRng(seed + 99_000);
  const aiParams = Array.from({ length: aiTrialCount }, () =>
    sampleAiHyperParams(rng),
  );

  // Fixed-cell matrices use common random numbers (same seed per cell) so
  // cells differ only by rules; random candidate sweeps keep per-index seeds.
  const pairedSeeds = Boolean(options.fixedRules?.length);
  const cellSeed = (i: number): number => (pairedSeeds ? seed : seed + i * 1000);

  try {
    const scorecards = await mapWithSimWorkers(
      configs,
      (rules, i) => ({
        type: 'evaluateRules' as const,
        payload: {
          rules,
          seed: cellSeed(i),
          fairnessGames,
          skillGames,
          maxPlies,
          fairnessMctsSims,
          fairnessAgent: options.fairnessAgent,
          skillMctsSims,
          track,
        },
      }),
      (rules, i) =>
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
      jobs,
    );

    // Clock-function controls: same cell, sector unreachable, same seed
    // (skill ladder skipped — only fairness telemetry drives the verdict).
    const counterfactuals = options.counterfactualClock
      ? await mapWithSimWorkers(
          configs.map(disabledSectorTwin),
          (rules, i) => ({
            type: 'evaluateRules' as const,
            payload: {
              rules,
              seed: cellSeed(i),
              fairnessGames,
              skillGames: 0,
              maxPlies,
              fairnessMctsSims,
              fairnessAgent: options.fairnessAgent,
              skillMctsSims,
              track,
            },
          }),
          (rules, i) =>
            evaluateRulesConfig({
              rules,
              seed: cellSeed(i),
              fairnessGames,
              skillGames: 0,
              maxPlies,
              fairnessMctsSims,
              fairnessAgent: options.fairnessAgent,
              skillMctsSims,
              track,
            }),
          jobs,
        )
      : null;

    const aiTrials = await mapWithSimWorkers(
      aiParams,
      (params, i) => ({
        type: 'evaluateAi' as const,
        payload: {
          rules: frozen,
          params,
          games: aiGames,
          seed: seed + 50_000 + i * 13,
          maxPlies: 120,
        },
      }),
      (params, i) =>
        evaluateAiHyperParams({
          rules: frozen,
          params,
          games: aiGames,
          seed: seed + 50_000 + i * 13,
          maxPlies: 120,
        }),
      jobs,
    );

    return finalizeEvolution(seed, scorecards, aiTrials, track, counterfactuals);
  } finally {
    await destroySimWorkerPool();
  }
}
