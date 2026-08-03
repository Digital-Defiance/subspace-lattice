import { describe, expect, it } from 'vitest';
import { PlayerColor } from '@subspace-lattice/core';
import { createTutorialEngine } from './tutorial-model';
import { isEmpTutorialMove } from './tutorial-types';
import { FLEET_PUZZLE_PACK, FLEET_PUZZLES } from './fleet-puzzles';

describe('FLEET_PUZZLES pack', () => {
  it('is a thinking pack distinct from drills', () => {
    expect(FLEET_PUZZLE_PACK.id).toBe('puzzles');
    expect(FLEET_PUZZLES.length).toBeGreaterThanOrEqual(6);
    expect(FLEET_PUZZLES.every((p) => p.presentation === 'puzzle')).toBe(true);
  });

  it('every scripted line is legal and completes its claim', () => {
    for (const lesson of FLEET_PUZZLES) {
      const engine = createTutorialEngine(lesson);

      for (let i = 0; i < lesson.steps.length; i++) {
        const step = lesson.steps[i]!;
        const move = step.playerMove;
        const tag = `${lesson.id} step ${i + 1}`;

        if (isEmpTutorialMove(move)) {
          expect(engine.canFireEmp(), tag).toBe(true);
          expect(engine.fireEmp(), tag).toBe(true);
        } else {
          const piece = engine.getPiece(move.pieceId);
          expect(piece, `${tag} missing ${move.pieceId}`).toBeTruthy();
          expect(
            engine.canMovePiece(piece!, move.to),
            `${tag} illegal ${move.pieceId}->(${move.to.x},${move.to.y})`,
          ).toBe(true);
          expect(engine.movePiece(move.pieceId, move.to), tag).toBe(true);
        }

        for (const alt of step.alternateMoves ?? []) {
          if (isEmpTutorialMove(alt)) continue;
          const altEngine = createTutorialEngine(lesson);
          // Replay prior steps, then check alternate on this step.
          for (let j = 0; j < i; j++) {
            const prior = lesson.steps[j]!;
            const pm = prior.playerMove;
            if (isEmpTutorialMove(pm)) {
              altEngine.fireEmp();
            } else {
              altEngine.movePiece(pm.pieceId, pm.to);
            }
            if (prior.aiMove) {
              if (isEmpTutorialMove(prior.aiMove)) {
                altEngine.fireEmp();
              } else {
                altEngine.movePiece(prior.aiMove.pieceId, prior.aiMove.to);
              }
            }
          }
          const altPiece = altEngine.getPiece(alt.pieceId);
          expect(altPiece, `${tag} alt missing ${alt.pieceId}`).toBeTruthy();
          expect(
            altEngine.canMovePiece(altPiece!, alt.to),
            `${tag} illegal alt ${alt.pieceId}->(${alt.to.x},${alt.to.y})`,
          ).toBe(true);
        }

        if (step.aiMove) {
          const ai = step.aiMove;
          if (isEmpTutorialMove(ai)) {
            expect(engine.canFireEmp(), tag).toBe(true);
            expect(engine.fireEmp(), tag).toBe(true);
          } else {
            const aiPiece = engine.getPiece(ai.pieceId);
            expect(aiPiece, `${tag} AI missing ${ai.pieceId}`).toBeTruthy();
            expect(
              engine.canMovePiece(aiPiece!, ai.to),
              `${tag} illegal AI ${ai.pieceId}->(${ai.to.x},${ai.to.y})`,
            ).toBe(true);
            expect(engine.movePiece(ai.pieceId, ai.to), tag).toBe(true);
          }
        }
      }

      if (lesson.id === 'puzzle-find-strike' || lesson.id === 'puzzle-clear-the-lane' || lesson.id === 'puzzle-net-then-beam') {
        expect(engine.getState().winner, lesson.id).toBe(PlayerColor.White);
      }
      if (lesson.id === 'puzzle-warp-not-hub') {
        expect(engine.getPiece('b-e2'), lesson.id).toBeUndefined();
        expect(engine.getPiece('b-e1'), lesson.id).toBeTruthy();
      }
      if (lesson.id === 'puzzle-into-blast') {
        expect(engine.getState().winnerReason, lesson.id).toBe('no-moves');
      }
    }
  });
});
