import { describe, expect, it } from 'vitest';
import {
  AI_STRENGTH_PRESETS,
  createAiForStrength,
  MctsAi,
} from '../ai/mcts-ai';
import { HeuristicAi } from '../ai/heuristic-ai';
import { RandomLegalAgent } from '../ai/random-legal-agent';
import { createSeededRng } from '../ai/rng';
import { SubspaceLatticeEngine } from '../game-engine';
import { resolveRulesConfig } from '../rules/rules-config';
import { runLadder } from './ladder';
import {
  aiAnchorRatingForStrength,
  rateLocalAiMatch,
} from './local-ai-rating';
import { createRating, toAgentSkill } from './ratings';
import { getTeiDisplay, TEI_AI_ANCHORS } from './tei-grade';

describe('TEI AI anchors (UI tiers)', () => {
  it('maps Fast/Normal/Strong to Lattice-calibrated P0 / I10 / I52', () => {
    expect(getTeiDisplay(TEI_AI_ANCHORS.ensign).formatted).toBe('P0');
    expect(getTeiDisplay(TEI_AI_ANCHORS.lieutenant).formatted).toBe('I10');
    expect(getTeiDisplay(TEI_AI_ANCHORS.commander).formatted).toBe('I52');
  });

  it('AI_STRENGTH_PRESETS search budgets match soft-ship UI', () => {
    expect(AI_STRENGTH_PRESETS).toEqual([
      { id: 'fast', label: 'Fast', simulations: 0 },
      { id: 'normal', label: 'Normal', simulations: 50 },
      { id: 'strong', label: 'Strong', simulations: 200 },
    ]);
    expect(createAiForStrength('fast', () => 0).name).toBe('heuristic');
    expect(createAiForStrength('normal', () => 0).name).toBe('mcts-50');
    expect(createAiForStrength('strong', () => 0).name).toBe('mcts-200');
  });

  it('anchor ratings for strengths match officer tracks', () => {
    expect(aiAnchorRatingForStrength('fast').mu).toBe(TEI_AI_ANCHORS.ensign.mu);
    expect(aiAnchorRatingForStrength('normal').mu).toBe(
      TEI_AI_ANCHORS.lieutenant.mu,
    );
    expect(aiAnchorRatingForStrength('strong').mu).toBe(
      TEI_AI_ANCHORS.commander.mu,
    );
  });
});

describe('rateLocalAiMatch (OpenSkill vs anchors)', () => {
  it('winning vs Strong raises mu and records a win', () => {
    const baseline = createRating();
    const next = rateLocalAiMatch(undefined, 'strong', true);
    expect(next.wins).toBe(1);
    expect(next.matches).toBe(1);
    expect(next.mu).toBeGreaterThan(baseline.mu);
    expect(next.displayGrade).toMatch(/^[EVCIP]\d{1,2}$/);
  });

  it('losing vs Fast lowers mu', () => {
    const prior = { mu: 25, sigma: 8, matches: 5, wins: 3 };
    const next = rateLocalAiMatch(prior, 'fast', false);
    expect(next.wins).toBe(3);
    expect(next.matches).toBe(6);
    expect(next.mu).toBeLessThan(prior.mu);
  });

  it('beating Strong yields higher ordinal than beating Fast from same prior', () => {
    const vsStrong = rateLocalAiMatch(undefined, 'strong', true);
    const vsFast = rateLocalAiMatch(undefined, 'fast', true);
    const ordStrong = toAgentSkill('s', {
      mu: vsStrong.mu,
      sigma: vsStrong.sigma,
    }).ordinal;
    const ordFast = toAgentSkill('f', {
      mu: vsFast.mu,
      sigma: vsFast.sigma,
    }).ordinal;
    expect(ordStrong).toBeGreaterThan(ordFast);
  });
});

describe('hybrid-fleet AI strength ordering (OpenSkill ladder)', () => {
  it('ranks heuristic above random-legal on hybrid-fleet', () => {
    const ladder = runLadder({
      rules: resolveRulesConfig('hybrid-fleet'),
      gamesPerPairing: 4,
      seed: 11,
      maxPlies: 120,
      createAgents: (rng) => [
        new RandomLegalAgent(rng),
        new HeuristicAi(rng),
      ],
      expectedOrder: ['heuristic', 'random-legal'],
    });
    expect(ladder.calibration?.score).toBe(1);
    expect(ladder.ranking[0]!.name).toBe('heuristic');
  });

  it(
    'ranks light MCTS above heuristic on hybrid-fleet (Normal≻Fast proxy)',
    () => {
      // Proxy for UI Normal(mcts-50) ≻ Fast(heuristic). Full Strong(200) budgets
      // are covered by AI_STRENGTH_PRESETS + createAiForStrength smoke.
      const ladder = runLadder({
        rules: resolveRulesConfig('hybrid-fleet'),
        gamesPerPairing: 4,
        seed: 20260721,
        maxPlies: 100,
        createAgents: (rng) => [
          new MctsAi({
            simulations: 10,
            maxRolloutPlies: 16,
            rng,
          }),
          new HeuristicAi(rng),
        ],
        expectedOrder: ['mcts-10', 'heuristic'],
      });
      expect(ladder.calibration?.score).toBe(1);
      expect(ladder.openskill['mcts-10']!.ordinal).toBeGreaterThan(
        ladder.openskill.heuristic!.ordinal,
      );
    },
    60_000,
  );
});

describe('createAiForStrength under fleet opening', () => {
  it('returns a legal move for each UI tier on hybrid-fleet', () => {
    for (const id of ['fast', 'normal', 'strong'] as const) {
      const sims =
        AI_STRENGTH_PRESETS.find((p) => p.id === id)?.simulations ?? 0;
      const ai =
        sims > 40
          ? new MctsAi({
              simulations: 12,
              maxRolloutPlies: 16,
              rng: createSeededRng(id.length + 7),
            })
          : createAiForStrength(id, createSeededRng(id.length + 7));
      const engine = new SubspaceLatticeEngine({
        rulesVersion: 'hybrid-fleet',
      });
      const choice = ai.chooseMove(engine);
      expect(choice).not.toBeNull();
      const legal = engine.listLegalMoves();
      expect(
        legal.some(
          (m) =>
            m.pieceId === choice!.pieceId &&
            m.to.x === choice!.to.x &&
            m.to.y === choice!.to.y,
        ),
      ).toBe(true);
    }
  });
});
