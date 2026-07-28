import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Board } from './Board';
import {
  buildManualMissions,
  manualMissionEngineAt,
  type ManualMission,
} from '../tutorial/manual-missions';
import { elementToSvg } from '../vendor/dom-to-svg/index.js';
import { defaultPieceStyleIndex } from '../hooks/usePieceStyle';
import './FiguresCaptureHarness.scss';

interface MissionFiguresApi {
  missions: { id: string; plies: number }[];
  show: (missionIndex: number, ply: number) => void;
  /** SVG of #figure-capture-root for the currently shown position. */
  capture: () => Promise<string>;
}

declare global {
  interface Window {
    __missionFigures?: MissionFiguresApi;
  }
}

/**
 * Advanced-manual capture page: every ply of every guided mission as a board
 * diagram. Driven headlessly by scripts/capture-mission-figures.mjs via
 * window.__missionFigures (vendored dom-to-svg does the vector export).
 *
 * Manual use: /harness/mission-figures?mission=<id>&ply=<n>
 * (ply n = position after n scripted plies; the nth move's from/to glow).
 */
export function MissionFiguresHarness() {
  const missions = useMemo(buildManualMissions, []);
  const [params, setParams] = useSearchParams();
  const [selection, setSelection] = useState(() => ({
    mission: Math.max(
      0,
      missions.findIndex((m) => m.id === params.get('mission')),
    ),
    ply: Number(params.get('ply') ?? '1') || 1,
  }));

  const mission = missions[selection.mission]!;
  const ply = Math.min(Math.max(selection.ply, 0), mission.steps.length);
  const engine = useMemo(
    () => manualMissionEngineAt(mission, ply),
    [mission, ply],
  );
  const step = ply > 0 ? mission.steps[ply - 1]! : null;
  const guidance = step?.focusCells?.length
    ? { focusCells: step.focusCells }
    : step
      ? { focusCells: [step.playerMove.to] }
      : undefined;

  useEffect(() => {
    window.__missionFigures = {
      missions: missions.map((m: ManualMission) => ({
        id: m.id,
        plies: m.steps.length,
      })),
      show: (missionIndex, nextPly) =>
        setSelection({ mission: missionIndex, ply: nextPly }),
      capture: async () => {
        const root = document.getElementById('figure-capture-root');
        if (!root) throw new Error('figure-capture-root missing');
        return elementToSvg(root, { embedFonts: false });
      },
    };
    return () => {
      delete window.__missionFigures;
    };
  }, [missions]);

  return (
    <main className="figures-harness" data-testid="mission-figures-harness">
      <header className="figures-harness-top">
        <Link to="/">← Home</Link>
        <h1>Mission figures harness</h1>
        <p>
          Advanced-manual diagrams. Automated capture:{' '}
          <code>yarn capture:mission-figures</code>.
        </p>
      </header>

      <div className="figures-harness-layout">
        <nav className="figures-harness-nav" aria-label="Mission selection">
          {missions.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={index === selection.mission ? 'active' : undefined}
              onClick={() => {
                setSelection({ mission: index, ply: 1 });
                setParams({ mission: item.id, ply: '1' });
              }}
            >
              <span className="figures-btn-id">{item.id}</span>
              <span className="figures-btn-title">
                {item.steps.length} plies
              </span>
            </button>
          ))}
          <label className="figures-harness-ply">
            Ply{' '}
            <input
              type="number"
              min={0}
              max={mission.steps.length}
              value={ply}
              onChange={(event) => {
                const next = Number(event.target.value) || 0;
                setSelection((prev) => ({ ...prev, ply: next }));
                setParams({ mission: mission.id, ply: String(next) });
              }}
            />{' '}
            / {mission.steps.length}
          </label>
        </nav>

        <section className="figures-harness-stage">
          <div className="figures-harness-meta">
            <h2>
              {mission.title} — ply {ply}
            </h2>
            {step && <p>{step.why}</p>}
          </div>

          <div className="figures-capture-shell">
            <div
              id="figure-capture-root"
              className="figures-capture-frame"
              data-testid="figures-capture-frame"
              data-mission-id={mission.id}
              data-ply={ply}
            >
              <Board
                gameState={engine.getState()}
                onMovePiece={() => undefined}
                onPlacePiece={() => undefined}
                localPlayer="OBSERVER"
                guidance={guidance}
                contrast="high"
                pieceStyle={defaultPieceStyleIndex()}
                contrastOutline={true}
                showContrastToggle={false}
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
