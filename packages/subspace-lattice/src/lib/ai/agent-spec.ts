/**
 * Serializable agent recipes for Node ladder workers (strength-bar, etc.).
 * Do not import node:fs from browser entrypoints that pull this in casually —
 * weightsPath loading is only used from Node CLIs / workers.
 */
import { readFileSync } from 'node:fs';
import type { Agent } from './agent';
import { HeuristicAi } from './heuristic-ai';
import { MctsAi } from './mcts-ai';
import { RandomLegalAgent } from './random-legal-agent';
import { assertMlpWeights, type MlpValueWeights } from './mlp-value';
import {
  createMlpNeuralValue,
  setNeuralValueEvaluator,
} from './neural-value';
import type { SubspaceLatticeEngine } from '../game-engine';

export type AgentSpec =
  | {
      kind: 'mcts';
      name: string;
      simulations: number;
      /** deepish = Deep knobs at N sims; deep = shipping Deep Lattice (800). */
      preset?: 'deepish' | 'deep';
      /** Optional wall-clock cap per move (ms), same as createAiForStrength. */
      timeBudgetMs?: number;
    }
  | {
      kind: 'mcts-mlp';
      name: string;
      simulations: number;
      weightsPath: string;
      /** Match Deep search shape when comparing leaves at equal sims. */
      preset?: 'deepish' | 'deep';
      timeBudgetMs?: number;
    }
  | { kind: 'heuristic'; name?: string }
  | { kind: 'random'; name?: string };

const weightsCache = new Map<string, MlpValueWeights>();

export function loadMlpWeightsCached(weightsPath: string): MlpValueWeights {
  let w = weightsCache.get(weightsPath);
  if (!w) {
    w = JSON.parse(readFileSync(weightsPath, 'utf8')) as MlpValueWeights;
    assertMlpWeights(w);
    weightsCache.set(weightsPath, w);
  }
  return w;
}

function deepShapeMcts(
  name: string,
  simulations: number,
  rng: () => number,
  timeBudgetMs?: number,
): Agent {
  return new MctsAi({
    simulations,
    rng,
    name,
    maxRolloutPlies: 48,
    quiescencePlies: 10,
    rolloutEpsilon: 0.12,
    maxBranch: 56,
    exploration: 1.25,
    timeBudgetMs,
    yieldEvery: 24,
  });
}

function withNeuralLeaf(
  name: string,
  simulations: number,
  weights: MlpValueWeights,
  rng: () => number,
  options?: {
    deepShape?: boolean;
    timeBudgetMs?: number;
  },
): Agent {
  return {
    name,
    chooseMove(engine: SubspaceLatticeEngine) {
      setNeuralValueEvaluator(createMlpNeuralValue(weights));
      try {
        if (options?.deepShape) {
          return deepShapeMcts(
            name,
            simulations,
            rng,
            options.timeBudgetMs,
          ).chooseMove(engine);
        }
        return new MctsAi({ simulations, rng, name }).chooseMove(engine);
      } finally {
        setNeuralValueEvaluator(null);
      }
    },
  };
}

export function agentFromSpec(spec: AgentSpec, rng: () => number): Agent {
  switch (spec.kind) {
    case 'heuristic':
      return new HeuristicAi(rng);
    case 'random':
      return new RandomLegalAgent(rng);
    case 'mcts':
      if (spec.preset === 'deepish' || spec.preset === 'deep') {
        return deepShapeMcts(
          spec.name,
          spec.simulations,
          rng,
          spec.timeBudgetMs,
        );
      }
      return new MctsAi({
        simulations: spec.simulations,
        rng,
        name: spec.name,
      });
    case 'mcts-mlp': {
      const weights = loadMlpWeightsCached(spec.weightsPath);
      return withNeuralLeaf(spec.name, spec.simulations, weights, rng, {
        deepShape: spec.preset === 'deepish' || spec.preset === 'deep',
        timeBudgetMs: spec.timeBudgetMs,
      });
    }
    default: {
      const _exhaustive: never = spec;
      throw new Error(`Unknown agent spec: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function agentSpecName(spec: AgentSpec): string {
  switch (spec.kind) {
    case 'heuristic':
      return spec.name ?? 'heuristic';
    case 'random':
      return spec.name ?? 'random-legal';
    case 'mcts':
    case 'mcts-mlp':
      return spec.name;
    default: {
      const _exhaustive: never = spec;
      throw new Error(`Unknown agent spec: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
