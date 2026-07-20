import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  resolveRulesConfig,
  RULES_FIGURES,
  SubspaceLatticeEngine,
  type RulesFigure,
} from '@subspace-lattice/core';
import { Board } from './Board';
import { ObjectiveHud } from './ObjectiveHud';
import './FiguresCaptureHarness.scss';

/**
 * Click a figure → board (and optional HUD) snaps to the rules-manual preset.
 * Capture PNG yourself (or export SVG your own way). Drop files in docs/figures/.
 */
export function FiguresCaptureHarness() {
  const [activeId, setActiveId] = useState(RULES_FIGURES[0]!.id);
  const figure = useMemo(
    () => RULES_FIGURES.find((f) => f.id === activeId) ?? RULES_FIGURES[0]!,
    [activeId],
  );
  const engine = useMemo(
    () =>
      SubspaceLatticeEngine.fromState(
        figure.createState(),
        resolveRulesConfig(figure.rulesVersion),
      ),
    [figure],
  );
  const guidance = useMemo(
    () =>
      figure.highlightCells?.length
        ? { focusCells: figure.highlightCells }
        : undefined,
    [figure],
  );

  return (
    <main className="figures-harness" data-testid="figures-harness">
      <header className="figures-harness-top">
        <Link to="/">← Home</Link>
        <h1>Rules figures harness</h1>
        <p>
          Click a figure. Point your DOM→SVG tool at{' '}
          <code>#figure-capture-root</code> (dashed shell is outside that node).
          Save as <code>docs/figures/&lt;id&gt;.svg</code>.
        </p>
      </header>

      <div className="figures-harness-layout">
        <nav className="figures-harness-nav" aria-label="Figure presets">
          {RULES_FIGURES.map((item) => (
            <FigureButton
              key={item.id}
              figure={item}
              active={item.id === figure.id}
              onSelect={() => setActiveId(item.id)}
            />
          ))}
        </nav>

        <section className="figures-harness-stage">
          <div className="figures-harness-meta">
            <h2>{figure.title}</h2>
            <p className="figures-harness-file">
              Target file:{' '}
              <code>
                docs/figures/{figure.id}.
                {figure.preferFormat === 'png' ? 'png' : 'svg'}
              </code>
              {figure.preferFormat === 'both' ? ' (png or svg)' : ''}
            </p>
            <p>{figure.caption}</p>
            <p className="figures-harness-teach">
              <strong>Shot goal:</strong> {figure.teach}
            </p>
          </div>

          <div className="figures-capture-shell">
            <p className="figures-capture-hint">
              DOM→SVG target: <code>#figure-capture-root</code>
            </p>
            <div
              id="figure-capture-root"
              className="figures-capture-frame"
              data-testid="figures-capture-frame"
              data-figure-id={figure.id}
            >
              {figure.showObjectiveHud && (
                <div className="figures-capture-hud">
                  <ObjectiveHud engine={engine} />
                </div>
              )}
              <Board
                gameState={engine.getState()}
                onMovePiece={() => undefined}
                onPlacePiece={() => undefined}
                localPlayer="OBSERVER"
                guidance={guidance}
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function FigureButton({
  figure,
  active,
  onSelect,
}: {
  figure: RulesFigure;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? 'active' : undefined}
      data-testid={`figure-${figure.id}`}
      aria-pressed={active}
      onClick={onSelect}
    >
      <span className="figures-btn-id">{figure.id}</span>
      <span className="figures-btn-title">{figure.title}</span>
    </button>
  );
}
