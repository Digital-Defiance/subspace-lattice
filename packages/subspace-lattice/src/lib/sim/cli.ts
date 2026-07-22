import { HeuristicAi } from '../ai/heuristic-ai';
import { MctsAi } from '../ai/mcts-ai';
import { RandomLegalAgent } from '../ai/random-legal-agent';
import { createSeededRng } from '../ai/rng';
import { isRulesVersion, resolveRulesConfig, RulesVersion } from '../rules/rules-config';
import { defaultConcurrency } from './parallel';
import {
  formatLadderReport,
  formatMultiSeedLadderReport,
  runLadder,
} from './ladder';
import { runMultiSeedLadder } from './ladder-parallel';
import { CLASSIC_PUZZLES, HYBRID_PUZZLES, evaluatePuzzle } from './puzzles';

function parseArgs(argv: string[]): {
  games: number;
  seed: number;
  maxPlies: number;
  puzzles: boolean;
  rules: RulesVersion;
  mctsSims: number;
  seeds: number[];
  jobs: number;
} {
  let games = 10;
  let seed = 42;
  let maxPlies = 400;
  let puzzles = true;
  let rules: RulesVersion = 'hybrid';
  let mctsSims = 40;
  let seeds: number[] = [];
  let jobs = defaultConcurrency();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--games' && argv[i + 1]) {
      games = Number(argv[++i]);
    } else if (arg === '--seed' && argv[i + 1]) {
      seed = Number(argv[++i]);
    } else if (arg === '--max-plies' && argv[i + 1]) {
      maxPlies = Number(argv[++i]);
    } else if (arg === '--no-puzzles') {
      puzzles = false;
    } else if (arg === '--rules' && argv[i + 1]) {
      const v = argv[++i];
      rules = isRulesVersion(v) ? v : 'hybrid';
    } else if (arg === '--mcts' && argv[i + 1]) {
      mctsSims = Number(argv[++i]);
    } else if (arg === '--seeds' && argv[i + 1]) {
      // Comma list or count: --seeds 8 → seed..seed+7 ; --seeds 1,2,9
      const raw = argv[++i]!;
      if (raw.includes(',')) {
        seeds = raw.split(',').map(Number);
      } else {
        const n = Number(raw);
        seeds = Array.from({ length: n }, (_, k) => seed + k);
      }
    } else if (arg === '--jobs' && argv[i + 1]) {
      jobs = Number(argv[++i]);
    }
  }
  return { games, seed, maxPlies, puzzles, rules, mctsSims, seeds, jobs };
}

export async function runSimCli(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  const { games, seed, maxPlies, puzzles, rules, mctsSims, seeds, jobs } =
    parseArgs(argv);
  const rulesConfig = resolveRulesConfig(rules);

  if (puzzles) {
    console.log('Puzzles (heuristic + mcts tactical):');
    const heuristic = new HeuristicAi(createSeededRng(seed));
    const mcts = new MctsAi({
      simulations: Math.max(10, mctsSims),
      rng: createSeededRng(seed + 1),
    });
    for (const puzzle of [...CLASSIC_PUZZLES, ...HYBRID_PUZZLES]) {
      const h = evaluatePuzzle(puzzle, heuristic);
      const m = evaluatePuzzle(puzzle, mcts);
      console.log(
        `  ${puzzle.id}: heuristic=${h.passed ? 'PASS' : 'FAIL'} mcts=${m.passed ? 'PASS' : 'FAIL'}`,
      );
    }
    console.log('');
  }

  const expectedOrder = [`mcts-${mctsSims}`, 'heuristic', 'random-legal'];

  if (seeds.length > 1) {
    console.log(
      `Multi-seed ladder — ${seeds.length} seeds, jobs=${jobs}, games/pair=${games}`,
    );
    const started = Date.now();
    const multi = await runMultiSeedLadder({
      seeds,
      rulesVersion: rules,
      gamesPerPairing: games,
      maxPlies,
      mctsSims,
      jobs,
      expectedOrder,
    });
    console.log(formatMultiSeedLadderReport(multi));
    console.log(`\nElapsed ${(Date.now() - started) / 1000}s`);
    console.log('\n— Last seed detail —');
    console.log(formatLadderReport(multi.results[multi.results.length - 1]!));
    return;
  }

  const ladder = runLadder({
    rules: rulesConfig,
    gamesPerPairing: games,
    seed,
    maxPlies,
    createAgents: (rng) => [
      new RandomLegalAgent(rng),
      new HeuristicAi(rng),
      new MctsAi({ simulations: mctsSims, rng }),
    ],
    expectedOrder,
  });
  console.log(formatLadderReport(ladder));
}

const isMain =
  typeof process !== 'undefined' &&
  Boolean(process.argv[1]) &&
  /sim-cli\.(mjs|js)|sim\/cli\.(ts|js)/.test(process.argv[1]!);

if (isMain) {
  void runSimCli();
}
