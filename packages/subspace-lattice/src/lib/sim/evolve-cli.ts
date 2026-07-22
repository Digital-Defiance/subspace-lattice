import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  isRulesVersion,
  type RulesConfig,
  type RulesVersion,
} from '../rules/rules-config';
import {
  evolutionToJsonl,
  formatEvolutionReport,
} from './evolve';
import { runEvolutionAsync } from './evolve-async';
import { defaultConcurrency } from './parallel';
import { resolveFixedRulesConfigs } from './param-space';
import {
  isEvolutionTrack,
  type EvolutionTrack,
  type FairnessAgentKind,
} from './scorecard';

function parseArgs(argv: string[]): {
  seed: number;
  candidates: number;
  rulesVersion?: RulesVersion;
  fixedRules?: RulesConfig[];
  fairnessGames: number;
  skillGames: number;
  aiTrials: number;
  jobs: number;
  fairnessMctsSims: number;
  fairnessAgent: FairnessAgentKind;
  skillMctsSims: number;
  maxPlies: number;
  track: EvolutionTrack;
  counterfactual: boolean;
  out?: string;
} {
  let seed = 42;
  let candidates = 5;
  let rulesVersion: RulesVersion | undefined;
  const fixedSpecs: string[] = [];
  let fairnessGames = 4;
  let skillGames = 4;
  let aiTrials = 3;
  let jobs = defaultConcurrency();
  let fairnessMctsSims = 20;
  let fairnessAgent: FairnessAgentKind = 'auto';
  let skillMctsSims = 0;
  let maxPlies = 120;
  let track: EvolutionTrack = 'A';
  let counterfactual = false;
  let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--seed' && argv[i + 1]) seed = Number(argv[++i]);
    else if (arg === '--candidates' && argv[i + 1])
      candidates = Number(argv[++i]);
    else if (arg === '--rules' && argv[i + 1]) {
      const value = argv[++i];
      if (!isRulesVersion(value)) {
        throw new Error(`Unknown rules version: ${value}`);
      }
      rulesVersion = value;
    } else if (arg === '--fixed' && argv[i + 1]) {
      // Repeatable; also allow semicolon-separated lists in one value.
      const value = argv[++i]!;
      for (const part of value.split(';')) {
        const spec = part.trim();
        if (spec) fixedSpecs.push(spec);
      }
    } else if (arg === '--track' && argv[i + 1]) {
      const value = argv[++i];
      if (!isEvolutionTrack(value)) {
        throw new Error(`Unknown track: ${value} (expected A or B)`);
      }
      track = value;
    } else if (arg === '--fairness-games' && argv[i + 1])
      fairnessGames = Number(argv[++i]);
    else if (arg === '--skill-games' && argv[i + 1])
      skillGames = Number(argv[++i]);
    else if (arg === '--ai-trials' && argv[i + 1])
      aiTrials = Number(argv[++i]);
    else if (arg === '--jobs' && argv[i + 1]) jobs = Number(argv[++i]);
    else if (arg === '--fairness-mcts' && argv[i + 1])
      fairnessMctsSims = Number(argv[++i]);
    else if (arg === '--fairness-agent' && argv[i + 1]) {
      const value = argv[++i];
      if (
        value !== 'auto' &&
        value !== 'heuristic' &&
        value !== 'mcts' &&
        value !== 'random'
      ) {
        throw new Error(
          `Unknown fairness agent: ${value} (expected auto, heuristic, mcts, or random)`,
        );
      }
      fairnessAgent = value;
    }
    else if (arg === '--skill-mcts' && argv[i + 1])
      skillMctsSims = Number(argv[++i]);
    else if (arg === '--max-plies' && argv[i + 1])
      maxPlies = Number(argv[++i]);
    else if (arg === '--counterfactual') counterfactual = true;
    else if (arg === '--out' && argv[i + 1]) out = argv[++i];
  }
  if (!Number.isFinite(maxPlies) || maxPlies < 1) {
    throw new Error(`Invalid --max-plies: ${maxPlies}`);
  }
  const fixedRules =
    fixedSpecs.length > 0 ? resolveFixedRulesConfigs(fixedSpecs) : undefined;
  return {
    seed,
    candidates,
    rulesVersion,
    fixedRules,
    fairnessGames,
    skillGames,
    aiTrials,
    jobs,
    fairnessMctsSims,
    fairnessAgent,
    skillMctsSims,
    maxPlies,
    track,
    counterfactual,
    out,
  };
}

export async function runEvolveCli(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  const opts = parseArgs(argv);
  const mode = opts.fixedRules?.length
    ? `fixed=${opts.fixedRules.length}`
    : opts.rulesVersion
      ? `fixedRules=${opts.rulesVersion}`
      : `candidates=${opts.candidates}`;
  console.log(
    `evolve — track=${opts.track} ${mode} seed=${opts.seed} jobs=${opts.jobs} fairnessAgent=${opts.fairnessAgent} fairnessMcts=${opts.fairnessMctsSims} maxPlies=${opts.maxPlies} (human gate; will not change defaults)`,
  );
  const started = Date.now();
  const result = await runEvolutionAsync({
    seed: opts.seed,
    candidates: opts.candidates,
    rulesVersion: opts.rulesVersion,
    fixedRules: opts.fixedRules,
    fairnessGames: opts.fairnessGames,
    skillGames: opts.skillGames,
    aiTrials: opts.aiTrials,
    aiGames: 3,
    maxPlies: opts.maxPlies,
    jobs: opts.jobs,
    fairnessMctsSims: opts.fairnessMctsSims,
    fairnessAgent: opts.fairnessAgent,
    skillMctsSims: opts.skillMctsSims,
    track: opts.track,
    counterfactualClock: opts.counterfactual,
  });
  console.log(formatEvolutionReport(result));
  console.log(`\nElapsed ${(Date.now() - started) / 1000}s with jobs=${opts.jobs}`);

  if (opts.out) {
    const path = resolve(opts.out);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, evolutionToJsonl(result), 'utf8');
    console.log(`Wrote JSONL → ${path}`);
  }
}

const isMain =
  typeof process !== 'undefined' &&
  Boolean(process.argv[1]) &&
  /evolve-cli\.(mjs|js)|sim\/evolve-cli\.(ts|js)/.test(process.argv[1]!);

if (isMain) {
  void runEvolveCli();
}
