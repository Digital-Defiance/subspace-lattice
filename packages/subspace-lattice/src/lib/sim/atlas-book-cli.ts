/**
 * Lattice Atlas playbook miner — openings + phase histograms from observe JSONL.
 *
 * Usage:
 *   yarn atlas:book --in docs/atlas/runs/observe-MvM-s12.jsonl
 *   yarn atlas:book --in … --depth 8 --top 12
 *
 * Needs ply rows with pieceId + to (atlas:observe after 2026-08-01 book wiring).
 * Older JSONL without coords still gets mover-type opening prefixes.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  return argv[i + 1];
}

function argInt(argv: string[], flag: string, fallback: number): number {
  const v = argValue(argv, flag);
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

type Ply = {
  type: 'ply';
  game: number;
  i: number;
  player: string;
  mover: string;
  pieceId?: string;
  to?: { x: number; y: number } | null;
  capture?: string | null;
  emp?: boolean;
};

type Game = {
  type: 'game';
  game: number;
  winner: string | null;
  reason: string | null;
  plies: number;
  truncated: boolean;
};

function plyKey(p: Ply): string {
  if (p.emp) return `${p.player}:EMP`;
  if (p.to && typeof p.to.x === 'number') {
    const id = p.pieceId ?? p.mover;
    return `${p.player}:${id}@${p.to.x},${p.to.y}`;
  }
  return `${p.player}:${p.mover}`;
}

function bump(map: Map<string, number>, key: string, n = 1): void {
  map.set(key, (map.get(key) ?? 0) + n);
}

function topEntries(
  map: Map<string, number>,
  n: number,
): { key: string; count: number; pct: number }[] {
  const total = [...map.values()].reduce((s, c) => s + c, 0) || 1;
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({
      key,
      count,
      pct: (100 * count) / total,
    }));
}

function main(): void {
  const argv = process.argv.slice(2);
  const inPath = path.resolve(argValue(argv, '--in') ?? '');
  if (!argValue(argv, '--in')) {
    console.error(
      'Usage: yarn atlas:book --in <observe.jsonl> [--depth 8] [--top 12] [--out docs/atlas/book-draft.json]',
    );
    process.exit(1);
  }
  const depth = argInt(argv, '--depth', 8);
  const topN = argInt(argv, '--top', 12);
  const openingEnd = argInt(argv, '--opening-end', 12);
  const lateStart = argInt(argv, '--late-start', 120);
  const outPath = path.resolve(
    argValue(argv, '--out') ??
      path.join(
        path.dirname(inPath),
        `${path.basename(inPath, path.extname(inPath))}-book.json`,
      ),
  );

  const pliesByGame = new Map<number, Ply[]>();
  const games: Game[] = [];
  let runMeta: Record<string, unknown> | undefined;

  for (const line of readFileSync(inPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (row.type === 'run') {
      runMeta = row;
      continue;
    }
    if (row.type === 'ply') {
      const p = row as unknown as Ply;
      const list = pliesByGame.get(p.game) ?? [];
      list.push(p);
      pliesByGame.set(p.game, list);
      continue;
    }
    if (row.type === 'game') games.push(row as unknown as Game);
  }

  const prefixCounts = new Map<string, number>();
  const lineCounts = new Map<string, number>();
  const ply0 = new Map<string, number>();
  const openingMovers = new Map<string, number>();
  const midMovers = new Map<string, number>();
  const lateMovers = new Map<string, number>();
  let openingEmp = 0;
  let midEmp = 0;
  let lateEmp = 0;
  let openingPlies = 0;
  let midPlies = 0;
  let latePlies = 0;
  let openingCaptures = 0;
  let midCaptures = 0;
  let lateCaptures = 0;
  let hasCoords = false;

  for (const [, seq] of pliesByGame) {
    seq.sort((a, b) => a.i - b.i);
    const keys: string[] = [];
    for (const p of seq) {
      if (p.to) hasCoords = true;
      const key = plyKey(p);
      if (p.i < depth) {
        keys.push(key);
        const prefix = keys.join(' | ');
        bump(prefixCounts, prefix);
        if (keys.length === depth) bump(lineCounts, prefix);
        if (p.i === 0) bump(ply0, key);
      }
      const band =
        p.i < openingEnd ? 'opening' : p.i < lateStart ? 'mid' : 'late';
      if (band === 'opening') {
        bump(openingMovers, p.mover);
        openingPlies += 1;
        if (p.emp) openingEmp += 1;
        if (p.capture) openingCaptures += 1;
      } else if (band === 'mid') {
        bump(midMovers, p.mover);
        midPlies += 1;
        if (p.emp) midEmp += 1;
        if (p.capture) midCaptures += 1;
      } else {
        bump(lateMovers, p.mover);
        latePlies += 1;
        if (p.emp) lateEmp += 1;
        if (p.capture) lateCaptures += 1;
      }
    }
  }

  const byReason = new Map<string, number>();
  for (const g of games) {
    const label = g.truncated
      ? 'truncated'
      : (g.reason ?? 'unknown');
    bump(byReason, label);
  }

  const draft = {
    generator: 'atlas-book',
    at: new Date().toISOString(),
    source: inPath,
    run: runMeta ?? null,
    games: games.length,
    hasCoords,
    bands: {
      opening: `ply 0..${openingEnd - 1}`,
      middlegame: `ply ${openingEnd}..${lateStart - 1}`,
      endgame: `ply ${lateStart}+`,
    },
    opening: {
      depth,
      ply0: topEntries(ply0, topN),
      lines: topEntries(lineCounts, topN),
      prefixes: topEntries(prefixCounts, topN),
      moverShare: topEntries(openingMovers, 8),
      empRate: openingPlies ? openingEmp / openingPlies : 0,
      captureRate: openingPlies ? openingCaptures / openingPlies : 0,
    },
    middlegame: {
      moverShare: topEntries(midMovers, 8),
      empRate: midPlies ? midEmp / midPlies : 0,
      captureRate: midPlies ? midCaptures / midPlies : 0,
      plies: midPlies,
    },
    endgame: {
      moverShare: topEntries(lateMovers, 8),
      empRate: latePlies ? lateEmp / latePlies : 0,
      captureRate: latePlies ? lateCaptures / latePlies : 0,
      plies: latePlies,
      finishMix: topEntries(byReason, 8),
    },
  };

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(draft, null, 2)}\n`);

  console.log(`atlas:book — wrote ${outPath}`);
  console.log(
    `atlas:book — games=${draft.games} coords=${hasCoords ? 'yes' : 'mover-only'} depth=${depth}`,
  );
  console.log('Opening ply-0:');
  for (const row of draft.opening.ply0.slice(0, 8)) {
    console.log(`  ${row.pct.toFixed(1)}%  n=${row.count}  ${row.key}`);
  }
  console.log(`Top opening lines (depth ${depth}):`);
  for (const row of draft.opening.lines.slice(0, 6)) {
    console.log(`  ${row.pct.toFixed(1)}%  n=${row.count}  ${row.key}`);
  }
  console.log('Middlegame movers:');
  for (const row of draft.middlegame.moverShare.slice(0, 5)) {
    console.log(`  ${row.pct.toFixed(1)}%  ${row.key}`);
  }
  console.log('Endgame / finish mix:');
  for (const row of draft.endgame.finishMix) {
    console.log(`  ${row.pct.toFixed(1)}%  ${row.key}`);
  }
}

main();
