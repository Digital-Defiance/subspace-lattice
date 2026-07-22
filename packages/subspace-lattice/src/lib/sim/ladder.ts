import { Agent } from '../ai/agent';
import { createSeededRng } from '../ai/rng';
import { PlayerColor } from '../interfaces/playerColor';
import { RulesConfig, resolveRulesConfig } from '../rules/rules-config';
import { playMatch } from './match-runner';
import {
  AgentSkill,
  applyMatchResult,
  calibrationPairAccuracy,
  createRating,
  rankByOrdinal,
  toAgentSkill,
  type Rating,
} from './ratings';
import type { TeiGrade } from './tei-grade';

export interface LadderPairResult {
  white: string;
  black: string;
  games: number;
  whiteWins: number;
  blackWins: number;
  draws: number;
  truncated: number;
  avgPlies: number;
}

export interface LadderResult {
  rulesVersion: RulesConfig['version'];
  pairs: LadderPairResult[];
  /** OpenSkill yardstick (primary). */
  openskill: Record<string, AgentSkill>;
  /** Ranking by OpenSkill ordinal (best first). */
  ranking: AgentSkill[];
  /**
   * Adjacent-pair accuracy vs expected strongest→weakest order.
   * Undefined if no expectedOrder was provided.
   */
  calibration?: {
    expectedOrder: string[];
    correctPairs: number;
    totalPairs: number;
    score: number;
  };
  /** Legacy Elo (start 1000) — secondary familiarity metric. */
  elo: Record<string, number>;
}

export interface RunLadderOptions {
  rules?: RulesConfig;
  gamesPerPairing?: number;
  /** Base seed; each game uses seed + gameIndex. */
  seed?: number;
  maxPlies?: number;
  /** Factory so each game can get a fresh seeded RNG agent. */
  createAgents: (rng: () => number) => Agent[];
  /**
   * Expected strength order strongest → weakest (e.g. mcts-200, heuristic, random-legal).
   * Used for calibration score.
   */
  expectedOrder?: string[];
  /** Optional progress hook after each directed pairing finishes. */
  onPairingComplete?: (info: {
    white: string;
    black: string;
    whiteWins: number;
    blackWins: number;
    draws: number;
    index: number;
    total: number;
  }) => void;
}

function updateElo(
  elo: Record<string, number>,
  winner: string,
  loser: string,
  k = 24,
): void {
  const rw = elo[winner] ?? 1000;
  const rl = elo[loser] ?? 1000;
  const ew = 1 / (1 + 10 ** ((rl - rw) / 400));
  elo[winner] = rw + k * (1 - ew);
  elo[loser] = rl + k * (0 - (1 - ew));
}

/**
 * Round-robin pairings: every agent as white vs every other as black.
 * Same agent vs itself is skipped. Ratings updated with OpenSkill (+ Elo).
 */
export function runLadder(options: RunLadderOptions): LadderResult {
  const rules = options.rules ?? resolveRulesConfig('classic');
  const gamesPerPairing = options.gamesPerPairing ?? 10;
  const seed = options.seed ?? 1;
  const maxPlies = options.maxPlies ?? 400;

  const probeRng = createSeededRng(seed);
  const names = options.createAgents(probeRng).map((a) => a.name);
  const elo: Record<string, number> = Object.fromEntries(
    names.map((n) => [n, 1000]),
  );
  const ratings: Record<string, Rating> = Object.fromEntries(
    names.map((n) => [n, createRating()]),
  );
  /** Last TEI letter for hysteresis across the ladder. */
  const teiGrade: Record<string, TeiGrade | undefined> = Object.fromEntries(
    names.map((n) => [n, undefined]),
  );
  const pairs: LadderPairResult[] = [];
  const directed = names.flatMap((w) =>
    names.filter((b) => b !== w).map((b) => [w, b] as const),
  );
  let pairingIndex = 0;

  for (const whiteName of names) {
    for (const blackName of names) {
      if (whiteName === blackName) continue;
      pairingIndex += 1;

      let whiteWins = 0;
      let blackWins = 0;
      let draws = 0;
      let truncated = 0;
      let pliesSum = 0;

      for (let g = 0; g < gamesPerPairing; g++) {
        const rng = createSeededRng(
          seed +
            g * 1009 +
            names.indexOf(whiteName) * 17 +
            names.indexOf(blackName),
        );
        const agents = options.createAgents(rng);
        const white = agents.find((a) => a.name === whiteName);
        const black = agents.find((a) => a.name === blackName);
        if (!white || !black) {
          throw new Error(`Missing agent ${whiteName} or ${blackName}`);
        }

        const result = playMatch(white, black, { rules, maxPlies });
        pliesSum += result.plies;

        const wRating = ratings[whiteName]!;
        const bRating = ratings[blackName]!;

        if (result.truncated || !result.winner) {
          truncated += 1;
          draws += 1;
          const next = applyMatchResult(wRating, bRating, 'draw');
          ratings[whiteName] = next.white;
          ratings[blackName] = next.black;
        } else if (result.winner === PlayerColor.White) {
          whiteWins += 1;
          updateElo(elo, whiteName, blackName);
          const next = applyMatchResult(wRating, bRating, 'white');
          ratings[whiteName] = next.white;
          ratings[blackName] = next.black;
        } else {
          blackWins += 1;
          updateElo(elo, blackName, whiteName);
          const next = applyMatchResult(wRating, bRating, 'black');
          ratings[whiteName] = next.white;
          ratings[blackName] = next.black;
        }

        // Advance TEI hysteresis state after every rated outcome
        for (const n of [whiteName, blackName]) {
          const skill = toAgentSkill(n, ratings[n]!, teiGrade[n]);
          teiGrade[n] = skill.tei.grade;
        }
      }

      pairs.push({
        white: whiteName,
        black: blackName,
        games: gamesPerPairing,
        whiteWins,
        blackWins,
        draws,
        truncated,
        avgPlies: pliesSum / gamesPerPairing,
      });
      options.onPairingComplete?.({
        white: whiteName,
        black: blackName,
        whiteWins,
        blackWins,
        draws,
        index: pairingIndex,
        total: directed.length,
      });
    }
  }

  const openskill: Record<string, AgentSkill> = {};
  for (const name of names) {
    openskill[name] = toAgentSkill(name, ratings[name]!, teiGrade[name]);
  }
  const ranking = rankByOrdinal(openskill);

  let calibration: LadderResult['calibration'];
  if (options.expectedOrder?.length) {
    const cal = calibrationPairAccuracy(openskill, options.expectedOrder);
    calibration = { expectedOrder: options.expectedOrder, ...cal };
  }

  return {
    rulesVersion: rules.version,
    pairs,
    openskill,
    ranking,
    calibration,
    elo,
  };
}

export function formatLadderReport(result: LadderResult): string {
  const lines: string[] = [
    `Ladder (${result.rulesVersion})`,
    '',
    'TEI (skill + confidence — same universe as Warp):',
    ...result.ranking.map(
      (s) =>
        `  ${s.tei.formatted.padEnd(4)}  ${s.name}  μ ${s.mu.toFixed(2)}  σ ${s.sigma.toFixed(2)}  ordinal ${s.ordinal.toFixed(2)}`,
    ),
  ];

  if (result.calibration) {
    lines.push(
      '',
      `Calibration vs [${result.calibration.expectedOrder.join(' > ')}]: ${result.calibration.correctPairs}/${result.calibration.totalPairs} pairs (${(result.calibration.score * 100).toFixed(0)}%)`,
    );
  }

  lines.push(
    '',
    'Elo (legacy):',
    ...Object.entries(result.elo)
      .sort((a, b) => b[1] - a[1])
      .map(([name, rating]) => `  ${name}: ${rating.toFixed(1)}`),
    '',
    'Pairings (white vs black):',
  );
  for (const p of result.pairs) {
    lines.push(
      `  ${p.white} vs ${p.black}: W ${p.whiteWins}/${p.games} B ${p.blackWins}/${p.games} draw ${p.draws} avgPlies ${p.avgPlies.toFixed(1)}`,
    );
  }
  return lines.join('\n');
}

export interface MultiSeedLadderResult {
  seeds: number[];
  results: LadderResult[];
  /** Mean ordinal per agent across seeds. */
  meanOrdinal: Record<string, number>;
  /** Mean TEI score (0–99) per agent. */
  meanTeiScore: Record<string, number>;
  /** Fraction of seeds where expectedOrder calibration scored 1. */
  calibrationPassRate: number;
}

export function formatMultiSeedLadderReport(
  result: MultiSeedLadderResult,
): string {
  const lines = [
    `Multi-seed ladder (${result.seeds.length} seeds: ${result.seeds.join(', ')})`,
    `Calibration pass rate: ${(result.calibrationPassRate * 100).toFixed(0)}%`,
    '',
    'Mean ordinal / TEI score:',
    ...Object.entries(result.meanOrdinal)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([name, ord]) =>
          `  ${name}: ordinal ${ord.toFixed(2)}  TEI~${result.meanTeiScore[name]?.toFixed(0) ?? '?'}`,
      ),
  ];
  return lines.join('\n');
}
