import { describe, expect, it } from 'vitest';
import { HeuristicAi } from '../ai/heuristic-ai';
import { RandomLegalAgent } from '../ai/random-legal-agent';
import { createSeededRng, createSequenceRng } from '../ai/rng';
import { SubspaceLatticeEngine } from '../game-engine';
import { PlayerColor } from '../interfaces';
import { resolveRulesConfig } from '../rules/rules-config';
import { formatLadderReport, runLadder } from './ladder';
import { playMatch } from './match-runner';
import { CLASSIC_PUZZLES, HYBRID_PUZZLES, evaluatePuzzle } from './puzzles';

describe('sim substrate', () => {
  it('tags new games with classic rulesVersion', () => {
    const engine = new SubspaceLatticeEngine();
    expect(engine.getState().rulesVersion).toBe('classic');
    expect(engine.getRules().version).toBe('classic');
  });

  it('clone does not share mutable state', () => {
    const a = new SubspaceLatticeEngine();
    const b = a.clone();
    const move = a.listLegalMoves()[0]!;
    expect(a.movePiece(move.pieceId, move.to)).toBe(true);
    expect(b.getState().currentPlayer).toBe(PlayerColor.White);
    expect(a.getState().currentPlayer).toBe(PlayerColor.Black);
  });

  it('hybrid rules enable sensor-constrained beams unlike classic', () => {
    const classic = new SubspaceLatticeEngine({ rulesVersion: 'classic' });
    const hybrid = new SubspaceLatticeEngine({ rulesVersion: 'hybrid' });
    const classicBeam = classic.getPiece('w-b1')!;
    const hybridBeam = hybrid.getPiece('w-b1')!;
    // Classic beam can slide up the file; hybrid cannot leave net (hub R=3 covers y≤3 on file 2)
    expect(classic.canMovePiece(classicBeam, { x: 2, y: 5 })).toBe(true);
    expect(hybrid.canMovePiece(hybridBeam, { x: 2, y: 5 })).toBe(false);
    expect(hybrid.getState().rulesVersion).toBe('hybrid');
  });

  it('playMatch finishes or truncates deterministically', () => {
    const rng = createSeededRng(7);
    const result = playMatch(
      new RandomLegalAgent(rng),
      new RandomLegalAgent(rng),
      { maxPlies: 80, rules: resolveRulesConfig('classic') },
    );
    expect(result.plies).toBeGreaterThan(0);
    expect(result.plies).toBeLessThanOrEqual(80);
    expect(result.replay.length).toBe(result.plies);
    if (!result.truncated) {
      expect(result.winner).toBeDefined();
    }
  });

  it('heuristic tends to beat random on a short ladder', () => {
    const ladder = runLadder({
      gamesPerPairing: 8,
      seed: 99,
      maxPlies: 200,
      createAgents: (rng) => [
        new RandomLegalAgent(rng),
        new HeuristicAi(rng),
      ],
      expectedOrder: ['heuristic', 'random-legal'],
    });
    expect(ladder.openskill.heuristic!.ordinal).toBeGreaterThan(
      ladder.openskill['random-legal']!.ordinal,
    );
    expect(ladder.elo.heuristic).toBeGreaterThan(ladder.elo['random-legal']!);
    expect(formatLadderReport(ladder)).toContain('heuristic');
  });

  it('heuristic solves classic tactical puzzles', () => {
    const ai = new HeuristicAi(createSequenceRng([0]));
    for (const puzzle of CLASSIC_PUZZLES) {
      const { passed, chosen } = evaluatePuzzle(puzzle, ai);
      expect(passed, `${puzzle.id} chose ${JSON.stringify(chosen)}`).toBe(
        true,
      );
    }
  });

  it('heuristic solves hybrid sensor-net puzzles', () => {
    const ai = new HeuristicAi(createSequenceRng([0]));
    for (const puzzle of HYBRID_PUZZLES) {
      const { passed, chosen } = evaluatePuzzle(puzzle, ai);
      expect(passed, `${puzzle.id} chose ${JSON.stringify(chosen)}`).toBe(
        true,
      );
    }
  });
});