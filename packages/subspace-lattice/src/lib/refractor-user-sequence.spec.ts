import { describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from './game-engine';
import { PieceType, PlayerColor } from './interfaces';
import { resolveFleetLobbyRules } from './rules/rules-config';

/**
 * User-reported Fleet Draft sequence (local AI / pass-and-play):
 *   1. Carrier (7,0) → (4,3)
 *   2. Refractor (3,0) → (6,3)
 * Engine must accept both. (UI click-stealing by adjacent glyphs is covered
 * in Board.scss: overflow:hidden + pointer-events:none on pieces.)
 */
describe('Fleet Draft Carrier then Refractor diagonal', () => {
  it('allows Refractor (3,0)→(6,3) after Carrier (7,0)→(4,3)', () => {
    const engine = new SubspaceLatticeEngine({
      rules: resolveFleetLobbyRules({ heavyWingPreset: 'fleet-draft' }),
    });

    expect(engine.getPiece('w-h2')?.type).toBe(PieceType.Carrier);
    expect(engine.getPiece('w-h2')?.position).toEqual({ x: 7, y: 0 });
    expect(engine.getPiece('w-h1')?.type).toBe(PieceType.Refractor);
    expect(engine.getPiece('w-h1')?.position).toEqual({ x: 3, y: 0 });

    expect(engine.movePiece('w-h2', { x: 4, y: 3 })).toBe(true);

    // Local AI would move Black here; force White to probe the follow-up.
    engine.getState().currentPlayer = PlayerColor.White;
    const refractor = engine.getPiece('w-h1')!;
    expect(engine.canMovePiece(refractor, { x: 6, y: 3 })).toBe(true);
    expect(engine.movePiece('w-h1', { x: 6, y: 3 })).toBe(true);
    expect(engine.getPiece('w-h1')?.position).toEqual({ x: 6, y: 3 });
  });

  it('lists (6,3) among opening Refractor legal tips', () => {
    const engine = new SubspaceLatticeEngine({
      rules: resolveFleetLobbyRules({ heavyWingPreset: 'fleet-draft' }),
    });
    const tips = engine
      .listLegalMoves(PlayerColor.White)
      .filter((m) => m.pieceId === 'w-h1')
      .map((m) => `${m.to.x},${m.to.y}`);
    expect(tips).toEqual(expect.arrayContaining(['2,1', '4,1', '5,2', '6,3']));
  });
});
