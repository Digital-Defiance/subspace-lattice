import { useCallback, useEffect, useMemo, useState } from 'react';
import { PlayerColor, type Coordinate } from '@subspace-lattice/core';
import {
  TUTORIAL_LESSONS,
  createTutorialEngine,
  isWalkthroughLesson,
  type TutorialLesson,
  type TutorialStep,
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

function stepSeat(step: TutorialStep): PlayerColor {
  return step.seat ?? PlayerColor.White;
}

/** Deterministic tutorial controller; graded lessons never invoke MCTS. */
export function useTutorialGame() {
  const [lessonIndex, setLessonIndex] = useState(savedLessonIndex);
  const lesson = TUTORIAL_LESSONS[lessonIndex]!;
  const [stepIndex, setStepIndex] = useState(0);
  const [engine, setEngine] = useState(() => createTutorialEngine(lesson));
  const [phase, setPhase] = useState<TutorialPhase>('playing');
  const [feedback, setFeedback] = useState(lesson.steps[0]!.objective);

  const step = lesson.steps[stepIndex]!;
  const seat = stepSeat(step);
  const totalSteps = lesson.steps.length;
  const walkthrough = isWalkthroughLesson(lesson);

  const beginLesson = useCallback((nextLesson: TutorialLesson, index: number) => {
    setLessonIndex(index);
    setStepIndex(0);
    setEngine(createTutorialEngine(nextLesson));
    setPhase('playing');
    setFeedback(nextLesson.steps[0]!.objective);
  }, []);

  const resetLesson = useCallback(
    (nextLesson: TutorialLesson = lesson) => {
      setStepIndex(0);
      setEngine(createTutorialEngine(nextLesson));
      setPhase('playing');
      setFeedback(nextLesson.steps[0]!.objective);
    },
    [lesson],
  );

  const chooseLesson = useCallback(
    (index: number) => {
      const bounded = Math.min(
        Math.max(index, 0),
        TUTORIAL_LESSONS.length - 1,
      );
      beginLesson(TUTORIAL_LESSONS[bounded]!, bounded);
    },
    [beginLesson],
  );

  const persistProgress = useCallback((completedIndex: number) => {
    if (typeof window === 'undefined') return;
    const nextUnlocked = Math.min(
      completedIndex + 1,
      TUTORIAL_LESSONS.length - 1,
    );
    window.localStorage.setItem(PROGRESS_KEY, String(nextUnlocked));
  }, []);

  const finishLesson = useCallback(() => {
    setPhase('success');
    setFeedback(lesson.success);
    persistProgress(lessonIndex);
  }, [lesson.success, lessonIndex, persistProgress]);

  const goToNextStepOrFinish = useCallback(
    (fromStepIndex: number, afterSuccess?: string) => {
      const nextStepIndex = fromStepIndex + 1;
      if (nextStepIndex >= lesson.steps.length) {
        finishLesson();
        return;
      }
      const upcoming = lesson.steps[nextStepIndex]!;
      setStepIndex(nextStepIndex);
      setPhase('playing');
      setFeedback(
        afterSuccess
          ? `${afterSuccess} ${upcoming.objective}`
          : upcoming.objective,
      );
    },
    [finishLesson, lesson.steps],
  );

  const advanceAfterPlayerPly = useCallback(
    (nextEngine: typeof engine) => {
      const current = lesson.steps[stepIndex]!;
      if (current.aiMove && !nextEngine.getState().winner) {
        setPhase('ai-turn');
        setFeedback('Order confirmed. The opposing fleet is responding…');
        return;
      }
      goToNextStepOrFinish(stepIndex, current.success);
    },
    [goToNextStepOrFinish, lesson.steps, stepIndex],
  );

  /** Walkthrough: apply the scripted ply for this step (Next button). */
  const playWalkthroughPly = useCallback(() => {
    if (!walkthrough || phase !== 'playing') return false;
    const next = engine.clone();
    if (!next.movePiece(step.playerMove.pieceId, step.playerMove.to)) {
      setFeedback(
        'This scripted ply became invalid. Restart the walkthrough.',
      );
      return false;
    }
    setEngine(next);
    if (next.getState().winner || stepIndex + 1 >= lesson.steps.length) {
      finishLesson();
      return true;
    }
    goToNextStepOrFinish(stepIndex, step.success);
    return true;
  }, [
    engine,
    finishLesson,
    goToNextStepOrFinish,
    lesson.steps.length,
    phase,
    step,
    stepIndex,
    walkthrough,
  ]);

  /** Advance several quiet plies in a long mission (skims opening/midgame). */
  const playWalkthroughBatch = useCallback(
    (count: number) => {
      if (!walkthrough || phase !== 'playing' || count < 1) return;
      let next = engine.clone();
      let idx = stepIndex;
      for (let n = 0; n < count; n++) {
        const current = lesson.steps[idx];
        if (!current) break;
        if (!next.movePiece(current.playerMove.pieceId, current.playerMove.to)) {
          setEngine(next);
          setStepIndex(idx);
          setFeedback(
            'This scripted ply became invalid. Restart the walkthrough.',
          );
          return;
        }
        if (next.getState().winner || idx + 1 >= lesson.steps.length) {
          setEngine(next);
          finishLesson();
          return;
        }
        idx += 1;
      }
      setEngine(next);
      setStepIndex(idx);
      setPhase('playing');
      setFeedback(lesson.steps[idx]!.objective);
    },
    [engine, finishLesson, lesson.steps, phase, stepIndex, walkthrough],
  );

  const submitMove = useCallback(
    (pieceId: string, to: Coordinate) => {
      if (walkthrough || phase !== 'playing') return;
      if (
        pieceId !== step.playerMove.pieceId ||
        !sameCoordinate(to, step.playerMove.to)
      ) {
        setFeedback(
          'That move is legal, but it does not complete this step’s objective.',
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
      advanceAfterPlayerPly(next);
    },
    [advanceAfterPlayerPly, engine, phase, step, walkthrough],
  );

  useEffect(() => {
    if (walkthrough || phase !== 'ai-turn' || !step.aiMove) return;
    const scriptedMove = step.aiMove;
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

      if (next.getState().winner || stepIndex + 1 >= lesson.steps.length) {
        finishLesson();
        return;
      }
      goToNextStepOrFinish(stepIndex, step.success);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    engine,
    finishLesson,
    goToNextStepOrFinish,
    lesson.steps.length,
    phase,
    step,
    stepIndex,
    walkthrough,
  ]);

  const continueTutorial = useCallback(() => {
    if (lessonIndex === TUTORIAL_LESSONS.length - 1) {
      setPhase('graduated');
      return;
    }
    chooseLesson(lessonIndex + 1);
  }, [chooseLesson, lessonIndex]);

  const progress = useMemo(() => {
    const lessonWeight = 1 / TUTORIAL_LESSONS.length;
    const within =
      phase === 'success'
        ? 1
        : (stepIndex + (phase === 'ai-turn' ? 0.5 : 0)) / totalSteps;
    return (lessonIndex + within) * lessonWeight * 100;
  }, [lessonIndex, phase, stepIndex, totalSteps]);

  return {
    lessonIndex,
    lesson,
    stepIndex,
    step,
    seat,
    totalSteps,
    walkthrough,
    engine,
    phase,
    feedback,
    progress,
    setFeedback,
    resetLesson,
    chooseLesson,
    submitMove,
    playWalkthroughPly,
    playWalkthroughBatch,
    continueTutorial,
  };
}
