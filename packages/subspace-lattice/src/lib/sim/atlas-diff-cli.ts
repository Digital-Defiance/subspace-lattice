/**
 * Lattice Atlas diff — compare two observe JSONL corpora; print biggest deltas.
 *
 * Usage:
 *   yarn atlas:diff --a docs/atlas/runs/a.jsonl --b docs/atlas/runs/b.jsonl
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  return argv[i + 1];
}

type Counters = {
  games: number;
  hub: number;
  sector: number;
  noMoves: number;
  trunc: number;
  empFires: number;
  pliesSum: number;
  infiltratorCaptures: number;
  spoolAnnounces: number;
  mover: Record<string, number>;
  capture: Record<string, number>;
  whiteWins: number;
  blackWins: number;
};

function empty(): Counters {
  return {
    games: 0,
    hub: 0,
    sector: 0,
    noMoves: 0,
    trunc: 0,
    empFires: 0,
    pliesSum: 0,
    infiltratorCaptures: 0,
    spoolAnnounces: 0,
    mover: {},
    capture: {},
    whiteWins: 0,
    blackWins: 0,
  };
}

function bump(map: Record<string, number>, key: string, n = 1): void {
  map[key] = (map[key] ?? 0) + n;
}

function load(filePath: string): Counters {
  const c = empty();
  const text = readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (row.type === 'ply') {
      bump(c.mover, String(row.mover ?? '?'));
      if (row.capture) bump(c.capture, String(row.capture));
      if (row.emp) c.empFires += 1;
      continue;
    }
    if (row.type === 'game') {
      c.games += 1;
      c.pliesSum += Number(row.plies ?? 0);
      c.infiltratorCaptures += Number(row.infiltratorCaptures ?? 0);
      c.spoolAnnounces += Number(row.spoolAnnounces ?? 0);
      if (row.truncated) c.trunc += 1;
      else if (row.reason === 'hub-capture') c.hub += 1;
      else if (row.reason === 'sector-integration') c.sector += 1;
      else if (row.reason === 'no-moves') c.noMoves += 1;
      if (row.winner === 'W') c.whiteWins += 1;
      if (row.winner === 'B') c.blackWins += 1;
    }
  }
  return c;
}

function rate(n: number, d: number): number {
  return d <= 0 ? 0 : n / d;
}

function pct(n: number): string {
  return `${(100 * n).toFixed(1)}%`;
}

type DeltaRow = { key: string; a: number; b: number; delta: number };

function main(): void {
  const argv = process.argv.slice(2);
  const aPath = path.resolve(argValue(argv, '--a') ?? '');
  const bPath = path.resolve(argValue(argv, '--b') ?? '');
  if (!argValue(argv, '--a') || !argValue(argv, '--b')) {
    console.error('Usage: yarn atlas:diff --a <observe.jsonl> --b <observe.jsonl>');
    process.exit(1);
  }

  const a = load(aPath);
  const b = load(bPath);

  const scalars: DeltaRow[] = [
    {
      key: 'hubCaptureRate',
      a: rate(a.hub, a.games),
      b: rate(b.hub, b.games),
      delta: 0,
    },
    {
      key: 'sectorRate',
      a: rate(a.sector, a.games),
      b: rate(b.sector, b.games),
      delta: 0,
    },
    {
      key: 'lockoutRate',
      a: rate(a.noMoves, a.games),
      b: rate(b.noMoves, b.games),
      delta: 0,
    },
    {
      key: 'truncRate',
      a: rate(a.trunc, a.games),
      b: rate(b.trunc, b.games),
      delta: 0,
    },
    {
      key: 'whiteWinRate',
      a: rate(a.whiteWins, a.games),
      b: rate(b.whiteWins, b.games),
      delta: 0,
    },
    {
      key: 'meanPlies',
      a: rate(a.pliesSum, a.games),
      b: rate(b.pliesSum, b.games),
      delta: 0,
    },
    {
      key: 'empFiresPerGame',
      a: rate(a.empFires, a.games),
      b: rate(b.empFires, b.games),
      delta: 0,
    },
    {
      key: 'infiltratorCapturesPerGame',
      a: rate(a.infiltratorCaptures, a.games),
      b: rate(b.infiltratorCaptures, b.games),
      delta: 0,
    },
  ];
  for (const row of scalars) row.delta = row.b - row.a;

  const moverKeys = new Set([...Object.keys(a.mover), ...Object.keys(b.mover)]);
  const aMoves = Object.values(a.mover).reduce((s, n) => s + n, 0);
  const bMoves = Object.values(b.mover).reduce((s, n) => s + n, 0);
  for (const k of moverKeys) {
    const ra = rate(a.mover[k] ?? 0, aMoves);
    const rb = rate(b.mover[k] ?? 0, bMoves);
    scalars.push({
      key: `moverShare.${k}`,
      a: ra,
      b: rb,
      delta: rb - ra,
    });
  }

  scalars.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  console.log(`atlas:diff — a=${aPath} (games=${a.games})`);
  console.log(`atlas:diff — b=${bPath} (games=${b.games})`);
  console.log('Biggest |Δ| (b − a):');
  for (const row of scalars.slice(0, 12)) {
    const fmt =
      row.key === 'meanPlies' || row.key.startsWith('emp') || row.key.startsWith('infiltrator')
        ? `${row.a.toFixed(2)} → ${row.b.toFixed(2)} (Δ ${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(2)})`
        : `${pct(row.a)} → ${pct(row.b)} (Δ ${row.delta >= 0 ? '+' : ''}${pct(row.delta)})`;
    console.log(`  ${row.key.padEnd(32)} ${fmt}`);
  }
}

main();
