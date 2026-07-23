import { describe, expect, it } from 'vitest';
import { PieceType, PlayerColor } from '@subspace-lattice/core';
import {
  TUTORIAL_LESSONS,
  createTutorialEngine,
} from './tutorial-model';

describe('tutorial curriculum', () => {
  it.each(TUTORIAL_LESSONS)(
    '$number $title uses legal production-engine moves through every step',
    (lesson) => {
      const engine = createTutorialEngine(lesson);
      const firstSeat = lesson.steps[0]?.seat ?? PlayerColor.White;
      expect(engine.getState().currentPlayer).toBe(firstSeat);

      for (const [index, step] of lesson.steps.entries()) {
        const seat = step.seat ?? PlayerColor.White;
        expect(
          engine.getState().currentPlayer,
          `step ${index + 1} seat`,
        ).toBe(seat);
        expect(
          engine.movePiece(step.playerMove.pieceId, step.playerMove.to),
          `step ${index + 1} player move`,
        ).toBe(true);

        if (step.aiMove && !engine.getState().winner) {
          expect(
            engine.movePiece(step.aiMove.pieceId, step.aiMove.to),
            `step ${index + 1} ai move`,
          ).toBe(true);
        }
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
    const step = lesson.steps[0]!;

    expect(engine.getPiece('b-e1')).toBeDefined();
    expect(
      engine.movePiece(step.playerMove.pieceId, step.playerMove.to),
    ).toBe(true);
    expect(engine.getPiece('b-e1')).toBeUndefined();
    expect(engine.getPiece('w-e1')?.position).toEqual({ x: 4, y: 1 });
  });

  it('teaches sensor-net growth by advancing a forward linked Escort', () => {
    const lesson = TUTORIAL_LESSONS.find(
      (candidate) => candidate.id === 'sensor-net',
    )!;
    const engine = createTutorialEngine(lesson);
    const step = lesson.steps[0]!;
    const before = engine.getSensorNetSet(PlayerColor.White);

    // Hub r=3 reaches y=3; the forward Escort at (5,3) already paints (5,4).
    expect(before.has('5,4')).toBe(true);
    expect(before.has('5,5')).toBe(false);

    expect(
      engine.movePiece(step.playerMove.pieceId, step.playerMove.to),
    ).toBe(true);

    const after = engine.getSensorNetSet(PlayerColor.White);
    expect(after.has('5,5')).toBe(true);
    expect(after.size).toBeGreaterThan(before.size);
  });

  it('teaches broken-link recovery by restoring relay coverage', () => {
    const lesson = TUTORIAL_LESSONS.find(
      (candidate) => candidate.id === 'repair-link',
    )!;
    const engine = createTutorialEngine(lesson);
    const step = lesson.steps[0]!;

    expect(engine.getSensorNetSet(PlayerColor.White).has('8,1')).toBe(false);
    expect(
      engine.movePiece(step.playerMove.pieceId, step.playerMove.to),
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

    const step = lesson.steps[0]!;
    expect(
      engine.movePiece(step.playerMove.pieceId, step.playerMove.to),
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
    const step = lesson.steps[0]!;
    expect(
      engine.movePiece(step.playerMove.pieceId, step.playerMove.to),
    ).toBe(true);
  });

  it('liberates the Beam only after the net expands', () => {
    const lesson = TUTORIAL_LESSONS.find(
      (candidate) => candidate.id === 'free-the-beam',
    )!;
    const engine = createTutorialEngine(lesson);
    const before = engine
      .listLegalMoves()
      .some((m) => m.pieceId === 'w-b1' && m.to.x === 2 && m.to.y === 4);
    expect(before).toBe(false);

    const expand = lesson.steps[0]!;
    expect(
      engine.movePiece(expand.playerMove.pieceId, expand.playerMove.to),
    ).toBe(true);
    expect(engine.movePiece(expand.aiMove!.pieceId, expand.aiMove!.to)).toBe(
      true,
    );

    const after = engine
      .listLegalMoves()
      .some((m) => m.pieceId === 'w-b1' && m.to.x === 2 && m.to.y === 4);
    expect(after).toBe(true);

    const fire = lesson.steps[1]!;
    expect(engine.movePiece(fire.playerMove.pieceId, fire.playerMove.to)).toBe(
      true,
    );
    expect(engine.getPiece('b-prey')).toBeUndefined();
  });

  it('finishes the command exercise with Surgical Strike', () => {
    const lesson = TUTORIAL_LESSONS.find(
      (candidate) => candidate.id === 'command-exercise',
    )!;
    const engine = createTutorialEngine(lesson);
    for (const step of lesson.steps) {
      expect(
        engine.movePiece(step.playerMove.pieceId, step.playerMove.to),
      ).toBe(true);
      if (step.aiMove && !engine.getState().winner) {
        expect(engine.movePiece(step.aiMove.pieceId, step.aiMove.to)).toBe(
          true,
        );
      }
    }
    expect(engine.getState().winner).toBe(PlayerColor.White);
    expect(engine.getState().winnerReason).toBe('hub-capture');
    expect(
      Object.values(engine.getState().pieces).some(
        (p) =>
          p.owner === PlayerColor.Black && p.type === PieceType.CommandHub,
      ),
    ).toBe(false);
  });

  it('lets Black deliver Surgical Strike in the black-at-helm seat', () => {
    const lesson = TUTORIAL_LESSONS.find(
      (candidate) => candidate.id === 'black-at-helm',
    )!;
    const engine = createTutorialEngine(lesson);
    expect(engine.getState().currentPlayer).toBe(PlayerColor.Black);
    const step = lesson.steps[0]!;
    expect(step.seat).toBe(PlayerColor.Black);
    expect(
      engine.movePiece(step.playerMove.pieceId, step.playerMove.to),
    ).toBe(true);
    expect(engine.getState().winner).toBe(PlayerColor.Black);
  });

  it('walks a pre-calculated typical game to Surgical Strike', () => {
    const lesson = TUTORIAL_LESSONS.find(
      (candidate) => candidate.id === 'mission-short-strike',
    )!;
    expect(lesson.presentation).toBe('walkthrough');
    const engine = createTutorialEngine(lesson);
    for (const step of lesson.steps) {
      const seat = step.seat ?? PlayerColor.White;
      expect(engine.getState().currentPlayer).toBe(seat);
      expect(
        engine.movePiece(step.playerMove.pieceId, step.playerMove.to),
      ).toBe(true);
    }
    expect(engine.getState().winner).toBe(PlayerColor.White);
    expect(engine.getState().winnerReason).toBe('hub-capture');
  });

  it('replays the standard chess-length mission to Surgical Strike', () => {
    const lesson = TUTORIAL_LESSONS.find(
      (candidate) => candidate.id === 'mission-standard-battle',
    )!;
    expect(lesson.steps.length).toBeGreaterThanOrEqual(40);
    expect(lesson.steps.length).toBeLessThanOrEqual(60);
    const engine = createTutorialEngine(lesson);
    for (const step of lesson.steps) {
      expect(
        engine.movePiece(step.playerMove.pieceId, step.playerMove.to),
      ).toBe(true);
    }
    expect(engine.getState().winner).toBe(PlayerColor.White);
    expect(engine.getState().winnerReason).toBe('hub-capture');
  });

  it('replays the clock mission to Sector Integration', () => {
    const lesson = TUTORIAL_LESSONS.find(
      (candidate) => candidate.id === 'mission-clock-finish',
    )!;
    expect(lesson.presentation).toBe('walkthrough');
    expect(lesson.hudPaused).toBe(false);
    const engine = createTutorialEngine(lesson);
    expect(engine.getState().plyCount ?? 0).toBeGreaterThanOrEqual(90);
    for (const step of lesson.steps) {
      expect(
        engine.movePiece(step.playerMove.pieceId, step.playerMove.to),
      ).toBe(true);
    }
    expect(engine.getState().winner).toBe(PlayerColor.White);
    expect(engine.getState().winnerReason).toBe('sector-integration');
  });
});
