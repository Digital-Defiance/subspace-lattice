import { Link } from 'react-router-dom';
import { PlayerColor } from '@subspace-lattice/core';
import { Board } from './Board';
import { ObjectiveHud } from './ObjectiveHud';
import { TUTORIAL_LESSONS } from '../tutorial/tutorial-model';
import { useTutorialGame } from '../hooks/useTutorialGame';
import './Tutorial.scss';

export function Tutorial() {
  const {
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
  } = useTutorialGame();

  if (phase === 'graduated') {
    return (
      <main className="tutorial tutorial--graduated">
        <section className="tutorial-graduation">
          <span className="tutorial-kicker">Core training complete</span>
          <h1>You can command the fleet.</h1>
          <p>
            You have moved every ship, built a Sensor Net, survived Target
            Lock, fired a Beam, warped through a gap, captured an enemy,
            repaired a broken relay, contested overlapping coverage, and seen
            the sector clock arm. Guided battles and a hinted AI match come
            next.
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
  return (
    <main className="tutorial">
      <header className="tutorial-topbar">
        <Link to="/" className="tutorial-home">
          <img src="/SubspaceLattice-text-title-pretty.svg" alt="Subspace Lattice" width={250} />
        </Link>
        <span>
          Academy {lesson.number}/{String(TUTORIAL_LESSONS.length).padStart(2, '0')}
        </span>
        <button type="button" onClick={() => resetLesson()}>
          Restart lesson
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
            localPlayer={
              phase === 'playing' && state.currentPlayer === PlayerColor.White
                ? PlayerColor.White
                : 'OBSERVER'
            }
            guidance={{
              selectablePieceIds: [lesson.playerMove.pieceId],
              allowedDestinations: [lesson.playerMove.to],
              focusCells: lesson.focusCells,
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

          <div
            className={`tutorial-objective ${phase === 'success' ? 'is-complete' : ''}`}
          >
            <span>{phase === 'success' ? 'Objective complete' : 'Your objective'}</span>
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
            {phase !== 'success' && (
              <button type="button" onClick={continueTutorial}>
                Skip
              </button>
            )}
          </div>

          <nav className="tutorial-lessons" aria-label="Academy lessons">
            {TUTORIAL_LESSONS.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={index === lessonIndex ? 'is-current' : ''}
                onClick={() => chooseLesson(index)}
                aria-label={`Lesson ${item.number}: ${item.title}`}
              >
                {item.number}
              </button>
            ))}
          </nav>
        </aside>
      </div>
    </main>
  );
}
