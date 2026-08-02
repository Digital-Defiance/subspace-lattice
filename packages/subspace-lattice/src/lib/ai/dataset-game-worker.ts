/**
 * Worker-thread entry: one self-play dataset game (+ optional MCTS q labels).
 * Bundled to dist/dataset-game-worker.mjs by scripts/dataset-jsonl.sh.
 */
import { parentPort } from 'node:worker_threads';
import { createSeededRng } from './rng';
import { collectSelfPlayDataset, type DatasetSample } from './dataset';
import {
  makeDatasetAgents,
  type DatasetMatchup,
} from './dataset-matchup';
import {
  resolveRulesConfig,
  type RulesVersion,
} from '../rules/rules-config';
import type { PlayerColor } from '../interfaces/playerColor';
import type { WinnerReason } from '../interfaces/gameState';

export type DatasetGameRequest = {
  id: number;
  type: 'self-play-game';
  payload: {
    matchup: DatasetMatchup;
    sims: number;
    seed: number;
    gameIndex: number;
    maxPlies: number;
    labelSims: number;
    labelEvery: number;
    rulesVersion: RulesVersion;
  };
};

export type DatasetGameResult = {
  gameIndex: number;
  label: string;
  samples: DatasetSample[];
  plies: number;
  truncated: boolean;
  winner?: PlayerColor;
  winnerReason?: WinnerReason;
};

function handle(req: DatasetGameRequest): DatasetGameResult {
  if (req.type !== 'self-play-game') {
    throw new Error('Unknown dataset-game request');
  }
  const p = req.payload;
  const rules = resolveRulesConfig(p.rulesVersion);
  const { white, black, label } = makeDatasetAgents(
    p.matchup,
    p.sims,
    p.seed,
    p.gameIndex,
  );
  const { match, samples } = collectSelfPlayDataset(white, black, {
    rules,
    maxPlies: p.maxPlies,
    searchLabelSims: p.labelSims > 0 ? p.labelSims : undefined,
    searchLabelRng: createSeededRng(p.seed + p.gameIndex * 13 + 999),
    searchLabelEvery: p.labelEvery > 1 ? p.labelEvery : undefined,
  });
  return {
    gameIndex: p.gameIndex,
    label,
    samples,
    plies: match.plies,
    truncated: match.truncated,
    winner: match.winner,
    winnerReason: match.winnerReason,
  };
}

if (parentPort) {
  parentPort.on('message', (req: DatasetGameRequest) => {
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
