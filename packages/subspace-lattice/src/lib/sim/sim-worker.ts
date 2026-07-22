/**
 * Worker-thread entry for heavy sim jobs (evolve scorecards, ladders).
 * Bundled to dist/sim-worker.mjs by scripts/evolve.sh / sim.sh.
 */
import { parentPort } from 'node:worker_threads';
import { HeuristicAi } from '../ai/heuristic-ai';
import { MctsAi } from '../ai/mcts-ai';
import { RandomLegalAgent } from '../ai/random-legal-agent';
import { resolveRulesConfig, type RulesConfig, type RulesVersion } from '../rules/rules-config';
import {
  evaluateAiHyperParams,
  evaluateRulesConfig,
  type FairnessAgentKind,
} from './scorecard';
import { runLadder } from './ladder';

export type WorkerRequest =
  | {
      id: number;
      type: 'evaluateRules';
      payload: {
        rules: RulesConfig;
        seed: number;
        fairnessGames: number;
        skillGames: number;
        maxPlies: number;
        fairnessMctsSims?: number;
        fairnessAgent?: FairnessAgentKind;
        skillMctsSims?: number;
        track?: 'A' | 'B';
        useSkillLadder?: boolean;
      };
    }
  | {
      id: number;
      type: 'evaluateAi';
      payload: {
        rules: RulesConfig;
        params: {
          simulations: number;
          exploration: number;
          maxRolloutPlies: number;
        };
        games: number;
        seed: number;
        maxPlies: number;
      };
    }
  | {
      id: number;
      type: 'ladder';
      payload: {
        rulesVersion: RulesVersion;
        seed: number;
        gamesPerPairing: number;
        maxPlies: number;
        mctsSims: number;
        expectedOrder?: string[];
      };
    };

function handle(req: WorkerRequest): unknown {
  switch (req.type) {
    case 'evaluateRules':
      return evaluateRulesConfig(req.payload);
    case 'evaluateAi':
      return evaluateAiHyperParams(req.payload);
    case 'ladder': {
      const rules = resolveRulesConfig(req.payload.rulesVersion);
      const mctsSims = req.payload.mctsSims;
      return runLadder({
        rules,
        seed: req.payload.seed,
        gamesPerPairing: req.payload.gamesPerPairing,
        maxPlies: req.payload.maxPlies,
        createAgents: (rng) => [
          new RandomLegalAgent(rng),
          new HeuristicAi(rng),
          new MctsAi({ simulations: mctsSims, rng }),
        ],
        expectedOrder:
          req.payload.expectedOrder ??
          [`mcts-${mctsSims}`, 'heuristic', 'random-legal'],
      });
    }
    default:
      throw new Error(`Unknown worker request`);
  }
}

if (parentPort) {
  parentPort.on('message', (req: WorkerRequest) => {
    try {
      const result = handle(req);
      parentPort!.postMessage({ id: req.id, ok: true, result });
    } catch (err) {
      parentPort!.postMessage({
        id: req.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
