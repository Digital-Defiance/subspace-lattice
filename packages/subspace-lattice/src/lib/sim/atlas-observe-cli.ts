/**
 * Lattice Atlas observe — ply-event JSONL from N self-play games.
 * Bundled by scripts/atlas-observe.sh — not imported from browser.
 *
 * Usage:
 *   yarn atlas:observe --games 20 --jobs 1 --seed 7 \
 *     --out docs/atlas/runs/observe-seed7.jsonl
 *
 * Each line is either a game summary (`type:"game"`) or a ply event
 * (`type:"ply"`). Diff corpora with `yarn atlas:diff`.
 */
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { createSeededRng } from '../ai/rng';
import { HeuristicAi } from '../ai/heuristic-ai';
import { MctsAi } from '../ai/mcts-ai';
import { RandomLegalAgent } from '../ai/random-legal-agent';
import type { Agent } from '../ai/agent';
import { PieceType } from '../interfaces/pieceType';
import { PlayerColor } from '../interfaces/playerColor';
import { resolveRulesConfig, type RulesVersion } from '../rules/rules-config';
import { playMatch } from './match-runner';

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

type AgentKind = 'heuristic' | 'random' | 'mcts';

function makeAgent(kind: AgentKind, seed: number, sims: number): Agent {
  const rng = createSeededRng(seed);
  if (kind === 'heuristic') return new HeuristicAi(rng);
  if (kind === 'random') return new RandomLegalAgent(rng);
  return new MctsAi({ simulations: sims, rng });
}

function parseKind(raw: string | undefined, fallback: AgentKind): AgentKind {
  if (raw === 'heuristic' || raw === 'random' || raw === 'mcts') return raw;
  return fallback;
}

const PIECE_LABEL: Record<PieceType, string> = {
  [PieceType.CommandHub]: 'CommandHub',
  [PieceType.Escort]: 'Escort',
  [PieceType.Infiltrator]: 'Infiltrator',
  [PieceType.Beam]: 'Beam',
  [PieceType.Refractor]: 'Refractor',
  [PieceType.Carrier]: 'Carrier',
};

function main(): void {
  const argv = process.argv.slice(2);
  const games = argInt(argv, '--games', 12);
  const seed = argInt(argv, '--seed', 7);
  const sims = argInt(argv, '--sims', 40);
  const maxPlies = argInt(argv, '--max-plies', 400);
  const version = (argValue(argv, '--rules') ?? 'hybrid-fleet') as RulesVersion;
  const whiteKind = parseKind(argValue(argv, '--white'), 'heuristic');
  const blackKind = parseKind(argValue(argv, '--black'), 'random');
  const outPath = path.resolve(
    argValue(argv, '--out') ??
      `docs/atlas/runs/observe-${whiteKind}-${blackKind}-s${seed}.jsonl`,
  );

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, '');

  const rules = resolveRulesConfig(version);
  const runMeta = {
    type: 'run' as const,
    generator: 'atlas-observe',
    at: new Date().toISOString(),
    games,
    seed,
    rulesVersion: rules.version,
    white: whiteKind,
    black: blackKind,
    sims,
    maxPlies,
  };
  appendFileSync(outPath, `${JSON.stringify(runMeta)}\n`);

  let hub = 0;
  let sector = 0;
  let noMoves = 0;
  let trunc = 0;
  let empFires = 0;
  let pliesSum = 0;

  for (let g = 0; g < games; g++) {
    const white = makeAgent(whiteKind, seed + g * 2, sims);
    const black = makeAgent(blackKind, seed + g * 2 + 1, sims);
    const result = playMatch(white, black, { rules, maxPlies });

    for (let i = 0; i < result.replay.length; i++) {
      const ply = result.replay[i]!;
      appendFileSync(
        outPath,
        `${JSON.stringify({
          type: 'ply',
          game: g,
          i,
          player: ply.player === PlayerColor.White ? 'W' : 'B',
          mover: PIECE_LABEL[ply.moverType] ?? String(ply.moverType),
          capture: ply.capturedType
            ? (PIECE_LABEL[ply.capturedType] ?? String(ply.capturedType))
            : null,
          emp: !!ply.empFired,
          spool: !!ply.spoolAnnounce,
          spoolFail: !!ply.spoolFailed,
        })}\n`,
      );
      if (ply.empFired) empFires += 1;
    }

    if (result.truncated) trunc += 1;
    else if (result.winnerReason === 'hub-capture') hub += 1;
    else if (result.winnerReason === 'sector-integration') sector += 1;
    else if (result.winnerReason === 'no-moves') noMoves += 1;
    pliesSum += result.plies;

    appendFileSync(
      outPath,
      `${JSON.stringify({
        type: 'game',
        game: g,
        winner:
          result.winner === PlayerColor.White
            ? 'W'
            : result.winner === PlayerColor.Black
              ? 'B'
              : null,
        reason: result.winnerReason ?? null,
        plies: result.plies,
        truncated: result.truncated,
        empFires: result.replay.filter((p) => p.empFired).length,
        infiltratorCaptures: result.infiltratorCaptures,
        spoolAnnounces: result.spoolAnnounces,
      })}\n`,
    );
  }

  const summary = {
    type: 'summary' as const,
    games,
    hub,
    sector,
    noMoves,
    trunc,
    empFires,
    meanPlies: games === 0 ? 0 : pliesSum / games,
  };
  appendFileSync(outPath, `${JSON.stringify(summary)}\n`);

  console.log(`atlas:observe — wrote ${outPath}`);
  console.log(
    `atlas:observe — games=${games} hub=${hub} sector=${sector} lockout=${noMoves} trunc=${trunc} empFires=${empFires} meanPlies=${summary.meanPlies.toFixed(1)}`,
  );
}

main();
