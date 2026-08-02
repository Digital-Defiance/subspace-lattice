/**
 * Serializable matchup recipes for dataset self-play (CLI + workers).
 */
import type { Agent } from './agent';
import { HeuristicAi } from './heuristic-ai';
import { MctsAi } from './mcts-ai';
import { RandomLegalAgent } from './random-legal-agent';
import { createSeededRng } from './rng';

export type DatasetMatchup = 'heuristic-random' | 'mirror' | 'mcts-random';

export function parseDatasetMatchup(raw: string | undefined): DatasetMatchup {
  if (raw === 'mirror' || raw === 'mcts-random' || raw === 'heuristic-random') {
    return raw;
  }
  return 'heuristic-random';
}

export function makeDatasetAgents(
  matchup: DatasetMatchup,
  sims: number,
  seed: number,
  gameIndex: number,
): { white: Agent; black: Agent; label: string } {
  const rngW = createSeededRng(seed + gameIndex * 97);
  const rngB = createSeededRng(seed + gameIndex * 97 + 1);
  // Alternate colors so neither seat always faces random.
  const swap = gameIndex % 2 === 1;

  if (matchup === 'mirror') {
    const white =
      sims > 0
        ? new MctsAi({ simulations: sims, rng: rngW })
        : new HeuristicAi(rngW);
    const black =
      sims > 0
        ? new MctsAi({ simulations: sims, rng: rngB })
        : new HeuristicAi(rngB);
    return { white, black, label: sims > 0 ? `mcts-${sims}` : 'heuristic' };
  }

  if (matchup === 'mcts-random') {
    const n = Math.max(1, sims || 40);
    const strong = new MctsAi({ simulations: n, rng: rngW });
    const weak = new RandomLegalAgent(rngB);
    return swap
      ? { white: weak, black: strong, label: `random-vs-mcts-${n}` }
      : { white: strong, black: weak, label: `mcts-${n}-vs-random` };
  }

  const strong = new HeuristicAi(rngW);
  const weak = new RandomLegalAgent(rngB);
  return swap
    ? { white: weak, black: strong, label: 'random-vs-heuristic' }
    : { white: strong, black: weak, label: 'heuristic-vs-random' };
}
