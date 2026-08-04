/**
 * Terminal Overclock probe suite — geometry, hubs-only Monte Carlo,
 * asymmetry, AI fire discipline, and midgame EMP regression.
 *
 * Usage (from packages/subspace-lattice):
 *   bash scripts/terminal-overclock-probe.sh
 *   bash scripts/terminal-overclock-probe.sh --games 40 --max-plies 120
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { HeuristicAi } from '../ai/heuristic-ai';
import { MctsAi } from '../ai/mcts-ai';
import { RandomLegalAgent } from '../ai/random-legal-agent';
import { createSeededRng } from '../ai/rng';
import { SubspaceLatticeEngine } from '../game-engine';
import { CellType } from '../interfaces/cellType';
import type { GameState } from '../interfaces/gameState';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import {
  resolveRulesConfig,
  type RulesConfig,
} from '../rules/rules-config';
import { playMatch } from './match-runner';

type Matchup = 'HvH' | 'HvR' | 'MvH';

type CellStats = {
  label: string;
  n: number;
  truncated: number;
  lockout: number;
  hub: number;
  sector: number;
  other: number;
  whiteWins: number;
  empFires: number;
  terminalHits: number;
  terminalMisses: number;
  pliesSum: number;
};

function pct(n: number, d: number): string {
  if (d <= 0) return '—';
  return `${((100 * n) / d).toFixed(1)}%`;
}

function argNum(argv: string[], name: string, fallback: number): number {
  const hit = argv.find((a) => a.startsWith(`${name}=`));
  if (!hit) return fallback;
  const v = Number(hit.slice(name.length + 1));
  return Number.isFinite(v) ? v : fallback;
}

function chebyshev(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function playableCells(boardSize = 11): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];
  const mid = Math.floor(boardSize / 2);
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      if (x === mid && y === mid) continue;
      cells.push({ x, y });
    }
  }
  return cells;
}

function geometryReport(radius: number) {
  const cells = playableCells();
  let outOfRange = 0;
  let total = 0;
  const safeCounts: number[] = [];
  for (const f of cells) {
    let safe = 0;
    for (const e of cells) {
      if (f.x === e.x && f.y === e.y) continue;
      total += 1;
      if (chebyshev(f, e) > radius) {
        safe += 1;
        outOfRange += 1;
      }
    }
    safeCounts.push(safe);
  }
  const mean =
    safeCounts.reduce((a, b) => a + b, 0) / Math.max(safeCounts.length, 1);
  return {
    radius,
    playable: cells.length,
    pctPairsOutOfRange: (100 * outOfRange) / total,
    safeEnemySquares: {
      min: Math.min(...safeCounts),
      max: Math.max(...safeCounts),
      mean,
    },
    anomalyOppositesHit: {
      northSouth: chebyshev({ x: 5, y: 2 }, { x: 5, y: 8 }) <= radius,
      eastWest: chebyshev({ x: 2, y: 5 }, { x: 8, y: 5 }) <= radius,
      corners: chebyshev({ x: 0, y: 0 }, { x: 10, y: 10 }) <= radius,
    },
  };
}

function bareState(rules: RulesConfig): GameState {
  const engine = new SubspaceLatticeEngine({ rules });
  const state = engine.getStateCopy();
  for (const c of state.cells) delete c.pieceId;
  state.pieces = {};
  state.currentPlayer = PlayerColor.White;
  state.plyCount = 120;
  state.empCharge = {
    [PlayerColor.White]: 0,
    [PlayerColor.Black]: 0,
  };
  delete state.winner;
  delete state.winnerReason;
  delete state.empActive;
  return state;
}

function place(
  state: GameState,
  id: string,
  type: PieceType,
  owner: PlayerColor,
  x: number,
  y: number,
): void {
  state.pieces[id] = { id, type, owner, position: { x, y } };
  const cell = state.cells.find(
    (c) => c.coordinate.x === x && c.coordinate.y === y,
  );
  if (!cell || cell.type === CellType.GravityWell) {
    throw new Error(`bad cell ${x},${y}`);
  }
  cell.pieceId = id;
}

function hubsOnlyEngine(
  rules: RulesConfig,
  seed: number,
): SubspaceLatticeEngine {
  const cells = playableCells();
  const rng = createSeededRng(seed);
  const pick = () => cells[Math.floor(rng() * cells.length)]!;
  let w = pick();
  let b = pick();
  let guard = 0;
  while ((w.x === b.x && w.y === b.y) || chebyshev(w, b) < 6) {
    b = pick();
    guard += 1;
    if (guard > 200) {
      w = { x: 1, y: 1 };
      b = { x: 9, y: 9 };
      break;
    }
  }
  return hubsOnlyEngineAt(rules, w.x, w.y, b.x, b.y);
}

function hubsOnlyEngineAt(
  rules: RulesConfig,
  wx: number,
  wy: number,
  bx: number,
  by: number,
): SubspaceLatticeEngine {
  const state = bareState(rules);
  place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, wx, wy);
  place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, bx, by);
  return SubspaceLatticeEngine.fromState(state, rules);
}

function loneVsEscortEngine(
  rules: RulesConfig,
  /** White is the lone Hub when true. */
  whiteLone: boolean,
): SubspaceLatticeEngine {
  const state = bareState(rules);
  if (whiteLone) {
    place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 2, 2);
    place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 8, 8);
    place(state, 'b-e1', PieceType.Escort, PlayerColor.Black, 8, 7);
  } else {
    place(state, 'w-ch', PieceType.CommandHub, PlayerColor.White, 2, 2);
    place(state, 'w-e1', PieceType.Escort, PlayerColor.White, 2, 3);
    place(state, 'b-ch', PieceType.CommandHub, PlayerColor.Black, 8, 8);
  }
  return SubspaceLatticeEngine.fromState(state, rules);
}

function makeAgent(matchup: Matchup, seed: number) {
  if (matchup === 'HvR') {
    return {
      white: new HeuristicAi(createSeededRng(seed)),
      black: new RandomLegalAgent(createSeededRng(seed + 911)),
    };
  }
  if (matchup === 'MvH') {
    return {
      white: new MctsAi({
        simulations: 30,
        rng: createSeededRng(seed),
      }),
      black: new HeuristicAi(createSeededRng(seed + 911)),
    };
  }
  return {
    white: new HeuristicAi(createSeededRng(seed)),
    black: new HeuristicAi(createSeededRng(seed + 911)),
  };
}

function classifyTerminalFires(
  engineFactory: () => SubspaceLatticeEngine,
  replay: ReturnType<typeof playMatch>['replay'],
  rules: RulesConfig,
): { hits: number; misses: number } {
  // Replay from a fresh clone and score each EMP: hit = winner on that ply.
  let hits = 0;
  let misses = 0;
  const live = engineFactory();
  for (const ply of replay) {
    if (!ply.empFired) {
      const ok = live.movePiece(ply.pieceId, ply.to);
      if (!ok) break;
      continue;
    }
    const beforeWinner = live.getState().winner;
    const ok = live.fireEmp();
    if (!ok) break;
    const after = live.getState();
    if (!beforeWinner && after.winnerReason === 'no-moves') hits += 1;
    else if (!after.winner) misses += 1;
    // If sector won on the EMP ply, count neither.
  }
  void rules;
  return { hits, misses };
}

function emptyStats(label: string, n: number): CellStats {
  return {
    label,
    n,
    truncated: 0,
    lockout: 0,
    hub: 0,
    sector: 0,
    other: 0,
    whiteWins: 0,
    empFires: 0,
    terminalHits: 0,
    terminalMisses: 0,
    pliesSum: 0,
  };
}

function runBatch(opts: {
  label: string;
  rules: RulesConfig;
  n: number;
  maxPlies: number;
  matchup: Matchup;
  seedBase: number;
  engineFactory: (seed: number) => SubspaceLatticeEngine;
}): CellStats {
  const cell = emptyStats(opts.label, opts.n);
  for (let i = 0; i < opts.n; i++) {
    const seed = opts.seedBase + i * 17;
    const { white, black } = makeAgent(opts.matchup, seed);
    const factory = () => opts.engineFactory(seed);
    const r = playMatch(white, black, {
      engine: factory(),
      rules: opts.rules,
      maxPlies: opts.maxPlies,
    });
    cell.pliesSum += r.plies;
    cell.empFires += r.replay.filter((p) => p.empFired).length;
    if (r.winner === PlayerColor.White) cell.whiteWins += 1;
    const fires = classifyTerminalFires(factory, r.replay, opts.rules);
    cell.terminalHits += fires.hits;
    cell.terminalMisses += fires.misses;
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
      case 'ai-resigned':
        cell.other += 1;
        break;
      default:
        cell.other += 1;
    }
  }
  return cell;
}

function formatCell(c: CellStats): string {
  const decided = c.n - c.truncated;
  return [
    c.label.padEnd(48),
    `n=${c.n}`,
    `trunc=${pct(c.truncated, c.n)}`,
    `lock=${pct(c.lockout, c.n)}`,
    `hub=${pct(c.hub, c.n)}`,
    `W=${pct(c.whiteWins, decided)}`,
    `empFires=${c.empFires}`,
    `hit/miss=${c.terminalHits}/${c.terminalMisses}`,
    `avgPlies=${(c.pliesSum / c.n).toFixed(1)}`,
  ].join('  ');
}

function fleetRules(overrides: Partial<RulesConfig> = {}): RulesConfig {
  return resolveRulesConfig('hybrid-fleet', {
    firstPlayerRelayCount: 0,
    sectorActivationPly: 10_000,
    sectorHoldPlies: 999,
    ...overrides,
  });
}

/** Progressive balance dials — try in order. */
function dialRules(
  level: 0 | 1 | 2 | 3,
  extras: Partial<RulesConfig> = {},
): RulesConfig {
  const base = {
    empRadius: 3,
    empChargeTarget: 15,
    terminalOverclock: true as boolean,
    terminalEmpChargeTarget: 10,
    terminalEmpRadius: 3,
    terminalRequiresBothLone: false,
    terminalSharedPhaseClock: false,
    terminalPhaseEntryKomi: 0,
  };
  if (level >= 1) base.terminalRequiresBothLone = true;
  if (level >= 2) base.terminalSharedPhaseClock = true;
  if (level >= 3) base.terminalPhaseEntryKomi = 1;
  return fleetRules({ ...base, ...extras });
}


function main(): void {
  const argv = process.argv.slice(2);
  const games = argNum(argv, '--games', 40);
  const maxPlies = argNum(argv, '--max-plies', 120);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const geometry = [3, 4, 5].map(geometryReport);

  const cells: CellStats[] = [];

  // --- Dial ladder (primary balance question) ---
  for (const level of [0, 1, 2, 3] as const) {
    const rules = dialRules(level);
    const names = [
      'dial0 lone-any',
      'dial1 both-lone',
      'dial2 +shared-clock',
      'dial3 +entry-komi',
    ];
    cells.push(
      runBatch({
        label: `${names[level]} T=10 r=3 HvH`,
        rules,
        n: games,
        maxPlies,
        matchup: 'HvH',
        seedBase: 40_000 + level * 1000,
        engineFactory: (seed) => hubsOnlyEngine(rules, seed),
      }),
    );
    cells.push(
      runBatch({
        label: `${names[level]} asym White-lone HvH`,
        rules,
        n: games,
        maxPlies,
        matchup: 'HvH',
        seedBase: 41_000 + level * 1000,
        engineFactory: () => loneVsEscortEngine(rules, true),
      }),
    );
  }

  // OFF baseline (no Terminal)
  {
    const rules = dialRules(0, { terminalOverclock: false });
    cells.push(
      runBatch({
        label: 'hubs OFF HvH',
        rules,
        n: games,
        maxPlies,
        matchup: 'HvH',
        seedBase: 42_000,
        engineFactory: (seed) => hubsOnlyEngine(rules, seed),
      }),
    );
  }

  // Shipping combo extras
  {
    const rules = dialRules(3);
    cells.push(
      runBatch({
        label: 'ship dial3 T=10 r=3 HvR',
        rules,
        n: games,
        maxPlies,
        matchup: 'HvR',
        seedBase: 55_000,
        engineFactory: (seed) => hubsOnlyEngine(rules, seed),
      }),
    );
    const mctsGames = Math.min(12, games);
    cells.push(
      runBatch({
        label: 'ship dial3 T=10 r=3 MvH',
        rules,
        n: mctsGames,
        maxPlies,
        matchup: 'MvH',
        seedBase: 66_000,
        engineFactory: (seed) => hubsOnlyEngine(rules, seed),
      }),
    );
    cells.push(
      runBatch({
        label: 'ship dial3 asym Black-lone HvH',
        rules,
        n: games,
        maxPlies,
        matchup: 'HvH',
        seedBase: 78_000,
        engineFactory: () => loneVsEscortEngine(rules, false),
      }),
    );
  }

  // Midgame regression
  {
    const on = resolveRulesConfig('hybrid-fleet');
    const off = resolveRulesConfig('hybrid-fleet', {
      terminalOverclock: false,
    });
    for (const [label, rules] of [
      ['fleet midgame Terminal ON HvR', on],
      ['fleet midgame Terminal OFF HvR', off],
    ] as const) {
      cells.push(
        runBatch({
          label,
          rules,
          n: games,
          maxPlies: 200,
          matchup: 'HvR',
          seedBase: label.includes('ON') ? 88_000 : 89_000,
          engineFactory: () => new SubspaceLatticeEngine({ rules }),
        }),
      );
    }
  }

  const answers = deriveAnswers(geometry, cells, games, maxPlies);

  const outDir = resolve('docs/sim-runs');
  mkdirSync(outDir, { recursive: true });
  const jsonPath = resolve(outDir, `terminal-overclock-probe-${stamp}.json`);
  const mdPath = resolve(
    outDir,
    `../terminal-overclock-probe-${stamp}.md`.replace(
      'sim-runs/../',
      '',
    ),
  );
  // Prefer docs/ next to sim-runs
  const docPath = resolve('docs', `terminal-overclock-probe-${stamp}.md`);

  const payload = {
    ranAt: new Date().toISOString(),
    games,
    maxPlies,
    geometry,
    cells,
    answers,
  };
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  writeFileSync(docPath, renderMarkdown(payload));

  console.log('\nTerminal Overclock probe\n');
  console.log('Geometry:');
  for (const g of geometry) {
    console.log(
      `  r=${g.radius}  outOfRange=${g.pctPairsOutOfRange.toFixed(1)}%  safe~${g.safeEnemySquares.mean.toFixed(0)}  anomalyNS=${g.anomalyOppositesHit.northSouth}`,
    );
  }
  console.log('\nCells:');
  for (const c of cells) console.log(' ', formatCell(c));
  console.log('\nAnswers:');
  for (const [q, a] of Object.entries(answers)) {
    console.log(`  ${q}: ${a}`);
  }
  console.log(`\nWrote ${jsonPath}`);
  console.log(`Wrote ${docPath}`);
  void mdPath;
}

function deriveAnswers(
  geometry: ReturnType<typeof geometryReport>[],
  cells: CellStats[],
  games: number,
  maxPlies: number,
): Record<string, string> {
  const g3 = geometry.find((g) => g.radius === 3)!;
  const off = cells.find((c) => c.label === 'hubs OFF HvH');
  const dial = (n: number) =>
    cells.find(
      (c) =>
        c.label.startsWith(`dial${n}`) &&
        c.label.includes('T=10') &&
        !c.label.includes('asym'),
    );
  const asym = (n: number) =>
    cells.find(
      (c) => c.label.startsWith(`dial${n}`) && c.label.includes('asym'),
    );
  const d0 = dial(0);
  const d1 = dial(1);
  const d2 = dial(2);
  const d3 = dial(3);
  const a0 = asym(0);
  const a1 = asym(1);
  const a3 = asym(3);
  const midOn = cells.find((c) => c.label.includes('midgame Terminal ON'));
  const midOff = cells.find((c) => c.label.includes('midgame Terminal OFF'));
  const mcts = cells.find((c) => c.label.includes('MvH'));

  const wr = (c: CellStats | undefined) =>
    c && c.n - c.truncated > 0
      ? pct(c.whiteWins, c.n - c.truncated)
      : '—';

  return {
    'Dial0 (lone-any) hubs-only trunc / White WR?':
      d0
        ? `trunc ${pct(d0.truncated, d0.n)}; W ${wr(d0)}; lock ${pct(d0.lockout, d0.n)}`
        : 'missing',
    'Dial1 (both-lone) fixes lone-vs-escort reward?':
      a0 && a1
        ? `asym White-lone WR dial0 ${wr(a0)} → dial1 ${wr(a1)} (want lone side <<50% or richer favored via hub captures)`
        : 'missing',
    'Dial2 (shared clock) hubs-only White WR vs dial1?':
      d1 && d2
        ? `W ${wr(d1)} → ${wr(d2)}; trunc ${pct(d1.truncated, d1.n)} → ${pct(d2.truncated, d2.n)}`
        : 'missing',
    'Dial3 (entry komi) hubs-only White WR vs dial2?':
      d2 && d3
        ? `W ${wr(d2)} → ${wr(d3)}; trunc ${pct(d2.truncated, d2.n)} → ${pct(d3.truncated, d3.n)}`
        : 'missing',
    'Shipping dial3 vs OFF truncate?':
      d3 && off
        ? `ON trunc ${pct(d3.truncated, d3.n)} vs OFF ${pct(off.truncated, off.n)}`
        : 'missing',
    'Anomaly kite geometry r=3?':
      `~${g3.pctPairsOutOfRange.toFixed(1)}% pairs out of blast; N/S opposite hit=${g3.anomalyOppositesHit.northSouth}`,
    'AI hit/miss on dial3?':
      d3
        ? `HvH ${d3.terminalHits}/${d3.terminalMisses}; MCTS ${mcts ? `${mcts.terminalHits}/${mcts.terminalMisses}` : '—'}`
        : 'missing',
    'Midgame regression?':
      midOn && midOff
        ? `ON lock ${pct(midOn.lockout, midOn.n)} hub ${pct(midOn.hub, midOn.n)} | OFF lock ${pct(midOff.lockout, midOff.n)} hub ${pct(midOff.hub, midOff.n)}`
        : 'missing',
    'Asymmetry dial3 White-lone / Black-lone?':
      a3
        ? `White-lone WR ${wr(a3)}; Black-lone cell ${cells.find((c) => c.label.includes('Black-lone')) ? wr(cells.find((c) => c.label.includes('Black-lone'))) : '—'}`
        : 'missing',
    'maxPlies budget': `${maxPlies} · games/cell ${games}`,
  };
}

function renderMarkdown(payload: {
  ranAt: string;
  games: number;
  maxPlies: number;
  geometry: ReturnType<typeof geometryReport>[];
  cells: CellStats[];
  answers: Record<string, string>;
}): string {
  const lines: string[] = [
    '# Terminal Overclock probe results',
    '',
    `Ran at: ${payload.ranAt}`,
    `Games/cell: ${payload.games} · maxPlies: ${payload.maxPlies}`,
    '',
    '## Firm answers',
    '',
  ];
  for (const [q, a] of Object.entries(payload.answers)) {
    lines.push(`- **${q}** ${a}`);
  }
  lines.push('', '## Geometry', '');
  for (const g of payload.geometry) {
    lines.push(
      `- r=${g.radius}: ${g.pctPairsOutOfRange.toFixed(1)}% Hub pairs out of range; mean safe squares ${g.safeEnemySquares.mean.toFixed(1)}; Anomaly N/S opposite in blast: ${g.anomalyOppositesHit.northSouth}`,
    );
  }
  lines.push('', '## Cells', '', '```');
  for (const c of payload.cells) lines.push(formatCell(c));
  lines.push('```', '');
  return `${lines.join('\n')}\n`;
}

main();
