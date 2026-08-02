/**
 * Deep Lattice strength bar (ADR 007 / ROADMAP 2b.2).
 * Terminal goldens + candidates scored vs reference agents (heuristic + random).
 *
 * Bundled by scripts/neural-strength-bar.sh — not imported from browser.
 *
 * Usage:
 *   yarn neural:strength-bar --weights …/value-mlp-v4-gpu.json --jobs 12
 *   yarn neural:strength-bar --weights … --vs-deep --games 2 --jobs 12
 *
 * Default: deepish-N + mlp-N vs heuristic/random.
 * --vs-deep: shipping Deep@800 + mlp@800 (Deep search shape) — human-gate sample.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isEmpAgentMove } from './agent';
import { MctsAi, createAiForStrength } from './mcts-ai';
import { HeuristicAi, createSeededRng, createSequenceRng } from './heuristic-ai';
import {
  createMlpNeuralValue,
  setNeuralValueEvaluator,
  type MlpValueWeights,
} from './neural-value';
import { assertMlpWeights } from './mlp-value';
import type { AgentSpec } from './agent-spec';
import { formatLadderReport, type LadderResult } from '../sim/ladder';
import {
  nodeDefaultJobs,
  runLadderFromSpecs,
} from '../sim/ladder-spec-parallel';

/** Fail the bar if this fraction of games truncate (no decisive result). */
const MAX_TRUNC_RATE = 0.25;
const DEEP_SIMS = 800;

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  return argv[i + 1];
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

/** Candidate score vs reference from directed pairings (both colors). */
function vsReferenceRecord(
  ladder: LadderResult,
  candidate: string,
  reference: string,
): {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  truncated: number;
  winRate: number;
} {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let truncated = 0;
  let games = 0;
  for (const p of ladder.pairs) {
    if (p.white === candidate && p.black === reference) {
      games += p.games;
      wins += p.whiteWins;
      losses += p.blackWins;
      draws += p.draws;
      truncated += p.truncated;
    } else if (p.white === reference && p.black === candidate) {
      games += p.games;
      wins += p.blackWins;
      losses += p.whiteWins;
      draws += p.draws;
      truncated += p.truncated;
    }
  }
  const decisive = wins + losses;
  return {
    games,
    wins,
    losses,
    draws,
    truncated,
    winRate: decisive > 0 ? wins / decisive : 0,
  };
}

function printVsRef(
  label: string,
  rec: ReturnType<typeof vsReferenceRecord>,
): void {
  console.log(
    `  ${label}: ${rec.wins}-${rec.losses}-${rec.draws} ` +
      `(trunc ${rec.truncated}) · winRate ${(rec.winRate * 100).toFixed(0)}%`,
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const weightsPathRaw = argValue(argv, '--weights');
  if (!weightsPathRaw) {
    console.error('neural:strength-bar — --weights <value-mlp.json> required');
    process.exit(1);
  }
  const weightsPath = path.resolve(weightsPathRaw);
  const vsDeep = hasFlag(argv, '--vs-deep');
  const deepSims = vsDeep
    ? DEEP_SIMS
    : Number(argValue(argv, '--deep-sims') ?? '40');
  const games = Number(argValue(argv, '--games') ?? '2');
  const maxPlies = Number(
    argValue(argv, '--max-plies') ?? (vsDeep ? '300' : '400'),
  );
  const seed = Number(argValue(argv, '--seed') ?? (vsDeep ? '12' : '11'));
  const jobs = Number(argValue(argv, '--jobs') ?? String(nodeDefaultJobs()));
  const timeBudgetRaw = argValue(argv, '--time-budget-ms');
  const timeBudgetMs =
    timeBudgetRaw != null ? Number(timeBudgetRaw) : undefined;
  const skipLadder = hasFlag(argv, '--goldens-only');
  const fullRoundRobin = hasFlag(argv, '--full-round-robin');

  const weights = JSON.parse(
    readFileSync(weightsPath, 'utf8'),
  ) as MlpValueWeights;
  assertMlpWeights(weights);

  console.log('=== Terminal goldens ===');
  const { engineFromGolden, terminalLockoutInRange, terminalMissOutOfRange } =
    await import('../sim/terminal-goldens');
  const hit = engineFromGolden(terminalLockoutInRange());
  const miss = engineFromGolden(terminalMissOutOfRange());

  const heurHit = new HeuristicAi(createSequenceRng([0])).chooseMove(hit);
  const heurMiss = new HeuristicAi(createSequenceRng([0])).chooseMove(miss);
  console.log(
    `  heuristic: lockout EMP=${isEmpAgentMove(heurHit!)} refuseMiss=${!isEmpAgentMove(heurMiss!)}`,
  );

  setNeuralValueEvaluator(createMlpNeuralValue(weights));
  const mlpHit = new MctsAi({
    simulations: 40,
    rng: createSeededRng(1),
  }).chooseMove(hit);
  const mlpMiss = new MctsAi({
    simulations: 40,
    rng: createSeededRng(2),
  }).chooseMove(miss);
  setNeuralValueEvaluator(null);
  console.log(
    `  mcts-40-mlp: lockout EMP=${isEmpAgentMove(mlpHit!)} refuseMiss=${!isEmpAgentMove(mlpMiss!)}`,
  );

  const deepHit = createAiForStrength('deep', createSeededRng(3), {
    timeBudgetMs: 5_000,
  }).chooseMove(hit);
  console.log(`  deep (5s cap): lockout EMP=${isEmpAgentMove(deepHit!)}`);

  if (skipLadder) {
    setNeuralValueEvaluator(null);
    return;
  }

  const baselineName = vsDeep ? `deep-${deepSims}` : `deepish-${deepSims}`;
  const mlpName = `mcts-${deepSims}-mlp`;
  const heurName = 'heuristic';
  const randomName = 'random-legal';
  const candidates = new Set([baselineName, mlpName]);
  const references = new Set([heurName, randomName]);

  const mode = fullRoundRobin
    ? 'full round-robin'
    : vsDeep
      ? `Deep@${deepSims} gate · candidates vs [${[...references].join(', ')}]`
      : `candidates vs [${[...references].join(', ')}]`;
  console.log(
    `\n=== Ladder ${mode} · ${games} games/pair · maxPlies=${maxPlies} · jobs=${jobs}` +
      (timeBudgetMs != null ? ` · timeBudgetMs=${timeBudgetMs}` : '') +
      ` ===`,
  );
  if (vsDeep) {
    console.log(
      '  (equal search budget: Deep heuristic leaf vs MLP leaf, Deep search shape)',
    );
  }

  const agentSpecs: AgentSpec[] = [
    {
      kind: 'mcts',
      name: baselineName,
      simulations: deepSims,
      preset: vsDeep ? 'deep' : 'deepish',
      timeBudgetMs,
    },
    {
      kind: 'mcts-mlp',
      name: mlpName,
      simulations: deepSims,
      weightsPath,
      preset: vsDeep ? 'deep' : undefined,
      timeBudgetMs,
    },
    { kind: 'heuristic', name: heurName },
    { kind: 'random', name: randomName },
  ];

  const ladder = await runLadderFromSpecs({
    rulesVersion: 'hybrid-fleet',
    gamesPerPairing: games,
    seed,
    maxPlies,
    jobs,
    expectedOrder: [baselineName, heurName, randomName],
    agentSpecs,
    includePairing: fullRoundRobin
      ? undefined
      : (white, black) =>
          (candidates.has(white) && references.has(black)) ||
          (references.has(white) && candidates.has(black)),
    onGameComplete: (info) => {
      const tag = info.truncated
        ? 'trunc'
        : info.winner
          ? `${info.winner}${info.winnerReason ? '/' + info.winnerReason : ''}`
          : 'draw';
      console.log(
        `  game ${info.pairingIndex}.${info.gameIndex}/${info.gamesPerPairing} ` +
          `${info.white} vs ${info.black}: ${tag} (${info.plies} plies) ` +
          `[pairing ${info.pairingIndex}/${info.pairingTotal}]`,
      );
    },
  });

  console.log(formatLadderReport(ladder));

  const d = ladder.openskill[baselineName];
  const m = ladder.openskill[mlpName];
  const h = ladder.openskill[heurName];
  const r = ladder.openskill[randomName];
  if (d && m && h && r) {
    const floorOk =
      Math.min(d.ordinal, m.ordinal) > h.ordinal && h.ordinal > r.ordinal;
    console.log(
      `\nFloor (min(candidates) > heuristic > random): ${floorOk ? 'OK' : 'MISS'}` +
        ` · ${baselineName} ${d.ordinal.toFixed(2)} · mlp ${m.ordinal.toFixed(2)}` +
        ` · heur ${h.ordinal.toFixed(2)} · rand ${r.ordinal.toFixed(2)}`,
    );
  }

  const totalGames = ladder.pairs.reduce((s, p) => s + p.games, 0);
  const totalTrunc = ladder.pairs.reduce((s, p) => s + p.truncated, 0);
  const truncRate = totalGames > 0 ? totalTrunc / totalGames : 1;
  console.log(
    `\nTruncation: ${totalTrunc}/${totalGames} (${(truncRate * 100).toFixed(0)}%)`,
  );

  console.log(`\nvs ${heurName} (skill yardstick · decisive win rate):`);
  const deepVsH = vsReferenceRecord(ladder, baselineName, heurName);
  const mlpVsH = vsReferenceRecord(ladder, mlpName, heurName);
  printVsRef(baselineName, deepVsH);
  printVsRef(mlpName, mlpVsH);

  console.log(`\nvs ${randomName} (decisiveness floor · decisive win rate):`);
  const deepVsR = vsReferenceRecord(ladder, baselineName, randomName);
  const mlpVsR = vsReferenceRecord(ladder, mlpName, randomName);
  printVsRef(baselineName, deepVsR);
  printVsRef(mlpName, mlpVsR);

  if (d && m) {
    console.log(
      `\nordinal gap (${baselineName} − mlp): ${(d.ordinal - m.ordinal).toFixed(2)}`,
    );
  }
  if (m && h) {
    console.log(
      `ordinal gap (mlp − heuristic): ${(m.ordinal - h.ordinal).toFixed(2)}`,
    );
  }
  if (d && m && m.ordinal > d.ordinal) {
    console.log(
      vsDeep
        ? 'NOTE: MLP leaf outranks Deep@800 on this sample — still needs human gate before shipping.'
        : 'NOTE: MLP leaf outranks deepish on this sample — still needs human gate + Deep@800 before shipping.',
    );
  }

  let failed = false;
  if (truncRate > MAX_TRUNC_RATE) {
    console.error(
      `\nFAIL: truncation ${(truncRate * 100).toFixed(0)}% > ${(MAX_TRUNC_RATE * 100).toFixed(0)}% — bar is inconclusive.`,
    );
    failed = true;
  }
  if (
    deepVsR.wins + deepVsR.losses === 0 ||
    mlpVsR.wins + mlpVsR.losses === 0
  ) {
    console.error(
      'FAIL: no decisive games vs random-legal for at least one candidate.',
    );
    failed = true;
  }
  if (d && m && h && r) {
    const floorOk =
      Math.min(d.ordinal, m.ordinal) > h.ordinal && h.ordinal > r.ordinal;
    if (!floorOk) {
      console.error(
        'FAIL: ordinal floor miss (expect min(candidates) > heuristic > random).',
      );
      failed = true;
    }
  }

  setNeuralValueEvaluator(null);
  if (failed) process.exit(2);
  console.log(
    vsDeep
      ? '\nPASS: Deep@800 gate sample is usable (truncation under cap).'
      : '\nPASS: strength bar sample is usable (truncation under cap).',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
