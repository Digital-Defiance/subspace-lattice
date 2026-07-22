/**
 * Node-only multi-seed ladder (worker_threads). Do not import from browser bundles.
 */
import { HeuristicAi } from '../ai/heuristic-ai';
import { MctsAi } from '../ai/mcts-ai';
import { RandomLegalAgent } from '../ai/random-legal-agent';
import {
  resolveRulesConfig,
  type RulesVersion,
} from '../rules/rules-config';
import {
  runLadder,
  type MultiSeedLadderResult,
  type RunLadderOptions,
} from './ladder';

/**
 * Run the same ladder across multiple seeds (optionally in worker threads).
 */
export async function runMultiSeedLadder(options: {
  seeds: number[];
      rulesVersion?: RulesVersion;
  gamesPerPairing?: number;
  maxPlies?: number;
  mctsSims?: number;
  jobs?: number;
  expectedOrder?: string[];
  createAgents?: RunLadderOptions['createAgents'];
}): Promise<MultiSeedLadderResult> {
  const { mapWithSimWorkers, destroySimWorkerPool } = await import(
    './worker-pool'
  );
  const { defaultConcurrency } = await import('./parallel');
  const rulesVersion = options.rulesVersion ?? 'hybrid';
  const gamesPerPairing = options.gamesPerPairing ?? 10;
  const maxPlies = options.maxPlies ?? 400;
  const mctsSims = options.mctsSims ?? 40;
  const jobs = options.jobs ?? defaultConcurrency();
  const expectedOrder =
    options.expectedOrder ??
    [`mcts-${mctsSims}`, 'heuristic', 'random-legal'];

  try {
    const results = await mapWithSimWorkers(
      options.seeds,
      (seed) => ({
        type: 'ladder' as const,
        payload: {
          rulesVersion,
          seed,
          gamesPerPairing,
          maxPlies,
          mctsSims,
          expectedOrder,
        },
      }),
      (seed) => {
        const createAgents =
          options.createAgents ??
          ((rng: () => number) => [
            new RandomLegalAgent(rng),
            new HeuristicAi(rng),
            new MctsAi({ simulations: mctsSims, rng }),
          ]);
        return runLadder({
          rules: resolveRulesConfig(rulesVersion),
          seed,
          gamesPerPairing,
          maxPlies,
          createAgents,
          expectedOrder,
        });
      },
      jobs,
    );

    const names = Object.keys(results[0]?.openskill ?? {});
    const meanOrdinal: Record<string, number> = {};
    const meanTeiScore: Record<string, number> = {};
    for (const name of names) {
      meanOrdinal[name] =
        results.reduce((s, r) => s + (r.openskill[name]?.ordinal ?? 0), 0) /
        results.length;
      meanTeiScore[name] =
        results.reduce((s, r) => s + (r.openskill[name]?.tei.score ?? 0), 0) /
        results.length;
    }

    const calibrationPassRate =
      results.length === 0
        ? 0
        : results.filter((r) => r.calibration?.score === 1).length /
          results.length;

    return {
      seeds: options.seeds,
      results,
      meanOrdinal,
      meanTeiScore,
      calibrationPassRate,
    };
  } finally {
    await destroySimWorkerPool();
  }
}

export { formatMultiSeedLadderReport } from './ladder';
export type { MultiSeedLadderResult } from './ladder';
