/**
 * EMP balance probe: grid over empRadius × empChargeTarget × empBlackoutPlies.
 *
 * Usage (from packages/subspace-lattice):
 *   bash scripts/emp-balance-probe.sh
 *   bash scripts/emp-balance-probe.sh --games 60
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { HeuristicAi } from '../ai/heuristic-ai';
import { RandomLegalAgent } from '../ai/random-legal-agent';
import { createSeededRng } from '../ai/rng';
import { resolveRulesConfig } from '../rules/rules-config';
import { playMatch } from './match-runner';

type Cell = {
  empRadius: number;
  empChargeTarget: number;
  empBlackoutPlies: number;
  matchup: 'HvR' | 'HvH';
  clock: 'deferred' | 'fleet';
  n: number;
  lockout: number;
  hub: number;
  sector: number;
  resign: number;
  other: number;
  truncated: number;
  empFires: number;
  pliesSum: number;
  whiteWins: number;
};

function pct(n: number, d: number): string {
  if (d <= 0) return '—';
  return `${((100 * n) / d).toFixed(1)}%`;
}

function runCell(opts: {
  empRadius: number;
  empChargeTarget: number;
  empBlackoutPlies: number;
  matchup: 'HvR' | 'HvH';
  clock: 'deferred' | 'fleet';
  n: number;
  seedBase: number;
}): Cell {
  const rules = resolveRulesConfig('hybrid-fleet', {
    empRadius: opts.empRadius,
    empChargeTarget: opts.empChargeTarget,
    empBlackoutPlies: opts.empBlackoutPlies,
    ...(opts.clock === 'deferred'
      ? { sectorActivationPly: 10_000, sectorHoldPlies: 999 }
      : {}),
  });

  const cell: Cell = {
    empRadius: opts.empRadius,
    empChargeTarget: opts.empChargeTarget,
    empBlackoutPlies: opts.empBlackoutPlies,
    matchup: opts.matchup,
    clock: opts.clock,
    n: opts.n,
    lockout: 0,
    hub: 0,
    sector: 0,
    resign: 0,
    other: 0,
    truncated: 0,
    empFires: 0,
    pliesSum: 0,
    whiteWins: 0,
  };

  for (let i = 0; i < opts.n; i++) {
    const seed = opts.seedBase + i * 17;
    const white = new HeuristicAi(createSeededRng(seed));
    const black =
      opts.matchup === 'HvH'
        ? new HeuristicAi(createSeededRng(seed + 911))
        : new RandomLegalAgent(createSeededRng(seed + 911));
    const r = playMatch(white, black, { rules, maxPlies: 200 });
    cell.pliesSum += r.plies;
    cell.empFires += r.replay.filter((p) => p.empFired).length;
    if (r.winner === 'WHITE') cell.whiteWins += 1;
    if (r.truncated) {
      cell.truncated += 1;
      continue;
    }
    switch (r.winnerReason) {
      case 'no-moves':
        cell.lockout += 1;
        break;
      case 'hub-capture':
        cell.hub += 1;
        break;
      case 'sector-integration':
        cell.sector += 1;
        break;
      case 'resign':
        cell.resign += 1;
        break;
      default:
        cell.other += 1;
    }
  }
  return cell;
}

function scoreCell(c: Cell): number {
  // Prefer rare-but-real Lockout under deferred clock, Hub still dominant,
  // EMP used sometimes but not every game, games finish.
  const decisive = c.n - c.truncated;
  if (decisive <= 0) return -100;
  const lockRate = c.lockout / decisive;
  const hubRate = c.hub / decisive;
  const empPerGame = c.empFires / c.n;
  const truncRate = c.truncated / c.n;

  let score = 0;
  // Target Lockout ~2–10% of decisive games (deferred)
  if (c.clock === 'deferred') {
    if (lockRate >= 0.02 && lockRate <= 0.1) score += 40;
    else if (lockRate > 0 && lockRate < 0.02) score += 20;
    else if (lockRate > 0.1 && lockRate <= 0.2) score += 10;
    else if (lockRate === 0) score -= 15;
    else score -= 25; // flood
  } else {
    // With live clock, Lockout should stay very rare
    if (lockRate === 0) score += 10;
    else if (lockRate <= 0.03) score += 5;
    else score -= 20;
  }

  if (hubRate >= 0.55) score += 25;
  else if (hubRate >= 0.4) score += 10;
  else score -= 15;

  if (empPerGame >= 0.05 && empPerGame <= 0.6) score += 20;
  else if (empPerGame > 0 && empPerGame < 0.05) score += 5;
  else if (empPerGame > 0.6 && empPerGame <= 1.2) score += 0;
  else if (empPerGame === 0) score -= 10;
  else score -= 20;

  if (truncRate <= 0.15) score += 10;
  else score -= truncRate * 40;

  return score;
}

/**
 * Focused confirm on a handful of candidate knob sets, across both matchups
 * and both clock settings. Use after the full grid to sanity-check a default.
 *   bash scripts/emp-balance-probe.sh --confirm --games=120
 */
function runConfirm(n: number): void {
  const candidates: Array<[number, number, number]> = [
    [0, 0, 1],
    [2, 15, 1],
    [3, 15, 1],
    [3, 15, 2],
    [3, 20, 1],
    [4, 15, 1],
  ];
  let seedBase = 700_000;
  const cells: Cell[] = [];
  for (const [empRadius, empChargeTarget, empBlackoutPlies] of candidates) {
    for (const matchup of ['HvR', 'HvH'] as const) {
      for (const clock of ['deferred', 'fleet'] as const) {
        const cell = runCell({
          empRadius,
          empChargeTarget,
          empBlackoutPlies,
          matchup,
          clock,
          n,
          seedBase,
        });
        seedBase += 10_000;
        cells.push(cell);
        const decisive = cell.n - cell.truncated;
        console.error(
          `${matchup}/${clock} r=${empRadius} t=${empChargeTarget} b=${empBlackoutPlies}: ` +
            `lock=${cell.lockout} (${pct(cell.lockout, decisive)}) hub=${cell.hub} (${pct(cell.hub, decisive)}) ` +
            `sector=${cell.sector} trunc=${cell.truncated} fires/game=${(cell.empFires / cell.n).toFixed(2)}`,
        );
      }
    }
  }
  const outDir = resolve(process.cwd(), 'docs/sim-runs');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outPath = resolve(outDir, `emp-confirm-${stamp}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        gamesPerCell: n,
        maxPlies: 200,
        note: 'Enemy-only EMP default confirm.',
        cells,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ outPath }, null, 2));
}

function main(): void {
  const gamesArg = process.argv.find((a) => a.startsWith('--games='));
  const n = gamesArg ? Math.max(10, Number(gamesArg.split('=')[1])) : 40;

  if (process.argv.includes('--confirm')) {
    runConfirm(n);
    return;
  }

  const radii = [0, 1, 2, 3, 4, 5];
  const charges = [0, 5, 8, 12, 15, 20, 30];
  const blackouts = [1, 2, 3];
  // Skip nonsense: both 0 = off; radius 0 with charge >0 = off (empEnabled requires both >0)
  const cells: Cell[] = [];

  console.error(`EMP balance probe: ${n} games/cell, HvR + HvH, deferred clock…`);

  let seedBase = 50_000;
  for (const matchup of ['HvR', 'HvH'] as const) {
    for (const empRadius of radii) {
      for (const empChargeTarget of charges) {
        const off = empRadius === 0 || empChargeTarget === 0;
        if (off && !(empRadius === 0 && empChargeTarget === 0)) {
          continue; // redundant off
        }
        // Blackout length is meaningless when EMP is off.
        for (const empBlackoutPlies of off ? [1] : blackouts) {
          const cell = runCell({
            empRadius,
            empChargeTarget,
            empBlackoutPlies,
            matchup,
            clock: 'deferred',
            n,
            seedBase,
          });
          cells.push(cell);
          seedBase += 10_000;
          console.error(
            `${matchup} r=${empRadius} t=${empChargeTarget} b=${empBlackoutPlies}: lock=${cell.lockout} hub=${cell.hub} empFires=${cell.empFires} trunc=${cell.truncated}`,
          );
        }
      }
    }
  }

  // Live-clock confirm on top deferred HvH candidates
  const hvhDeferred = cells
    .filter((c) => c.matchup === 'HvH' && c.clock === 'deferred')
    .map((c) => ({ c, s: scoreCell(c) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 5);

  console.error('Live-clock confirm on top HvH candidates…');
  for (const { c } of hvhDeferred) {
    if (c.empRadius === 0) continue;
    const live = runCell({
      empRadius: c.empRadius,
      empChargeTarget: c.empChargeTarget,
      empBlackoutPlies: c.empBlackoutPlies,
      matchup: 'HvH',
      clock: 'fleet',
      n,
      seedBase,
    });
    cells.push(live);
    seedBase += 10_000;
    console.error(
      `HvH fleet r=${live.empRadius} t=${live.empChargeTarget} b=${live.empBlackoutPlies}: lock=${live.lockout} hub=${live.hub} sector=${live.sector} empFires=${live.empFires}`,
    );
  }

  const ranked = cells
    .filter((c) => c.clock === 'deferred' && c.matchup === 'HvH')
    .map((c) => ({
      ...c,
      score: scoreCell(c),
      lockPct: pct(c.lockout, c.n - c.truncated),
      hubPct: pct(c.hub, c.n - c.truncated),
      empPerGame: (c.empFires / c.n).toFixed(2),
      meanPlies: (c.pliesSum / c.n).toFixed(1),
    }))
    .sort((a, b) => b.score - a.score);

  const outDir = resolve(process.cwd(), 'docs/sim-runs');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outPath = resolve(outDir, `emp-balance-${stamp}.json`);
  const payload = {
    generatedAt: new Date().toISOString(),
    gamesPerCell: n,
    maxPlies: 200,
    note: 'Enemy-only EMP; blackout length varied via empBlackoutPlies. Clock deferred unless clock=fleet.',
    rankedHvHDeferred: ranked,
    allCells: cells,
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ outPath, top: ranked.slice(0, 8) }, null, 2));
}

main();
