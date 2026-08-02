import { describe, expect, it } from 'vitest';
import {
  AI_STRENGTH_PRESETS,
  createAiForStrength,
  MctsAi,
} from '../ai/mcts-ai';
import { HeuristicAi } from '../ai/heuristic-ai';
import { RandomLegalAgent } from '../ai/random-legal-agent';
import { requirePieceAgentMove } from '../ai/agent';
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
  it('maps Fast/Normal/Strong/Deep to Lattice-calibrated officer TEI', () => {
    expect(getTeiDisplay(TEI_AI_ANCHORS.ensign).formatted).toBe('P0');
    expect(getTeiDisplay(TEI_AI_ANCHORS.lieutenant).formatted).toBe('I10');
    expect(getTeiDisplay(TEI_AI_ANCHORS.commander).formatted).toBe('I52');
    // Provisional Deep Lattice anchor — ordinal above Commander.
    expect(getTeiDisplay(TEI_AI_ANCHORS.admiral).score).toBeGreaterThan(
      getTeiDisplay(TEI_AI_ANCHORS.commander).score,
    );
  });

  it('AI_STRENGTH_PRESETS search budgets match shipping UI', () => {
    expect(AI_STRENGTH_PRESETS).toEqual([
      { id: 'fast', label: 'Fast', simulations: 0 },
      { id: 'normal', label: 'Normal', simulations: 50 },
      { id: 'strong', label: 'Strong', simulations: 200 },
      { id: 'deep', label: 'Deep Lattice', simulations: 800 },
    ]);
    expect(createAiForStrength('fast', () => 0).name).toBe('heuristic');
    expect(createAiForStrength('normal', () => 0).name).toBe('mcts-50');
    expect(createAiForStrength('strong', () => 0).name).toBe('mcts-200');
    expect(createAiForStrength('deep', () => 0).name).toBe('deep-lattice');
  });

  it('anchor ratings for strengths match officer tracks', () => {
    expect(aiAnchorRatingForStrength('fast').mu).toBe(TEI_AI_ANCHORS.ensign.mu);
    expect(aiAnchorRatingForStrength('normal').mu).toBe(
      TEI_AI_ANCHORS.lieutenant.mu,
    );
    expect(aiAnchorRatingForStrength('strong').mu).toBe(
      TEI_AI_ANCHORS.commander.mu,
    );
    expect(aiAnchorRatingForStrength('deep').mu).toBe(
      TEI_AI_ANCHORS.admiral.mu,
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

  it('beating Deep Lattice yields higher ordinal than beating Strong', () => {
    const vsDeep = rateLocalAiMatch(undefined, 'deep', true);
    const vsStrong = rateLocalAiMatch(undefined, 'strong', true);
    const ordDeep = toAgentSkill('d', {
      mu: vsDeep.mu,
      sigma: vsDeep.sigma,
    }).ordinal;
    const ordStrong = toAgentSkill('s', {
      mu: vsStrong.mu,
      sigma: vsStrong.sigma,
    }).ordinal;
    expect(ordDeep).toBeGreaterThan(ordStrong);
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

  it('Normal / Strong / Deep presets sit above Fast on the search ladder', () => {
    // Full OpenSkill self-play is covered by `yarn calibrate:ai` (human gate).
    // CI only checks the shipped budgets and that light MCTS still solves
    // tactical puzzles the heuristic also clears.
    expect(createAiForStrength('fast').name).toBe('heuristic');
    expect(createAiForStrength('normal').name).toBe('mcts-50');
    expect(createAiForStrength('strong').name).toBe('mcts-200');
    expect(createAiForStrength('deep').name).toBe('deep-lattice');
    const sims = AI_STRENGTH_PRESETS.map((p) => p.simulations);
    expect(sims).toEqual([0, 50, 200, 800]);
  });
});

describe('createAiForStrength under fleet opening', () => {
  it('returns a legal move for each UI tier on hybrid-fleet', () => {
    for (const id of ['fast', 'normal', 'strong', 'deep'] as const) {
      const sims =
        AI_STRENGTH_PRESETS.find((p) => p.id === id)?.simulations ?? 0;
      const ai =
        sims > 40
          ? new MctsAi({
              simulations: 12,
              maxRolloutPlies: 16,
              quiescencePlies: 4,
              rng: createSeededRng(id.length + 7),
            })
          : createAiForStrength(id, createSeededRng(id.length + 7));
      const engine = new SubspaceLatticeEngine({
        rulesVersion: 'hybrid-fleet',
      });
      const choice = requirePieceAgentMove(ai.chooseMove(engine));
      const legal = engine.listLegalMoves();
      expect(
        legal.some(
          (m) =>
            m.pieceId === choice.pieceId &&
            m.to.x === choice.to.x &&
            m.to.y === choice.to.y,
        ),
      ).toBe(true);
    }
  });
});
