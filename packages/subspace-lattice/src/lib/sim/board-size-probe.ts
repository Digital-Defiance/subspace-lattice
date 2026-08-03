/**
 * Lab probe: hybrid-fleet on N×N boards (default 11 vs 9) without shipping a
 * new rulesVersion. Overrides `boardSize` only (plus optional scaled radii).
 *
 * Usage (from packages/subspace-lattice):
 *   bash scripts/board-size-probe.sh
 *   bash scripts/board-size-probe.sh --games 40 --sizes 11,9 --scale-radii
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { HeuristicAi } from '../ai/heuristic-ai';
import { MctsAi } from '../ai/mcts-ai';
import { createSeededRng } from '../ai/rng';
import { SubspaceLatticeEngine } from '../game-engine';
import { PlayerColor } from '../interfaces/playerColor';
import { resolveRulesConfig } from '../rules/rules-config';
import { playMatch } from './match-runner';

type Cell = {
  label: string;
  boardSize: number;
  scaleRadii: boolean;
  matchup: 'HvH' | 'MvM';
  n: number;
  hub: number;
  sector: number;
  lockout: number;
  other: number;
  truncated: number;
  empFires: number;
  pliesSum: number;
  whiteWins: number;
  blackWins: number;
  openingLegal: number;
  openingSectorWhite: number;
};

function pct(n: number, d: number): string {
  if (d <= 0) return '—';
  return `${((100 * n) / d).toFixed(1)}%`;
}

function fleetRulesForBoard(boardSize: number, scaleRadii: boolean) {
  // Keep shipping knobs; only shrink geometry. Optional linear scale of
  // radii so EMP/sensors don't dominate a smaller plane.
  const scale = scaleRadii ? boardSize / 11 : 1;
  const round = (v: number) => Math.max(1, Math.round(v * scale));
  return resolveRulesConfig('hybrid-fleet', {
    boardSize,
    ...(scaleRadii
      ? {
          hubSensorRadius: round(3),
          escortSensorRadius: Math.max(1, Math.round(1 * scale)),
          linkDistance: round(2),
          empRadius: round(3),
          terminalEmpRadiusMax: Math.max(boardSize - 1, round(10)),
        }
      : {}),
  });
}

function openingSnapshot(boardSize: number, scaleRadii: boolean) {
  const rules = fleetRulesForBoard(boardSize, scaleRadii);
  const engine = new SubspaceLatticeEngine({ rules });
  return {
    openingLegal: engine.listLegalMoves(PlayerColor.White).length,
    openingSectorWhite: engine.sectorControlRatio(PlayerColor.White),
  };
}

function runCell(opts: {
  boardSize: number;
  scaleRadii: boolean;
  matchup: 'HvH' | 'MvM';
  n: number;
  seedBase: number;
  maxPlies: number;
  sims: number;
}): Cell {
  const rules = fleetRulesForBoard(opts.boardSize, opts.scaleRadii);
  const snap = openingSnapshot(opts.boardSize, opts.scaleRadii);
  const label = `${opts.boardSize}x${opts.boardSize}${opts.scaleRadii ? '+scale' : ''} ${opts.matchup}`;

  const cell: Cell = {
    label,
    boardSize: opts.boardSize,
    scaleRadii: opts.scaleRadii,
    matchup: opts.matchup,
    n: opts.n,
    hub: 0,
    sector: 0,
    lockout: 0,
    other: 0,
    truncated: 0,
    empFires: 0,
    pliesSum: 0,
    whiteWins: 0,
    blackWins: 0,
    openingLegal: snap.openingLegal,
    openingSectorWhite: snap.openingSectorWhite,
  };

  for (let i = 0; i < opts.n; i++) {
    const seed = opts.seedBase + i * 17;
    const white =
      opts.matchup === 'HvH'
        ? new HeuristicAi(createSeededRng(seed))
        : new MctsAi({
            simulations: opts.sims,
            rng: createSeededRng(seed),
          });
    const black =
      opts.matchup === 'HvH'
        ? new HeuristicAi(createSeededRng(seed + 911))
        : new MctsAi({
            simulations: opts.sims,
            rng: createSeededRng(seed + 911),
          });
    const result = playMatch(white, black, { rules, maxPlies: opts.maxPlies });
    cell.pliesSum += result.plies;
    cell.empFires += result.replay.filter((p) => p.empFired).length;
    if (result.truncated) cell.truncated += 1;
    else if (result.winnerReason === 'hub-capture') cell.hub += 1;
    else if (result.winnerReason === 'sector-integration') cell.sector += 1;
    else if (result.winnerReason === 'no-moves') cell.lockout += 1;
    else cell.other += 1;
    if (result.winner === PlayerColor.White) cell.whiteWins += 1;
    if (result.winner === PlayerColor.Black) cell.blackWins += 1;
  }

  return cell;
}

function formatCell(c: Cell): string {
  const decided = c.n - c.truncated;
  return [
    c.label.padEnd(22),
    `legal0=${c.openingLegal}`,
    `sec0=${c.openingSectorWhite.toFixed(3)}`,
    `W=${pct(c.whiteWins, decided)}`,
    `hub=${pct(c.hub, decided)}`,
    `sec=${pct(c.sector, decided)}`,
    `lock=${pct(c.lockout, decided)}`,
    `trunc=${pct(c.truncated, c.n)}`,
    `meanPly=${(c.pliesSum / c.n).toFixed(1)}`,
    `emp/g=${(c.empFires / c.n).toFixed(2)}`,
  ].join('  ');
}

function parseArgs(argv: string[]) {
  let games = 20;
  let seed = 41;
  let maxPlies = 400;
  let sims = 40;
  let sizes = [11, 9];
  let scale = false;
  let matchups: Array<'HvH' | 'MvM'> = ['HvH'];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--games' && argv[i + 1]) games = Number(argv[++i]);
    else if (a === '--seed' && argv[i + 1]) seed = Number(argv[++i]);
    else if (a === '--max-plies' && argv[i + 1]) maxPlies = Number(argv[++i]);
    else if (a === '--sims' && argv[i + 1]) sims = Number(argv[++i]);
    else if (a === '--sizes' && argv[i + 1]) {
      sizes = argv[++i]!.split(',').map(Number);
    } else if (a === '--scale-radii') scale = true;
    else if (a === '--mvm') matchups = ['HvH', 'MvM'];
    else if (a === '--matchups' && argv[i + 1]) {
      matchups = argv[++i]!
        .split(',')
        .filter((m): m is 'HvH' | 'MvM' => m === 'HvH' || m === 'MvM');
    }
  }
  return { games, seed, maxPlies, sims, sizes, scale, matchups };
}

function main(): void {
  const { games, seed, maxPlies, sims, sizes, scale, matchups } = parseArgs(
    process.argv.slice(2),
  );
  console.log(
    `board-size-probe — sizes=${sizes.join(',')} matchups=${matchups.join(',')} games=${games} maxPlies=${maxPlies} sims=${sims} scaleRadii=${scale}`,
  );

  const cells: Cell[] = [];
  for (const boardSize of sizes) {
    for (const matchup of matchups) {
      for (const scaleRadii of scale ? [false, true] : [false]) {
        const cell = runCell({
          boardSize,
          scaleRadii,
          matchup,
          n: games,
          seedBase: seed + boardSize * 1000 + (scaleRadii ? 500 : 0),
          maxPlies,
          sims,
        });
        cells.push(cell);
        console.log(formatCell(cell));
      }
    }
  }

  const outDir = resolve(process.cwd(), '../../docs/atlas/runs');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `board-size-probe-s${seed}-g${games}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generator: 'board-size-probe',
        at: new Date().toISOString(),
        note: 'Lab only — does not change shipping hybrid-fleet (boardSize 11).',
        games,
        seed,
        maxPlies,
        sims,
        sizes,
        matchups,
        scaleRadiiModes: scale ? [false, true] : [false],
        cells,
      },
      null,
      2,
    ),
  );
  console.log(`wrote ${outPath}`);
}

main();
