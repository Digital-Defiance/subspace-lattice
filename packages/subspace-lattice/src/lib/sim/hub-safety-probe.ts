import { SubspaceLatticeEngine } from '../game-engine';
import { resolveRulesConfig } from '../rules/rules-config';
import {
  filterMovesAvoidingHubMate,
  moveLeavesHubHanging,
} from '../ai/tactical';
import { MctsAi } from '../ai/mcts-ai';
import { createSeededRng } from '../ai/rng';
import { playMatch } from './match-runner';

const rules = resolveRulesConfig('hybrid', {
  sectorHoldPlies: 1,
  contestedCellsNeutral: true,
  sectorActivationPly: 100,
  firstPlayerRelayCount: 1,
});
const engine = new SubspaceLatticeEngine({ rules });
const legal = engine.listLegalMoves();
const hanging = legal.filter((m) =>
  moveLeavesHubHanging(engine, { pieceId: m.pieceId, to: m.to }),
);
const safe = filterMovesAvoidingHubMate(
  engine,
  legal.map((m) => ({ pieceId: m.pieceId, to: m.to })),
);
console.log(
  JSON.stringify(
    {
      hubSafety: process.env.LATTICE_HUB_SAFETY ?? 'default',
      mateFilter: process.env.LATTICE_HUB_MATE_FILTER ?? 'default',
      inOne: process.env.LATTICE_HUB_IN_ONE ?? 'default',
      openingLegal: legal.length,
      openingHanging: hanging.length,
      openingSafe: safe.length,
    },
    null,
    2,
  ),
);

const samples = [];
for (let i = 0; i < 4; i++) {
  const a = new MctsAi({ simulations: 30, rng: createSeededRng(42 + i * 17) });
  const b = new MctsAi({
    simulations: 30,
    rng: createSeededRng(42 + i * 17 + 1),
  });
  const r = playMatch(a, b, { rules, maxPlies: 240 });
  samples.push({
    plies: r.plies,
    reason: r.winnerReason,
    winner: r.winner,
  });
}
console.log(JSON.stringify({ samples }, null, 2));
