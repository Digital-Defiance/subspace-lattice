import { Link } from 'react-router-dom';
import { PlayerColor } from '@subspace-lattice/core';
import { Board } from './Board';
import { ObjectiveHud } from './ObjectiveHud';
import { isWalkthroughLesson } from '../tutorial/tutorial-model';
import { isEmpTutorialMove } from '../tutorial/tutorial-types';
import {
  ACADEMY_PACK,
  type TutorialPackConfig,
} from '../tutorial/tutorial-pack';
import { useTutorialGame } from '../hooks/useTutorialGame';
import {
  DRILL_PHASE_LABEL,
  FLEET_DRILL_PACK,
  type DrillPhase,
  type FleetDrillLesson,
} from '../tutorial/fleet-drills';
import { FLEET_PUZZLE_PACK } from '../tutorial/fleet-puzzles';
import './Tutorial.scss';

const ACADEMY_YOUTUBE_PLAYLIST =
  'https://www.youtube.com/playlist?list=PLSHzhG5rQ1B8';

function AcademyVideoFooter() {
  return (
    <footer className="tutorial-footer">
      <a
        href={ACADEMY_YOUTUBE_PLAYLIST}
        target="_blank"
        rel="noopener noreferrer"
      >
        Watch Academy videos on YouTube
      </a>
    </footer>
  );
}

export interface TutorialProps {
  /** Defaults to the full Fleet Academy curriculum. */
  pack?: TutorialPackConfig;
}

export function Tutorial({ pack = ACADEMY_PACK }: TutorialProps) {
  const {
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
  } = useTutorialGame(pack);

  const indexed = lessons.map((item, index) => ({ item, index }));
  const academyLessons = indexed.filter(({ item }) => !isWalkthroughLesson(item));
  const missionLessons = indexed.filter(({ item }) => isWalkthroughLesson(item));
  const isAcademy = pack.id === 'academy';
  const isDrills = pack.id === 'fleet-arc';
  const isPuzzles = pack.id === 'puzzles';
  const missionOrdinal =
    missionLessons.findIndex(({ index }) => index === lessonIndex) + 1;
  const empStep =
    !walkthrough &&
    phase === 'playing' &&
    (puzzle
      ? engine.canFireEmp()
      : isEmpTutorialMove(step.playerMove));

  if (phase === 'graduated') {
    return (
      <main className="tutorial tutorial--graduated">
        <section className="tutorial-graduation">
          <span className="tutorial-kicker">{pack.kicker} complete</span>
          <h1>
            {isAcademy
              ? 'You can command the fleet.'
              : `${pack.title} complete.`}
          </h1>
          <p>
            {isAcademy
              ? 'You finished the academy. Warm up with Fleet drills before game 1, then try the thinking puzzles.'
              : isDrills
                ? 'Intro complete. Next: a local Fast AI match — or sharpen with puzzles.'
                : 'Sharp work. Take that discipline into a fleet match.'}
          </p>
          <div className="tutorial-actions">
            <Link
              className="tutorial-primary"
              to={pack.completeHref ?? '/play'}
            >
              {pack.completeLabel ?? 'Back to play'}
            </Link>
            {isAcademy ? <Link to="/drills">Fleet drills</Link> : null}
            {isDrills ? <Link to="/puzzles">Puzzles</Link> : null}
            {isPuzzles ? <Link to="/play">Command deck</Link> : null}
            {!isAcademy ? <Link to="/tutorial">Fleet Academy</Link> : null}
            <button type="button" onClick={() => chooseLesson(0)}>
              Repeat {isPuzzles ? 'the puzzles' : isDrills ? 'the drills' : 'the academy'}
            </button>
          </div>
          {isAcademy ? <AcademyVideoFooter /> : null}
        </section>
      </main>
    );
  }

  const state = engine.getState();
  const humanToMove =
    !walkthrough && phase === 'playing' && state.currentPlayer === seat;
  const seatLabel = seat === PlayerColor.Black ? 'Black' : 'White';

  const guidance = walkthrough
    ? {
        selectablePieceIds: [] as string[],
        allowedDestinations: [] as { x: number; y: number }[],
        focusCells: step.focusCells ?? [],
      }
    : puzzle
      ? {
          // Free selection — no solution highlight. Soft theatre only.
          focusCells: step.focusCells ?? [],
        }
      : {
          selectablePieceIds: isEmpTutorialMove(step.playerMove)
            ? []
            : [step.playerMove.pieceId],
          allowedDestinations: isEmpTutorialMove(step.playerMove)
            ? []
            : [step.playerMove.to],
          focusCells: step.focusCells ??
            (isEmpTutorialMove(step.playerMove)
              ? []
              : [
                  ...(engine.getPiece(step.playerMove.pieceId)
                    ? [engine.getPiece(step.playerMove.pieceId)!.position]
                    : []),
                  step.playerMove.to,
                ]),
        };

  return (
    <main
      className={`tutorial${walkthrough ? ' tutorial--walkthrough' : ''}${
        puzzle ? ' tutorial--puzzle' : ''
      }`}
    >
      <header className="tutorial-topbar">
        <Link to={pack.homeHref ?? '/'} className="tutorial-home">
          <img
            src="/SubspaceLattice-text-title-pretty.svg"
            alt="Subspace Lattice"
            width={250}
          />
        </Link>
        <span>
          {walkthrough
            ? `Mission ${missionOrdinal}/${missionLessons.length}`
            : `${pack.title} ${lesson.number}/${String(lessons.length).padStart(2, '0')}`}
          {totalSteps > 1
            ? ` · ${walkthrough ? 'Ply' : puzzle ? 'Move' : 'Step'} ${stepIndex + 1}/${totalSteps}`
            : ''}
        </span>
        <button type="button" onClick={() => resetLesson()}>
          Restart {walkthrough ? 'game' : puzzle ? 'puzzle' : 'lesson'}
        </button>
      </header>

      <div className="tutorial-progress" aria-label="Progress">
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="tutorial-layout">
        <section className="tutorial-board-panel" aria-label="Training board">
          <Board
            gameState={state}
            engine={engine}
            onMovePiece={submitMove}
            onPlacePiece={() => undefined}
            localPlayer={humanToMove ? seat : 'OBSERVER'}
            guidance={guidance}
            onInvalidAction={setFeedback}
          />
          <ObjectiveHud
            engine={engine}
            explain
            paused={lesson.hudPaused !== false}
            onFireEmp={empStep ? () => submitEmp() : undefined}
            canFireEmpAction={empStep}
          />
        </section>

        <aside className="tutorial-coach" aria-live="polite">
          <span className="tutorial-kicker">{lesson.concept}</span>
          <h1>{lesson.title}</h1>
          <p className="tutorial-explanation">{lesson.explanation}</p>
          {!puzzle && totalSteps > 1 && (
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
                  : puzzle
                    ? 'Solved'
                    : 'Objective complete'
                : walkthrough
                  ? 'Coming up'
                  : puzzle
                    ? 'Find the idea'
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
                {lessonIndex === lessons.length - 1
                  ? 'Complete pack'
                  : puzzle
                    ? 'Next puzzle'
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

          <nav
            className="tutorial-nav"
            aria-label={isAcademy ? 'Academy curriculum' : pack.title}
          >
            {isAcademy ? (
              <>
                <div className="tutorial-nav-group">
                  <span className="tutorial-nav-label">Academy</span>
                  <div className="tutorial-lessons" role="list">
                    {academyLessons.map(({ item, index }) => (
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
                    {missionLessons.map(({ item, index }, missionIndex) => (
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
              </>
            ) : isDrills ? (
              (['opening', 'midgame', 'sector', 'strike', 'terminal'] as const).map(
                (phaseKey) => {
                  const group = indexed.filter(
                    ({ item }) =>
                      (item as FleetDrillLesson).phase ===
                      (phaseKey as DrillPhase),
                  );
                  if (group.length === 0) return null;
                  return (
                    <div className="tutorial-nav-group" key={phaseKey}>
                      <span className="tutorial-nav-label">
                        {DRILL_PHASE_LABEL[phaseKey]}
                      </span>
                      <div className="tutorial-lessons" role="list">
                        {group.map(({ item, index }) => (
                          <button
                            key={item.id}
                            type="button"
                            role="listitem"
                            className={index === lessonIndex ? 'is-current' : ''}
                            onClick={() => chooseLesson(index)}
                            aria-label={`Drill ${item.number}: ${item.title}`}
                            title={item.title}
                            data-testid={`drill-nav-${item.id}`}
                          >
                            {item.number}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                },
              )
            ) : (
              <div className="tutorial-nav-group">
                <span className="tutorial-nav-label">Puzzles</span>
                <div className="tutorial-lessons" role="list">
                  {indexed.map(({ item, index }) => (
                    <button
                      key={item.id}
                      type="button"
                      role="listitem"
                      className={index === lessonIndex ? 'is-current' : ''}
                      onClick={() => chooseLesson(index)}
                      aria-label={`Puzzle ${item.number}: ${item.title}`}
                      title={item.title}
                      data-testid={`puzzle-nav-${item.id}`}
                    >
                      {item.number}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </nav>
        </aside>
      </div>

      {isAcademy ? <AcademyVideoFooter /> : null}
    </main>
  );
}

/** Intro pack before Game 1 (`/drills`). */
export function FleetDrills() {
  return <Tutorial pack={FLEET_DRILL_PACK} />;
}

/** Thinking puzzles (`/puzzles`). */
export function FleetPuzzles() {
  return <Tutorial pack={FLEET_PUZZLE_PACK} />;
}

/** @deprecated Use {@link FleetDrills}. */
export function TerminalDrills() {
  return <FleetDrills />;
}
