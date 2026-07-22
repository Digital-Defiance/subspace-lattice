import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from '../game-engine';
import { resolveRulesConfig } from '../rules/rules-config';
import { RULES_FIGURES } from './rules-figures';

describe('RULES_FIGURES', () => {
  it('builds a valid engine for every preset', () => {
    expect(RULES_FIGURES.length).toBeGreaterThanOrEqual(9);
    for (const figure of RULES_FIGURES) {
      const state = figure.createState();
      expect(state.boardSize).toBe(11);
      expect(state.rulesVersion ?? figure.rulesVersion).toBeTruthy();
      const engine = SubspaceLatticeEngine.fromState(
        state,
        resolveRulesConfig(figure.rulesVersion),
      );
      expect(Object.keys(engine.getState().pieces).length).toBeGreaterThan(0);
    }
  });

  it('highlights the fleet relay escort', () => {
    const fleet = RULES_FIGURES.find((f) => f.id === 'opening-fleet-relay');
    expect(fleet?.highlightCells).toEqual([{ x: 5, y: 3 }]);
    const state = fleet!.createState();
    expect(state.pieces['w-e4']?.position).toEqual({ x: 5, y: 3 });
  });

  it('shows an unlinked distant escort for broken-escort', () => {
    const broken = RULES_FIGURES.find((f) => f.id === 'broken-escort');
    expect(broken).toBeTruthy();
    const state = broken!.createState();
    expect(state.pieces['w-e3']?.position).toEqual({ x: 8, y: 1 });
    expect(broken!.highlightCells).toEqual([
      { x: 5, y: 1 },
      { x: 8, y: 1 },
    ]);
  });
});
