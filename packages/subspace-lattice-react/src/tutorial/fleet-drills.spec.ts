import { describe, expect, it } from 'vitest';
import { PlayerColor } from '@subspace-lattice/core';
import { createTutorialEngine } from './tutorial-model';
import { isEmpTutorialMove } from './tutorial-types';
import {
  DRILL_PHASE_LABEL,
  FLEET_DRILL_PACK,
  FLEET_DRILLS,
} from './fleet-drills';

describe('FLEET_DRILLS pack', () => {
  it('covers the full arc with phase tags', () => {
    expect(FLEET_DRILL_PACK.lessons).toHaveLength(11);
    expect(FLEET_DRILLS.map((d) => d.phase)).toEqual([
      'opening',
      'opening',
      'midgame',
      'midgame',
      'midgame',
      'sector',
      'sector',
      'strike',
      'terminal',
      'terminal',
      'terminal',
    ]);
    expect(DRILL_PHASE_LABEL.sector).toBe('Sector');
  });

  it('every scripted ply is legal and completes its claim', () => {
    for (const lesson of FLEET_DRILLS) {
      const engine = createTutorialEngine(lesson);
      const move = lesson.steps[0]!.playerMove;
      const before = engine.sectorControlRatio(PlayerColor.White);

      if (isEmpTutorialMove(move)) {
        expect(engine.canFireEmp(), lesson.id).toBe(true);
        expect(engine.fireEmp(), lesson.id).toBe(true);
        continue;
      }

      const piece = engine.getPiece(move.pieceId);
      expect(piece, `${lesson.id} missing ${move.pieceId}`).toBeTruthy();
      expect(
        engine.canMovePiece(piece!, move.to),
        `${lesson.id} illegal ${move.pieceId}->(${move.to.x},${move.to.y})`,
      ).toBe(true);
      expect(engine.movePiece(move.pieceId, move.to), lesson.id).toBe(true);

      if (lesson.id === 'drill-expand-net-45') {
        expect(before).toBeLessThan(0.45);
        expect(engine.sectorControlRatio(PlayerColor.White)).toBeGreaterThanOrEqual(
          0.45,
        );
      }
      if (lesson.id === 'drill-integration-hold') {
        expect(before).toBeGreaterThanOrEqual(0.45);
        expect(engine.sectorControlRatio(PlayerColor.White)).toBeGreaterThanOrEqual(
          0.45,
        );
        expect(engine.getState().winner).toBe(PlayerColor.White);
        expect(engine.getState().winnerReason).toBe('sector-integration');
      }
      if (lesson.id === 'drill-hold-the-hub') {
        expect(engine.getPiece('b-e1')).toBeUndefined();
        expect(engine.getPiece('w-ch')?.position).toEqual({ x: 4, y: 4 });
        // Temptation: Hub could have taken the same Escort.
        const baitEngine = createTutorialEngine(lesson);
        expect(
          baitEngine.canMovePiece(baitEngine.getPiece('w-ch')!, { x: 4, y: 5 }),
        ).toBe(true);
      }
      if (lesson.id === 'drill-surgical-strike') {
        expect(engine.getState().winner).toBe(PlayerColor.White);
      }
      if (lesson.id === 'drill-capture-escort') {
        expect(engine.getPiece('b-e1')).toBeUndefined();
      }
      if (lesson.id === 'drill-capture-refractor') {
        expect(engine.getPiece('b-r1')).toBeUndefined();
      }
    }
  });

  it('terminal lockout still ends no-moves', () => {
    const lesson = FLEET_DRILLS.find((d) => d.id === 'drill-terminal-lockout-fire')!;
    const engine = createTutorialEngine(lesson);
    expect(engine.fireEmp()).toBe(true);
    expect(engine.getState().winnerReason).toBe('no-moves');
  });

  it('terminal refuse-miss engulfs Black after the step', () => {
    const lesson = FLEET_DRILLS.find((d) => d.id === 'drill-terminal-refuse-miss')!;
    const engine = createTutorialEngine(lesson);
    const move = lesson.steps[0]!.playerMove;
    expect(isEmpTutorialMove(move)).toBe(false);
    if (isEmpTutorialMove(move)) return;
    const before = engine.getEmpRadius(PlayerColor.White);
    const black = engine.getPiece('b-ch')!;
    const white = engine.getPiece('w-ch')!;
    const distBefore = Math.max(
      Math.abs(white.position.x - black.position.x),
      Math.abs(white.position.y - black.position.y),
    );
    expect(distBefore).toBeGreaterThan(before);
    expect(engine.movePiece(move.pieceId, move.to)).toBe(true);
    const afterHub = engine.getPiece('w-ch')!;
    const distAfter = Math.max(
      Math.abs(afterHub.position.x - black.position.x),
      Math.abs(afterHub.position.y - black.position.y),
    );
    expect(distAfter).toBeLessThanOrEqual(engine.getEmpRadius(PlayerColor.White));
  });
});
