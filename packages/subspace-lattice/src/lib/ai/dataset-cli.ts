/**
 * Dump Deep Lattice training JSONL (self-play and/or LPGN).
 * Bundled by scripts/dataset-jsonl.sh — not imported from browser.
 *
 * Usage:
 *   yarn dataset:jsonl --games 40 --out docs/sim-runs/dataset.jsonl
 *   yarn dataset:jsonl --games 40 --matchup mirror --out …
 *   yarn dataset:jsonl --games 40 --label-sims 50 --jobs 10 --out …
 *   yarn dataset:jsonl --lpgn path/to/game.lpgn --out …
 *
 * Default matchup is heuristic-vs-random: mirror HvH often deadlocks with no
 * legal captures (fleets disengage). EMP/Terminal finishes hubs-only endgames;
 * midgame 1-ply EMP blackout does not force trades by itself.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createSeededRng } from './rng';
import {
  collectLpgnDataset,
  collectSelfPlayDataset,
  samplesToJsonl,
  type DatasetSample,
} from './dataset';
import {
  makeDatasetAgents,
  parseDatasetMatchup,
} from './dataset-matchup';
import {
  mapDatasetGames,
  nodeDefaultJobs,
} from './dataset-game-pool';
import type { DatasetGameResult } from './dataset-game-worker';
import { resolveRulesConfig } from '../rules/rules-config';

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  return argv[i + 1];
}

function argAll(argv: string[], flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag && argv[i + 1]) {
      out.push(argv[i + 1]!);
      i += 1;
    }
  }
  return out;
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, '--help') || argv.length === 0) {
    console.log(`Usage:
  dataset:jsonl --games N [--matchup heuristic-random|mirror|mcts-random]
               [--sims S] [--label-sims L] [--label-every K] [--seed S]
               [--max-plies P] [--jobs J] --out FILE
  dataset:jsonl --lpgn FILE [--lpgn FILE…] [--label-sims L] --out FILE

Default matchup=heuristic-random (decisive). --label-sims adds MCTS q ∈ [-1,1].
--label-every K labels every Kth ply only (faster dumps).
--jobs J runs self-play games in parallel workers (default: cores−1).`);
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const outPath = argValue(argv, '--out');
  if (!outPath) {
    console.error('dataset:jsonl — --out <file.jsonl> required');
    process.exit(1);
  }

  const games = Number(argValue(argv, '--games') ?? '0');
  const sims = Number(argValue(argv, '--sims') ?? '0');
  const labelSims = Number(argValue(argv, '--label-sims') ?? '0');
  const labelEvery = Number(argValue(argv, '--label-every') ?? '1');
  const seed = Number(argValue(argv, '--seed') ?? '42');
  const maxPlies = Number(argValue(argv, '--max-plies') ?? '400');
  const jobs = Number(argValue(argv, '--jobs') ?? String(nodeDefaultJobs()));
  const matchup = parseDatasetMatchup(argValue(argv, '--matchup'));
  const lpgnFiles = argAll(argv, '--lpgn');
  const rulesVersion = 'hybrid-fleet' as const;
  const rules = resolveRulesConfig(rulesVersion);

  const samples: DatasetSample[] = [];
  let finishedGames = 0;
  let truncGames = 0;
  const reasons: Record<string, number> = {};

  if (games > 0) {
    console.log(
      `dataset:jsonl — ${games} games matchup=${matchup} (sims=${sims}, labelSims=${labelSims}, labelEvery=${labelEvery}, seed=${seed}, maxPlies=${maxPlies}, jobs=${jobs})…`,
    );

    const payloads = Array.from({ length: games }, (_, gameIndex) => ({
      matchup,
      sims,
      seed,
      gameIndex,
      maxPlies,
      labelSims,
      labelEvery,
      rulesVersion,
    }));

    const runInProcess = (
      payload: (typeof payloads)[number],
    ): DatasetGameResult => {
      const { white, black, label } = makeDatasetAgents(
        payload.matchup,
        payload.sims,
        payload.seed,
        payload.gameIndex,
      );
      const { match, samples: batch } = collectSelfPlayDataset(white, black, {
        rules,
        maxPlies: payload.maxPlies,
        searchLabelSims: payload.labelSims > 0 ? payload.labelSims : undefined,
        searchLabelRng: createSeededRng(
          payload.seed + payload.gameIndex * 13 + 999,
        ),
        searchLabelEvery:
          payload.labelEvery > 1 ? payload.labelEvery : undefined,
      });
      return {
        gameIndex: payload.gameIndex,
        label,
        samples: batch,
        plies: match.plies,
        truncated: match.truncated,
        winner: match.winner,
        winnerReason: match.winnerReason,
      };
    };

    const results = await mapDatasetGames(payloads, jobs, runInProcess);
    // Stable order by gameIndex (workers may finish out of order).
    results.sort((a, b) => a.gameIndex - b.gameIndex);

    for (const result of results) {
      samples.push(...result.samples);
      if (result.truncated) truncGames += 1;
      else {
        finishedGames += 1;
        const r = result.winnerReason ?? 'draw';
        reasons[r] = (reasons[r] ?? 0) + 1;
      }
      const withQ = result.samples.filter((s) => s.q != null).length;
      const tag = result.truncated
        ? 'trunc'
        : result.winner === undefined
          ? 'draw'
          : `${result.winner}/${result.winnerReason ?? '?'}`;
      console.log(
        `  game ${result.gameIndex + 1}/${games} [${result.label}]: ${result.samples.length} samples (${tag}, ${result.plies} plies${labelSims > 0 ? `, q=${withQ}` : ''})`,
      );
    }
  }

  for (const file of lpgnFiles) {
    const text = readFileSync(file, 'utf8');
    const { samples: batch } = collectLpgnDataset(text, {
      searchLabelSims: labelSims > 0 ? labelSims : undefined,
      searchLabelRng: createSeededRng(seed + 4242),
    });
    samples.push(...batch);
    console.log(`dataset:jsonl — ${file}: ${batch.length} samples`);
  }

  if (samples.length === 0) {
    console.error('dataset:jsonl — nothing to write (pass --games and/or --lpgn)');
    process.exit(1);
  }

  const labeled = samples.filter((s) => s.z !== 0).length;
  const withQ = samples.filter((s) => s.q != null).length;
  const labeledPct = Math.round((100 * labeled) / samples.length);
  mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  writeFileSync(outPath, samplesToJsonl(samples), 'utf8');
  console.log(
    `dataset:jsonl — wrote ${samples.length} samples (${labeledPct}% z≠0, ${withQ} with q) → ${outPath}`,
  );
  if (games > 0) {
    console.log(
      `dataset:jsonl — finished ${finishedGames}/${games}, truncated ${truncGames}/${games}`,
      Object.keys(reasons).length ? reasons : '',
    );
  }
  if (labeledPct < 20 && games > 0 && withQ === 0) {
    console.warn(
      'dataset:jsonl — WARNING: most samples unlabeled (truncated). ' +
        'Prefer default --matchup heuristic-random, or add --label-sims so q survives truncations.',
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
