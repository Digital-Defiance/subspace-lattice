import { describe, expect, it } from 'vitest';
import { PlayerColor } from '@subspace-lattice/core';
import {
  TUTORIAL_LESSONS,
  createTutorialEngine,
} from './tutorial-model';

describe('tutorial curriculum', () => {
  it.each(TUTORIAL_LESSONS)(
    '$number $title uses legal production-engine moves',
    (lesson) => {
      const engine = createTutorialEngine(lesson);

      expect(engine.getState().currentPlayer).toBe(PlayerColor.White);
      expect(
        engine.movePiece(lesson.playerMove.pieceId, lesson.playerMove.to),
      ).toBe(true);

      if (lesson.aiMove) {
        expect(engine.getState().currentPlayer).toBe(PlayerColor.Black);
        expect(engine.movePiece(lesson.aiMove.pieceId, lesson.aiMove.to)).toBe(
          true,
        );
      }
    },
  );

  it('places the lesson-four infiltrator inside the enemy Sensor Net', () => {
    const lesson = TUTORIAL_LESSONS.find(
      (candidate) => candidate.id === 'target-lock',
    )!;
    const engine = createTutorialEngine(lesson);
    const infiltrator = engine.getPiece('w-i1')!;

    expect(engine.isPieceDetected(infiltrator)).toBe(true);
  });

  it('teaches capture by removing the occupied enemy piece', () => {
    const lesson = TUTORIAL_LESSONS.find(
      (candidate) => candidate.id === 'capture',
    )!;
    const engine = createTutorialEngine(lesson);

    expect(engine.getPiece('b-e1')).toBeDefined();
    expect(
      engine.movePiece(lesson.playerMove.pieceId, lesson.playerMove.to),
    ).toBe(true);
    expect(engine.getPiece('b-e1')).toBeUndefined();
    expect(engine.getPiece('w-e1')?.position).toEqual({ x: 4, y: 1 });
  });

  it('teaches broken-link recovery by restoring relay coverage', () => {
    const lesson = TUTORIAL_LESSONS.find(
      (candidate) => candidate.id === 'repair-link',
    )!;
    const engine = createTutorialEngine(lesson);

    expect(engine.getSensorNetSet(PlayerColor.White).has('8,1')).toBe(false);
    expect(
      engine.movePiece(lesson.playerMove.pieceId, lesson.playerMove.to),
    ).toBe(true);
    expect(engine.getSensorNetSet(PlayerColor.White).has('7,1')).toBe(true);
  });

  it('teaches contested space under fleet rules', () => {
    const lesson = TUTORIAL_LESSONS.find(
      (candidate) => candidate.id === 'contested-space',
    )!;
    const engine = createTutorialEngine(lesson);
    expect(engine.getRules().contestedCellsNeutral).toBe(true);

    const white = engine.getSensorNetSet(PlayerColor.White);
    const black = engine.getSensorNetSet(PlayerColor.Black);
    const overlapBefore = [...white].filter((key) => black.has(key));
    expect(overlapBefore.length).toBeGreaterThan(0);

    expect(
      engine.movePiece(lesson.playerMove.pieceId, lesson.playerMove.to),
    ).toBe(true);
    expect(engine.getPiece('w-e2')?.position).toEqual({ x: 5, y: 4 });
  });

  it('arms the sector clock for the fleet clock lesson', () => {
    const lesson = TUTORIAL_LESSONS.find(
      (candidate) => candidate.id === 'sector-clock',
    )!;
    const engine = createTutorialEngine(lesson);
    const state = engine.getState();
    expect(lesson.hudPaused).toBe(false);
    expect(state.plyCount).toBeGreaterThanOrEqual(
      engine.getRules().sectorActivationPly ?? 0,
    );
    expect(
      engine.movePiece(lesson.playerMove.pieceId, lesson.playerMove.to),
    ).toBe(true);
  });
});
