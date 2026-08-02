/**
 * Dataset samples for Deep Lattice neural training (ADR 007 / docs/deep-lattice-lab.md).
 */
import { SubspaceLatticeEngine } from '../game-engine';
import { PlayerColor } from '../interfaces/playerColor';
import { Agent } from './agent';
import { MctsAi } from './mcts-ai';
import {
  ENCODING_VERSION,
  encodePosition,
  encodingFingerprint,
} from './position-encoder';
import {
  playMatch,
  type MatchResult,
  type PlayMatchOptions,
} from '../sim/match-runner';
import { replayLpgn, type LpgnReplayResult } from '../debug/lpgn-replay';

export interface DatasetSample {
  encodingVersion: typeof ENCODING_VERSION;
  /** Side-to-move relative features (JSON array). */
  features: number[];
  /** Fingerprint for dedupe. */
  fp: string;
  /**
   * Outcome from the side-to-move's perspective at sample time:
   * +1 win, -1 loss, 0 draw / truncated / unknown.
   */
  z: number;
  /**
   * Optional search value in [-1, 1] (MCTS root visit winrate, STM).
   * Prefer for training when present (`yarn train:value --target q|blend`).
   */
  q?: number;
  ply: number;
  rulesVersion: string;
  source: 'self-play' | 'lpgn';
}

export interface DatasetCollectResult {
  /** Set for self-play; omitted for LPGN-only dumps. */
  match?: MatchResult;
  samples: DatasetSample[];
}

export interface SelfPlayDatasetResult {
  match: MatchResult;
  samples: DatasetSample[];
}

export interface CollectSelfPlayDatasetOptions extends PlayMatchOptions {
  /**
   * When > 0, run this many MCTS sims on a clone before each move and store
   * `q` (search value). Independent of the playing agents.
   */
  searchLabelSims?: number;
  /** RNG for the labeler MCTS. */
  searchLabelRng?: () => number;
  /** Only attach search `q` every N plies (1 = every ply). Default 1. */
  searchLabelEvery?: number;
}

function outcomeForSide(
  winner: PlayerColor | undefined,
  sideToMove: PlayerColor,
  truncated: boolean,
): number {
  if (truncated || winner == null) return 0;
  return winner === sideToMove ? 1 : -1;
}

function sampleFromEngine(
  engine: SubspaceLatticeEngine,
  z: number,
  source: DatasetSample['source'],
  q?: number,
): DatasetSample {
  const enc = encodePosition(engine);
  const sample: DatasetSample = {
    encodingVersion: enc.version,
    features: Array.from(enc.features),
    fp: encodingFingerprint(enc.features),
    z,
    ply: engine.getState().plyCount ?? 0,
    rulesVersion: engine.getRules().version,
    source,
  };
  if (q != null && Number.isFinite(q)) sample.q = q;
  return sample;
}

/** Run a short MCTS on a clone; return STM value in [-1, 1]. */
export function estimateSearchValue(
  engine: SubspaceLatticeEngine,
  simulations: number,
  rng: () => number = Math.random,
): number | null {
  if (simulations <= 0) return null;
  const probe = engine.clone();
  const ai = new MctsAi({
    simulations,
    rng,
    name: `label-mcts-${simulations}`,
  });
  ai.chooseMove(probe);
  return ai.getLastSearchValue();
}

/**
 * Play a match and record a sample before every move, labeled by final result
 * (and optional search value).
 */
export function collectSelfPlayDataset(
  white: Agent,
  black: Agent,
  options: CollectSelfPlayDatasetOptions = {},
): SelfPlayDatasetResult {
  const pending: {
    features: Float32Array;
    stm: PlayerColor;
    ply: number;
    q?: number;
  }[] = [];
  const labelSims = options.searchLabelSims ?? 0;
  const labelRng = options.searchLabelRng ?? Math.random;
  const labelEvery = Math.max(1, options.searchLabelEvery ?? 1);
  let plyIndex = 0;

  const match = playMatch(white, black, {
    ...options,
    onBeforeMove: (engine) => {
      options.onBeforeMove?.(engine);
      const enc = encodePosition(engine);
      let q: number | undefined;
      if (labelSims > 0 && plyIndex % labelEvery === 0) {
        const v = estimateSearchValue(engine, labelSims, labelRng);
        if (v != null) q = v;
      }
      plyIndex += 1;
      pending.push({
        features: enc.features,
        stm: engine.getState().currentPlayer,
        ply: engine.getState().plyCount ?? 0,
        q,
      });
    },
  });

  const samples: DatasetSample[] = pending.map((p) => {
    const sample: DatasetSample = {
      encodingVersion: ENCODING_VERSION,
      features: Array.from(p.features),
      fp: encodingFingerprint(p.features),
      z: outcomeForSide(match.winner, p.stm, match.truncated),
      ply: p.ply,
      rulesVersion: match.rulesVersion,
      source: 'self-play',
    };
    if (p.q != null) sample.q = p.q;
    return sample;
  });

  return { match, samples };
}

/**
 * Label every pre-ply position in an LPGN replay by the game result.
 * Uses headers Result / Termination when present; else final engine winner.
 */
export function collectLpgnDataset(
  text: string,
  options: { searchLabelSims?: number; searchLabelRng?: () => number } = {},
): DatasetCollectResult {
  const replay: LpgnReplayResult = replayLpgn(text);
  const rulesVersion = replay.engine.getRules().version;
  const headerResult = (replay.parsed.headers.Result ?? '').trim();
  let winner: PlayerColor | undefined = replay.engine.getState().winner;
  if (!winner) {
    if (headerResult.startsWith('1-0')) winner = PlayerColor.White;
    else if (headerResult.startsWith('0-1')) winner = PlayerColor.Black;
  }
  const truncated = !winner || headerResult === '*' || headerResult === '1/2-1/2';

  const rules = replay.engine.getRules();
  const samples: DatasetSample[] = [];
  const labelSims = options.searchLabelSims ?? 0;

  for (const ply of replay.plies) {
    const engine = SubspaceLatticeEngine.fromState(ply.before, rules);
    const stm = engine.getState().currentPlayer;
    let q: number | undefined;
    if (labelSims > 0) {
      const v = estimateSearchValue(
        engine,
        labelSims,
        options.searchLabelRng ?? Math.random,
      );
      if (v != null) q = v;
    }
    samples.push({
      ...sampleFromEngine(
        engine,
        outcomeForSide(winner, stm, truncated),
        'lpgn',
        q,
      ),
      ply: ply.index,
      rulesVersion,
    });
  }

  return { samples };
}

export function samplesToJsonl(samples: readonly DatasetSample[]): string {
  return (
    samples.map((s) => JSON.stringify(s)).join('\n') + (samples.length ? '\n' : '')
  );
}
