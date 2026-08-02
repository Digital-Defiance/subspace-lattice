import { useCallback, useEffect, useMemo, useState } from 'react';
import { PlayerColor, type Coordinate } from '@subspace-lattice/core';
import {
  createTutorialEngine,
  isPuzzleLesson,
  isWalkthroughLesson,
  type TutorialLesson,
  type TutorialStep,
} from '../tutorial/tutorial-model';
import {
  isEmpTutorialMove,
  type TutorialMove,
} from '../tutorial/tutorial-types';
import {
  ACADEMY_PACK,
  type TutorialPackConfig,
} from '../tutorial/tutorial-pack';

export type TutorialPhase = 'playing' | 'ai-turn' | 'success' | 'graduated';

function savedLessonIndex(
  progressKey: string,
  lessonCount: number,
): number {
  if (typeof window === 'undefined') return 0;
  const value = Number(window.localStorage.getItem(progressKey) ?? 0);
  return Number.isInteger(value)
    ? Math.min(Math.max(value, 0), Math.max(0, lessonCount - 1))
    : 0;
}

function sameCoordinate(left: Coordinate, right: Coordinate): boolean {
  return left.x === right.x && left.y === right.y;
}

function stepSeat(step: TutorialStep): PlayerColor {
  return step.seat ?? PlayerColor.White;
}

function acceptedMoves(step: TutorialStep): TutorialMove[] {
  return [step.playerMove, ...(step.alternateMoves ?? [])];
}

function isAcceptedPieceMove(
  step: TutorialStep,
  pieceId: string,
  to: Coordinate,
): boolean {
  return acceptedMoves(step).some(
    (move) =>
      !isEmpTutorialMove(move) &&
      move.pieceId === pieceId &&
      sameCoordinate(move.to, to),
  );
}

function stepExpectsEmp(step: TutorialStep): boolean {
  return acceptedMoves(step).some((move) => isEmpTutorialMove(move));
}

/** Deterministic tutorial / drill controller; graded lessons never invoke MCTS. */
export function useTutorialGame(pack: TutorialPackConfig = ACADEMY_PACK) {
  const lessons = pack.lessons;
  const [lessonIndex, setLessonIndex] = useState(() =>
    savedLessonIndex(pack.progressKey, lessons.length),
  );
  const lesson = lessons[lessonIndex]!;
  const [stepIndex, setStepIndex] = useState(0);
  const [engine, setEngine] = useState(() => createTutorialEngine(lesson));
  const [phase, setPhase] = useState<TutorialPhase>('playing');
  const [feedback, setFeedback] = useState(lesson.steps[0]!.objective);

  const step = lesson.steps[stepIndex]!;
  const seat = stepSeat(step);
  const totalSteps = lesson.steps.length;
  const walkthrough = isWalkthroughLesson(lesson);
  const puzzle = isPuzzleLesson(lesson);

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
      const bounded = Math.min(Math.max(index, 0), lessons.length - 1);
      beginLesson(lessons[bounded]!, bounded);
    },
    [beginLesson, lessons],
  );

  const persistProgress = useCallback(
    (completedIndex: number) => {
      if (typeof window === 'undefined') return;
      const nextUnlocked = Math.min(completedIndex + 1, lessons.length - 1);
      window.localStorage.setItem(pack.progressKey, String(nextUnlocked));
    },
    [lessons.length, pack.progressKey],
  );

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
    const move = step.playerMove;
    const ok = isEmpTutorialMove(move)
      ? next.fireEmp()
      : next.movePiece(move.pieceId, move.to);
    if (!ok) {
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
      const next = engine.clone();
      let idx = stepIndex;
      for (let n = 0; n < count; n++) {
        const current = lesson.steps[idx];
        if (!current) break;
        const move = current.playerMove;
        const ok = isEmpTutorialMove(move)
          ? next.fireEmp()
          : next.movePiece(move.pieceId, move.to);
        if (!ok) {
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
    (pieceId: string, to: Coordinate): boolean => {
      if (walkthrough || phase !== 'playing') return false;
      if (stepExpectsEmp(step)) {
        setFeedback(
          puzzle
            ? 'This puzzle is solved with Command Overload — Fire EMP when ready.'
            : 'This step needs Command Overload — use Fire EMP on the objective HUD.',
        );
        return false;
      }
      if (!isAcceptedPieceMove(step, pieceId, to)) {
        setFeedback(
          puzzle
            ? 'Legal, but not the line. Look again — there is a sharper idea.'
            : 'That move is legal, but it does not complete this step’s objective.',
        );
        return false;
      }

      const next = engine.clone();
      if (!next.movePiece(pieceId, to)) {
        setFeedback(
          puzzle
            ? 'That order is not legal here.'
            : 'That order is not legal in this position. Try the highlighted destination.',
        );
        return false;
      }
      setEngine(next);
      advanceAfterPlayerPly(next);
      return true;
    },
    [advanceAfterPlayerPly, engine, phase, puzzle, step, walkthrough],
  );

  const submitEmp = useCallback((): boolean => {
    if (walkthrough || phase !== 'playing') return false;
    if (!stepExpectsEmp(step)) {
      setFeedback(
        puzzle
          ? 'Not yet — this puzzle wants a piece move, not EMP.'
          : 'Do not fire EMP on this step — complete the highlighted objective first.',
      );
      return false;
    }
    if (!engine.canFireEmp()) {
      setFeedback('Command Overload is not armed yet.');
      return false;
    }
    const next = engine.clone();
    if (!next.fireEmp()) {
      setFeedback('EMP could not fire in this position. Restart.');
      return false;
    }
    setEngine(next);
    advanceAfterPlayerPly(next);
    return true;
  }, [advanceAfterPlayerPly, engine, phase, puzzle, step, walkthrough]);

  useEffect(() => {
    if (walkthrough || phase !== 'ai-turn' || !step.aiMove) return;
    const scriptedMove = step.aiMove;
    const timer = window.setTimeout(() => {
      const next = engine.clone();
      const applied = isEmpTutorialMove(scriptedMove)
        ? next.fireEmp()
        : next.movePiece(scriptedMove.pieceId, scriptedMove.to);
      if (!applied) {
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
    if (lessonIndex === lessons.length - 1) {
      setPhase('graduated');
      return;
    }
    chooseLesson(lessonIndex + 1);
  }, [chooseLesson, lessonIndex, lessons.length]);

  const progress = useMemo(() => {
    const lessonWeight = 1 / lessons.length;
    const within =
      phase === 'success'
        ? 1
        : (stepIndex + (phase === 'ai-turn' ? 0.5 : 0)) / totalSteps;
    return (lessonIndex + within) * lessonWeight * 100;
  }, [lessonIndex, lessons.length, phase, stepIndex, totalSteps]);

  return {
    pack,
    lessons,
    lessonIndex,
    lesson,
    stepIndex,
    step,
    seat,
    totalSteps,
    walkthrough,
    puzzle,
    engine,
    phase,
    feedback,
    progress,
    setFeedback,
    resetLesson,
    chooseLesson,
    submitMove,
    submitEmp,
    playWalkthroughPly,
    playWalkthroughBatch,
    continueTutorial,
  };
}
