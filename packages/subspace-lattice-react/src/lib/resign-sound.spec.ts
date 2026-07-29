import { describe, expect, it } from 'vitest';
import {
  PlayerColor,
  PieceType,
  SubspaceLatticeEngine,
  resolveRulesConfig,
} from '@subspace-lattice/core';
import {
  collectLatticeSoundsAfterPly,
  playLatticeSoundsAfterPly,
} from './game-sounds';

describe('resign + SFX path', () => {
  it('playLatticeSoundsAfterPly does not throw after resign', () => {
    const rules = resolveRulesConfig('hybrid-fleet');
    const engine = new SubspaceLatticeEngine({ rules });
    // Stale lastMoveInfo as if an infiltrator just moved (resign does not clear it).
    (engine as unknown as { lastMoveInfo: unknown }).lastMoveInfo = {
      moverType: PieceType.Infiltrator,
    };
    const before = structuredClone(engine.getState());
    expect(engine.resign(PlayerColor.White)).toBe(true);
    expect(() => playLatticeSoundsAfterPly(before, engine)).not.toThrow();
    expect(engine.getState().winnerReason).toBe('resign');
    expect(
      collectLatticeSoundsAfterPly(
        before,
        engine.getState(),
        rules,
        engine.getLastMoveInfo(),
      ),
    ).toContain('resignation');
  });
});
