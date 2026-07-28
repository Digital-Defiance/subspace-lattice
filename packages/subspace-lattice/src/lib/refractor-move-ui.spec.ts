import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from './game-engine';
import { PieceType, PlayerColor } from './interfaces';
import { resolveFleetLobbyRules } from './rules/rules-config';

function assertUniqueOccupancy(engine: SubspaceLatticeEngine) {
  const seen = new Map<string, string>();
  for (const piece of Object.values(engine.getState().pieces)) {
    const key = `${piece.position.x},${piece.position.y}`;
    const prior = seen.get(key);
    expect(
      prior,
      `two pieces share ${key}: ${prior} and ${piece.id}`,
    ).toBeUndefined();
    seen.set(key, piece.id);
    expect(engine.getPieceAt(piece.position)?.id).toBe(piece.id);
  }
}

describe('heavy wing opening occupancy + Refractor moves', () => {
  it('Refractor Wing does not stack heavies on Infiltrator files', () => {
    const engine = new SubspaceLatticeEngine({
      rules: resolveFleetLobbyRules({ heavyWingPreset: 'refractor-wing' }),
    });
    assertUniqueOccupancy(engine);
    expect(engine.getPiece('w-h1')?.type).toBe(PieceType.Refractor);
    expect(engine.getPiece('w-h1')?.position).toEqual({ x: 3, y: 0 });
    expect(engine.getPiece('w-i1')?.position.x).not.toBe(3);
    expect(engine.getPiece('w-i2')?.position.x).not.toBe(7);
  });

  it('Fleet Draft does not stack heavies on Infiltrator files', () => {
    const engine = new SubspaceLatticeEngine({
      rules: resolveFleetLobbyRules({ heavyWingPreset: 'fleet-draft' }),
    });
    assertUniqueOccupancy(engine);
  });

  it('every Refractor hint square is executable via movePiece', () => {
    const live = new SubspaceLatticeEngine({
      rules: resolveFleetLobbyRules({ heavyWingPreset: 'refractor-wing' }),
    });
    const boardView = SubspaceLatticeEngine.fromState(live.getState());
    const piece = boardView.getPiece('w-h1')!;
    expect(piece.type).toBe(PieceType.Refractor);

    const destinations: Array<{ x: number; y: number }> = [];
    for (let x = 0; x < 11; x++) {
      for (let y = 0; y < 11; y++) {
        if (boardView.canMovePiece(piece, { x, y })) {
          destinations.push({ x, y });
        }
      }
    }
    expect(destinations.length).toBeGreaterThan(0);

    for (const to of destinations) {
      const attempt = live.clone();
      expect(
        attempt.movePiece('w-h1', to),
        `hint (${to.x},${to.y}) should move`,
      ).toBe(true);
      expect(attempt.getPiece('w-h1')?.position).toEqual(to);
      expect(attempt.getState().currentPlayer).toBe(PlayerColor.Black);
    }
  });
});
