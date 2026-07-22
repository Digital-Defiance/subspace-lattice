/**
 * Calibrate UI AI tiers (Fast / Normal / Strong) under hybrid-fleet.
 *
 * Runs a round-robin OpenSkill ladder with the exact search budgets shipped
 * in the client, then compares measured ordinals/TEI to Warp anchor labels
 * (P0 / I15 / I40). Write JSONL under docs/sim-runs/ for the human gate.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAiForStrength } from '../ai/mcts-ai';
import { resolveRulesConfig } from '../rules/rules-config';
import { formatLadderReport, runLadder } from './ladder';
import {
  getTeiDisplay,
  TEI_AI_ANCHORS,
} from './tei-grade';
import { meanAdjacentOrdinalGap } from './ratings';

function parseArgs(argv: string[]) {
  let games = 10;
  let seed = 20260721;
  let maxPlies = 200;
  let out =
    'docs/sim-runs/evolve-' +
    new Date().toISOString().slice(0, 10).replace(/-/g, '') +
    '-ai-tier-calibration.jsonl';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--games' && argv[i + 1]) games = Number(argv[++i]);
    else if (arg === '--seed' && argv[i + 1]) seed = Number(argv[++i]);
    else if (arg === '--max-plies' && argv[i + 1]) maxPlies = Number(argv[++i]);
    else if (arg === '--out' && argv[i + 1]) out = argv[++i]!;
  }
  return { games, seed, maxPlies, out };
}

const UI_TO_AGENT = {
  fast: 'heuristic',
  normal: 'mcts-50',
  strong: 'mcts-200',
} as const;

export async function runCalibrateAiTiersCli(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  const { games, seed, maxPlies, out } = parseArgs(argv);
  const rules = resolveRulesConfig('hybrid-fleet');
  const expectedOrder = [
    UI_TO_AGENT.strong,
    UI_TO_AGENT.normal,
    UI_TO_AGENT.fast,
  ];

  console.log(
    `AI tier calibration — hybrid-fleet, games/pair=${games}, seed=${seed}, maxPlies=${maxPlies}`,
  );
  console.log(
    `Agents: Fast→${UI_TO_AGENT.fast}, Normal→${UI_TO_AGENT.normal}, Strong→${UI_TO_AGENT.strong}`,
  );
  console.log(`Expected order: ${expectedOrder.join(' > ')}`);
  console.log('');

  const started = Date.now();
  const ladder = runLadder({
    rules,
    gamesPerPairing: games,
    seed,
    maxPlies,
    createAgents: (rng) => [
      createAiForStrength('fast', rng),
      createAiForStrength('normal', rng),
      createAiForStrength('strong', rng),
    ],
    expectedOrder,
    onPairingComplete: ({ white, black, whiteWins, blackWins, draws, index, total }) => {
      const done = Date.now();
      console.log(
        `[${index}/${total}] ${white} vs ${black}: W ${whiteWins} B ${blackWins} D ${draws}  (+${((done - started) / 1000).toFixed(0)}s)`,
      );
    },
  });
  const elapsedSec = (Date.now() - started) / 1000;

  const anchors = {
    fast: getTeiDisplay(TEI_AI_ANCHORS.ensign),
    normal: getTeiDisplay(TEI_AI_ANCHORS.lieutenant),
    strong: getTeiDisplay(TEI_AI_ANCHORS.commander),
  };

  const measured = {
    fast: ladder.openskill[UI_TO_AGENT.fast]!,
    normal: ladder.openskill[UI_TO_AGENT.normal]!,
    strong: ladder.openskill[UI_TO_AGENT.strong]!,
  };

  const sepStrongNormal =
    measured.strong.ordinal - measured.normal.ordinal;
  const sepNormalFast = measured.normal.ordinal - measured.fast.ordinal;
  const meanGap = meanAdjacentOrdinalGap(ladder.openskill, expectedOrder);

  const orderOk = ladder.calibration?.score === 1;
  const gapsHealthy = sepStrongNormal >= 1 && sepNormalFast >= 1;

  console.log(formatLadderReport(ladder));
  console.log('');
  console.log('Anchor labels (rating opponents for humans):');
  console.log(
    `  Fast   → ${anchors.fast.formatted}  (μ ${TEI_AI_ANCHORS.ensign.mu}, σ ${TEI_AI_ANCHORS.ensign.sigma})`,
  );
  console.log(
    `  Normal → ${anchors.normal.formatted}  (μ ${TEI_AI_ANCHORS.lieutenant.mu}, σ ${TEI_AI_ANCHORS.lieutenant.sigma})`,
  );
  console.log(
    `  Strong → ${anchors.strong.formatted}  (μ ${TEI_AI_ANCHORS.commander.mu}, σ ${TEI_AI_ANCHORS.commander.sigma})`,
  );
  console.log('');
  console.log('Measured self-play (OpenSkill among the three agents):');
  for (const [tier, skill] of Object.entries(measured)) {
    console.log(
      `  ${tier.padEnd(6)} ${skill.name.padEnd(12)} TEI ${skill.tei.formatted}  ordinal ${skill.ordinal.toFixed(2)}  μ ${skill.mu.toFixed(2)}  σ ${skill.sigma.toFixed(2)}`,
    );
  }
  console.log('');
  console.log(
    `Adjacent ordinal gaps: Strong−Normal=${sepStrongNormal.toFixed(2)}, Normal−Fast=${sepNormalFast.toFixed(2)}, mean=${meanGap.toFixed(2)}`,
  );
  console.log(
    `Verdict: order ${orderOk ? 'OK' : 'FAIL'} · gaps ${gapsHealthy ? 'OK (≥1 each)' : 'THIN (<1 on an edge)'}`,
  );
  if (!orderOk) {
    console.log(
      '  → Retune search budgets (or eval) before trusting tier labels.',
    );
  } else if (!gapsHealthy) {
    console.log(
      '  → Order holds but tiers are close; consider spreading budgets (e.g. raise Strong) or compressing anchors.',
    );
  } else {
    console.log(
      '  → Order + separation look usable. Anchor μ/σ remain Warp labels unless you want Lattice-fit anchors next.',
    );
  }
  console.log(`Elapsed ${elapsedSec.toFixed(1)}s`);

  const outPath = resolve(process.cwd(), out);
  mkdirSync(dirname(outPath), { recursive: true });

  const record = {
    type: 'ai-tier-calibration',
    ranAt: new Date().toISOString(),
    rulesVersion: 'hybrid-fleet',
    seed,
    gamesPerPairing: games,
    maxPlies,
    elapsedSec,
    expectedOrder,
    uiMapping: UI_TO_AGENT,
    anchors: {
      fast: { ...TEI_AI_ANCHORS.ensign, tei: anchors.fast.formatted },
      normal: {
        ...TEI_AI_ANCHORS.lieutenant,
        tei: anchors.normal.formatted,
      },
      strong: {
        ...TEI_AI_ANCHORS.commander,
        tei: anchors.strong.formatted,
      },
    },
    measured: {
      fast: measured.fast,
      normal: measured.normal,
      strong: measured.strong,
    },
    calibration: ladder.calibration,
    gaps: {
      strongMinusNormal: sepStrongNormal,
      normalMinusFast: sepNormalFast,
      meanAdjacent: meanGap,
    },
    verdict: {
      orderOk,
      gapsHealthy,
    },
    pairs: ladder.pairs,
    ranking: ladder.ranking,
  };

  writeFileSync(outPath, `${JSON.stringify(record)}\n`, 'utf8');
  console.log(`\nWrote ${outPath}`);
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  void runCalibrateAiTiersCli();
}
