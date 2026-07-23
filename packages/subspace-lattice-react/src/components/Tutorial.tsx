import { Link } from 'react-router-dom';
import { PlayerColor } from '@subspace-lattice/core';
import { Board } from './Board';
import { ObjectiveHud } from './ObjectiveHud';
import {
  TUTORIAL_LESSONS,
  isWalkthroughLesson,
} from '../tutorial/tutorial-model';
import { useTutorialGame } from '../hooks/useTutorialGame';
import './Tutorial.scss';

const ACADEMY_LESSONS = TUTORIAL_LESSONS.map((item, index) => ({
  item,
  index,
})).filter(({ item }) => !isWalkthroughLesson(item));

const MISSION_LESSONS = TUTORIAL_LESSONS.map((item, index) => ({
  item,
  index,
})).filter(({ item }) => isWalkthroughLesson(item));

export function Tutorial() {
  const {
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
  } = useTutorialGame();

  const missionOrdinal =
    MISSION_LESSONS.findIndex(({ index }) => index === lessonIndex) + 1;

  if (phase === 'graduated') {
    return (
      <main className="tutorial tutorial--graduated">
        <section className="tutorial-graduation">
          <span className="tutorial-kicker">Core training complete</span>
          <h1>You can command the fleet.</h1>
          <p>
            You finished the drills and three guided missions: a Surgical Strike
            highlight reel, a chess-length battle, and a sector-clock finish.
            Practice against the AI next—export a debug log if a match still
            feels opaque.
          </p>
          <div className="tutorial-actions">
            <Link className="tutorial-primary" to="/play">
              Practice against the AI
            </Link>
            <button type="button" onClick={() => chooseLesson(0)}>
              Repeat the academy
            </button>
          </div>
        </section>
      </main>
    );
  }

  const state = engine.getState();
  const humanToMove =
    !walkthrough && phase === 'playing' && state.currentPlayer === seat;
  const seatLabel = seat === PlayerColor.Black ? 'Black' : 'White';

  return (
    <main className={`tutorial${walkthrough ? ' tutorial--walkthrough' : ''}`}>
      <header className="tutorial-topbar">
        <Link to="/" className="tutorial-home">
          <img
            src="/SubspaceLattice-text-title-pretty.svg"
            alt="Subspace Lattice"
            width={250}
          />
        </Link>
        <span>
          {walkthrough
            ? `Mission ${missionOrdinal}/${MISSION_LESSONS.length}`
            : `Academy ${lesson.number}/${String(ACADEMY_LESSONS.length).padStart(2, '0')}`}
          {totalSteps > 1
            ? ` · ${walkthrough ? 'Ply' : 'Step'} ${stepIndex + 1}/${totalSteps}`
            : ''}
        </span>
        <button type="button" onClick={() => resetLesson()}>
          Restart {walkthrough ? 'game' : 'lesson'}
        </button>
      </header>

      <div className="tutorial-progress" aria-label="Tutorial progress">
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="tutorial-layout">
        <section className="tutorial-board-panel" aria-label="Training board">
          <Board
            gameState={state}
            onMovePiece={submitMove}
            onPlacePiece={() => undefined}
            localPlayer={humanToMove ? seat : 'OBSERVER'}
            guidance={{
              selectablePieceIds: walkthrough
                ? []
                : [step.playerMove.pieceId],
              allowedDestinations: walkthrough ? [] : [step.playerMove.to],
              focusCells: step.focusCells ?? [
                ...(engine.getPiece(step.playerMove.pieceId)
                  ? [engine.getPiece(step.playerMove.pieceId)!.position]
                  : []),
                step.playerMove.to,
              ],
            }}
            onInvalidAction={setFeedback}
          />
          <ObjectiveHud
            engine={engine}
            explain
            paused={lesson.hudPaused !== false}
          />
        </section>

        <aside className="tutorial-coach" aria-live="polite">
          <span className="tutorial-kicker">{lesson.concept}</span>
          <h1>{lesson.title}</h1>
          <p className="tutorial-explanation">{lesson.explanation}</p>
          {totalSteps > 1 && (
            <p className="tutorial-step-why">
              <strong>
                {walkthrough ? 'Ply' : 'Step'} {stepIndex + 1}/{totalSteps}
                {' · '}
                {seatLabel}
              </strong>
              {' — '}
              {step.why}
            </p>
          )}

          <div
            className={`tutorial-objective ${phase === 'success' ? 'is-complete' : ''}`}
          >
            <span>
              {phase === 'success'
                ? walkthrough
                  ? 'How this game was won'
                  : 'Objective complete'
                : walkthrough
                  ? 'Coming up'
                  : 'Your objective'}
            </span>
            <p>{feedback}</p>
          </div>

          <div className="tutorial-actions">
            <button
              type="button"
              disabled={lessonIndex === 0}
              onClick={() => chooseLesson(lessonIndex - 1)}
            >
              Back
            </button>
            {phase === 'success' && (
              <button
                type="button"
                className="tutorial-primary"
                onClick={continueTutorial}
                data-testid="tutorial-continue"
              >
                {lessonIndex === TUTORIAL_LESSONS.length - 1
                  ? 'Complete training'
                  : 'Next lesson'}
              </button>
            )}
            {phase === 'playing' && walkthrough && (
              <>
                <button
                  type="button"
                  className="tutorial-primary"
                  onClick={() => playWalkthroughPly()}
                  data-testid="tutorial-play-ply"
                >
                  {stepIndex === totalSteps - 1
                    ? 'Play the winning move'
                    : 'Play this move'}
                </button>
                {totalSteps > 12 && stepIndex < totalSteps - 1 && (
                  <button
                    type="button"
                    onClick={() => playWalkthroughBatch(5)}
                    data-testid="tutorial-play-batch"
                  >
                    Play next 5
                  </button>
                )}
              </>
            )}
            {phase !== 'success' && (
              <button type="button" onClick={continueTutorial}>
                Skip
              </button>
            )}
          </div>

          <nav className="tutorial-nav" aria-label="Academy curriculum">
            <div className="tutorial-nav-group">
              <span className="tutorial-nav-label">Academy</span>
              <div className="tutorial-lessons" role="list">
                {ACADEMY_LESSONS.map(({ item, index }) => (
                  <button
                    key={item.id}
                    type="button"
                    role="listitem"
                    className={index === lessonIndex ? 'is-current' : ''}
                    onClick={() => chooseLesson(index)}
                    aria-label={`Lesson ${item.number}: ${item.title}`}
                  >
                    {item.number}
                  </button>
                ))}
              </div>
            </div>
            <div className="tutorial-nav-group">
              <span className="tutorial-nav-label">Missions</span>
              <div className="tutorial-missions" role="list">
                {MISSION_LESSONS.map(({ item, index }, missionIndex) => (
                  <button
                    key={item.id}
                    type="button"
                    role="listitem"
                    className={index === lessonIndex ? 'is-current' : ''}
                    onClick={() => chooseLesson(index)}
                    aria-label={`Mission ${missionIndex + 1}: ${item.title}`}
                    title={item.title}
                  >
                    M{missionIndex + 1}
                  </button>
                ))}
              </div>
            </div>
          </nav>
        </aside>
      </div>
    </main>
  );
}
