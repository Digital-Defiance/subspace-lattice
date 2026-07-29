import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from './game-engine';
import { PlayerColor } from './interfaces';
import { resolveFleetLobbyRules } from './rules/rules-config';
import { HeuristicAi } from './ai/heuristic-ai';
import { requirePieceAgentMove } from './ai/agent';

describe('local AI after Fleet Draft Carrier move', () => {
  it('heuristic finds a Black reply after White Carrier (7,0)→(4,3)', () => {
    const engine = new SubspaceLatticeEngine({
      rules: resolveFleetLobbyRules({ heavyWingPreset: 'fleet-draft' }),
    });
    expect(engine.movePiece('w-h2', { x: 4, y: 3 })).toBe(true);
    expect(engine.getState().currentPlayer).toBe(PlayerColor.Black);

    const legal = engine.listLegalMoves(PlayerColor.Black);
    expect(legal.length).toBeGreaterThan(0);

    const ai = new HeuristicAi();
    const choice = requirePieceAgentMove(ai.chooseMove(engine));
    expect(engine.movePiece(choice.pieceId, choice.to)).toBe(true);
  });

  it('fromState refresh preserves fleet draft for AI', () => {
    const engine = new SubspaceLatticeEngine({
      rules: resolveFleetLobbyRules({ heavyWingPreset: 'fleet-draft' }),
    });
    engine.movePiece('w-h2', { x: 4, y: 3 });
    const refreshed = SubspaceLatticeEngine.fromState(engine.getState());
    expect(refreshed.getState().currentPlayer).toBe(PlayerColor.Black);
    expect(refreshed.getRules().heavyUnitDraft).toBe('refractor-carrier');
    const ai = new HeuristicAi();
    expect(ai.chooseMove(refreshed)).toBeTruthy();
  });

  it('heuristic reply stays under 1s with wide infiltrator branching', () => {
    const engine = new SubspaceLatticeEngine({
      rules: resolveFleetLobbyRules({ heavyWingPreset: 'fleet-draft' }),
    });
    engine.movePiece('w-h2', { x: 4, y: 3 });
    expect(engine.listLegalMoves(PlayerColor.Black).length).toBeGreaterThan(64);
    const ai = new HeuristicAi();
    const t0 = Date.now();
    const choice = ai.chooseMove(engine);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(choice).toBeTruthy();
  });
});
