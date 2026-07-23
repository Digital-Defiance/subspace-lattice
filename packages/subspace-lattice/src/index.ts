export * from './lib/subspace-lattice';
export * from './lib/interfaces';
export * from './lib/game-engine';
export * from './lib/room-manager';
export * from './lib/rules/rules-config';
export * from './lib/ai/agent';
export * from './lib/ai/rng';
export * from './lib/ai/heuristic-ai';
export * from './lib/ai/random-legal-agent';
export * from './lib/ai/evaluate';
export * from './lib/ai/tactical';
export * from './lib/ai/mcts-ai';
export * from './lib/ai/advisor';
export * from './lib/ai/advisor-policy';
export * from './lib/sim/match-runner';
export * from './lib/sim/ladder';
export * from './lib/sim/ratings';
export * from './lib/sim/tei-grade';
export * from './lib/sim/local-ai-rating';
export * from './lib/sim/online-pvp-rating';
export * from './lib/sim/rules-figures';
export * from './lib/sim/puzzles';
export * from './lib/sim/parallel';
export * from './lib/sim/game-log-format';
export * from './lib/sim/param-space';
export * from './lib/sim/scorecard';
export * from './lib/sim/evolve';
export * from './lib/debug/match-debug-log';
export * from './lib/firebase/collections';
// Node-only entrypoints (cli / evolve-cli / worker-pool / *-parallel) are
// bundled by scripts/sim.sh & evolve.sh — never re-export them here or Vite
// will pull `node:fs` / `worker_threads` into the browser.
