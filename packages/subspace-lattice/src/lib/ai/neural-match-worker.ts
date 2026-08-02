/**
 * Worker-thread entry: play one ladder game from AgentSpecs.
 * Bundled to dist/neural-match-worker.mjs by scripts/neural-strength-bar.sh.
 */
import { parentPort } from 'node:worker_threads';
import { createSeededRng } from './rng';
import { agentFromSpec, type AgentSpec } from './agent-spec';
import { playMatch } from '../sim/match-runner';
import {
  resolveRulesConfig,
  type RulesVersion,
} from '../rules/rules-config';
import type { PlayerColor } from '../interfaces/playerColor';
import type { WinnerReason } from '../interfaces/gameState';

export type SlimMatchResult = {
  winner?: PlayerColor;
  winnerReason?: WinnerReason;
  plies: number;
  truncated: boolean;
};

export type NeuralMatchRequest = {
  id: number;
  type: 'match';
  payload: {
    white: AgentSpec;
    black: AgentSpec;
    /** Seed passed to createSeededRng for both agents (same as runLadder). */
    seed: number;
    maxPlies: number;
    rulesVersion: RulesVersion;
  };
};

export function playSpecMatch(
  payload: NeuralMatchRequest['payload'],
): SlimMatchResult {
  const rules = resolveRulesConfig(payload.rulesVersion);
  const rng = createSeededRng(payload.seed);
  const white = agentFromSpec(payload.white, rng);
  const black = agentFromSpec(payload.black, rng);
  const result = playMatch(white, black, {
    rules,
    maxPlies: payload.maxPlies,
  });
  return {
    winner: result.winner,
    winnerReason: result.winnerReason,
    plies: result.plies,
    truncated: result.truncated,
  };
}

function handle(req: NeuralMatchRequest): SlimMatchResult {
  if (req.type !== 'match') {
    throw new Error(`Unknown neural-match request type`);
  }
  return playSpecMatch(req.payload);
}

if (parentPort) {
  parentPort.on('message', (req: NeuralMatchRequest) => {
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
