import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from '../game-engine';
import { PlayerColor } from '../interfaces';
import { resolveRulesConfig } from '../rules/rules-config';

const fleetRules = resolveRulesConfig('hybrid', {
  sectorHoldPlies: 1,
  contestedCellsNeutral: true,
  sectorActivationPly: 80,
});

describe('fleet color parity', () => {
  it('starts with mirrored mobility, coverage, and legal moves', () => {
    const engine = new SubspaceLatticeEngine({ rules: fleetRules });

    expect(engine.getSensorNetSet(PlayerColor.White).size).toBe(
      engine.getSensorNetSet(PlayerColor.Black).size,
    );
    expect(engine.sectorControlRatio(PlayerColor.White)).toBe(
      engine.sectorControlRatio(PlayerColor.Black),
    );
    expect(engine.listLegalMoves(PlayerColor.White).length).toBe(
      engine.listLegalMoves(PlayerColor.Black).length,
    );
  });

});
