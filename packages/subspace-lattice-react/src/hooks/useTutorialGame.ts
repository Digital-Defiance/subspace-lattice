import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Coordinate } from '@subspace-lattice/core';
import {
  TUTORIAL_LESSONS,
  createTutorialEngine,
  type TutorialLesson,
} from '../tutorial/tutorial-model';

const PROGRESS_KEY = 'subspace-lattice:tutorial-progress';

export type TutorialPhase = 'playing' | 'ai-turn' | 'success' | 'graduated';

function savedLessonIndex(): number {
  if (typeof window === 'undefined') return 0;
  const value = Number(window.localStorage.getItem(PROGRESS_KEY) ?? 0);
  return Number.isInteger(value)
    ? Math.min(Math.max(value, 0), TUTORIAL_LESSONS.length - 1)
    : 0;
}

function sameCoordinate(left: Coordinate, right: Coordinate): boolean {
  return left.x === right.x && left.y === right.y;
}

/** Deterministic tutorial controller; graded lessons never invoke MCTS. */
export function useTutorialGame() {
  const [lessonIndex, setLessonIndex] = useState(savedLessonIndex);
  const lesson = TUTORIAL_LESSONS[lessonIndex]!;
  const [engine, setEngine] = useState(() => createTutorialEngine(lesson));
  const [phase, setPhase] = useState<TutorialPhase>('playing');
  const [feedback, setFeedback] = useState(lesson.objective);

  const resetLesson = useCallback(
    (nextLesson: TutorialLesson = lesson) => {
      setEngine(createTutorialEngine(nextLesson));
      setPhase('playing');
      setFeedback(nextLesson.objective);
    },
    [lesson],
  );

  const chooseLesson = useCallback((index: number) => {
    const bounded = Math.min(
      Math.max(index, 0),
      TUTORIAL_LESSONS.length - 1,
    );
    const nextLesson = TUTORIAL_LESSONS[bounded]!;
    setLessonIndex(bounded);
    setEngine(createTutorialEngine(nextLesson));
    setPhase('playing');
    setFeedback(nextLesson.objective);
  }, []);

  const completeLesson = useCallback(() => {
    setPhase('success');
    setFeedback(lesson.success);
    if (typeof window !== 'undefined') {
      const nextUnlocked = Math.min(
        lessonIndex + 1,
        TUTORIAL_LESSONS.length - 1,
      );
      window.localStorage.setItem(PROGRESS_KEY, String(nextUnlocked));
    }
  }, [lesson.success, lessonIndex]);

  const submitMove = useCallback(
    (pieceId: string, to: Coordinate) => {
      if (phase !== 'playing') return;
      if (
        pieceId !== lesson.playerMove.pieceId ||
        !sameCoordinate(to, lesson.playerMove.to)
      ) {
        setFeedback(
          'That move is legal, but it does not complete this lesson’s objective.',
        );
        return;
      }

      const next = engine.clone();
      if (!next.movePiece(pieceId, to)) {
        setFeedback(
          'That order is not legal in this position. Try the highlighted destination.',
        );
        return;
      }
      setEngine(next);

      if (lesson.aiMove && !next.getState().winner) {
        setPhase('ai-turn');
        setFeedback('Order confirmed. The opposing fleet is responding…');
      } else {
        completeLesson();
      }
    },
    [completeLesson, engine, lesson, phase],
  );

  useEffect(() => {
    if (phase !== 'ai-turn' || !lesson.aiMove) return;
    const scriptedMove = lesson.aiMove;
    const timer = window.setTimeout(() => {
      const next = engine.clone();
      if (!next.movePiece(scriptedMove.pieceId, scriptedMove.to)) {
        setFeedback(
          'The scripted response became invalid. Restart this lesson.',
        );
        setPhase('playing');
        return;
      }
      setEngine(next);
      completeLesson();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [completeLesson, engine, lesson.aiMove, phase]);

  const continueTutorial = useCallback(() => {
    if (lessonIndex === TUTORIAL_LESSONS.length - 1) {
      setPhase('graduated');
      return;
    }
    chooseLesson(lessonIndex + 1);
  }, [chooseLesson, lessonIndex]);

  const progress = useMemo(
    () =>
      ((lessonIndex + (phase === 'success' ? 1 : 0)) /
        TUTORIAL_LESSONS.length) *
      100,
    [lessonIndex, phase],
  );

  return {
    lessonIndex,
    lesson,
    engine,
    phase,
    feedback,
    progress,
    setFeedback,
    resetLesson,
    chooseLesson,
    submitMove,
    continueTutorial,
  };
}
