/**
 * Smoke ladder: heuristic-leaf MCTS vs MLP (or stub) neural leaf.
 *
 * Bundled by scripts/neural-stub-ladder.sh — not imported from browser.
 *
 * Usage:
 *   yarn neural:stub-ladder --weights path/to/value-mlp-v1.json
 *   yarn neural:stub-ladder --stub
 */
import { readFileSync } from 'node:fs';
import type { Agent } from './agent';
import type { SubspaceLatticeEngine } from '../game-engine';
import { MctsAi } from './mcts-ai';
import {
  createMlpNeuralValue,
  createStubNeuralValue,
  setNeuralValueEvaluator,
  type MlpValueWeights,
} from './neural-value';
import { assertMlpWeights } from './mlp-value';
import { formatLadderReport, runLadder } from '../sim/ladder';
import { resolveRulesConfig } from '../rules/rules-config';

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  return argv[i + 1];
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

function main(): void {
  const argv = process.argv.slice(2);
  const sims = Number(argValue(argv, '--sims') ?? '40');
  const games = Number(argValue(argv, '--games') ?? '2');
  const seed = Number(argValue(argv, '--seed') ?? '7');
  const maxPlies = Number(argValue(argv, '--max-plies') ?? '400');
  const weightsPath = argValue(argv, '--weights');
  const useStub = hasFlag(argv, '--stub') || !weightsPath;
  const rules = resolveRulesConfig('hybrid-fleet');

  let mlpWeights: MlpValueWeights | null = null;
  if (!useStub && weightsPath) {
    mlpWeights = JSON.parse(readFileSync(weightsPath, 'utf8')) as MlpValueWeights;
    assertMlpWeights(mlpWeights);
  }

  const neuralName = useStub ? `mcts-${sims}-stub` : `mcts-${sims}-mlp`;
  console.log(
    `neural-ladder — mcts-${sims} vs ${neuralName} · ${games} games/pair · maxPlies=${maxPlies}` +
      (weightsPath ? ` · weights=${weightsPath}` : ' · stub'),
  );

  const ladder = runLadder({
    rules,
    gamesPerPairing: games,
    seed,
    maxPlies,
    expectedOrder: [`mcts-${sims}`, neuralName],
    createAgents: (rng) => {
      const heuristicLeaf = new MctsAi({
        simulations: sims,
        rng,
        name: `mcts-${sims}`,
      });
      const neuralLeaf: Agent = {
        name: neuralName,
        chooseMove(engine: SubspaceLatticeEngine) {
          setNeuralValueEvaluator(
            useStub || !mlpWeights
              ? createStubNeuralValue()
              : createMlpNeuralValue(mlpWeights),
          );
          try {
            return new MctsAi({
              simulations: sims,
              rng,
              name: neuralName,
            }).chooseMove(engine);
          } finally {
            setNeuralValueEvaluator(null);
          }
        },
      };
      return [heuristicLeaf, neuralLeaf];
    },
    onGameComplete: (info) => {
      const tag = info.truncated
        ? 'trunc'
        : info.winner
          ? info.winner
          : 'draw';
      console.log(
        `  ${info.white} vs ${info.black} game ${info.gameIndex}/${info.gamesPerPairing}: ` +
          `${tag} (${info.plies} plies)`,
      );
    },
  });

  console.log(formatLadderReport(ladder));
  const strong = ladder.openskill[`mcts-${sims}`];
  const neural = ladder.openskill[neuralName];
  if (strong && neural) {
    console.log(
      `ordinal gap (heuristic − neural): ${(strong.ordinal - neural.ordinal).toFixed(2)}`,
    );
  }
  setNeuralValueEvaluator(null);
}

main();
