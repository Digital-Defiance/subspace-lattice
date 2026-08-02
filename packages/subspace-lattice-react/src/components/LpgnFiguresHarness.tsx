import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  SubspaceLatticeEngine,
  replayLpgn,
  type LpgnReplayResult,
} from '@subspace-lattice/core';
import { Board } from './Board';
import { elementToSvg } from '../vendor/dom-to-svg/index.js';
import { defaultPieceStyleIndex } from '../hooks/usePieceStyle';
import './FiguresCaptureHarness.scss';

interface LpgnFiguresApi {
  /** Load LPGN text; returns ply count (half-moves). */
  load: (text: string) => { plies: number; id: string };
  /** Position after `ply` half-moves (0 = start). */
  show: (ply: number) => void;
  /** SVG of #figure-capture-root for the currently shown position. */
  capture: () => Promise<string>;
  /** Currently loaded game metadata for the capture script. */
  meta: () => { id: string; plies: number; ply: number; token: string };
}

declare global {
  interface Window {
    __lpgnFigures?: LpgnFiguresApi;
  }
}

function focusForPly(
  replay: LpgnReplayResult,
  ply: number,
): { x: number; y: number }[] | undefined {
  if (ply <= 0) return undefined;
  const entry = replay.plies[ply - 1];
  if (!entry) return undefined;
  const p = entry.parsed;
  if (p.kind === 'move') return [p.from, p.to];
  if (p.kind === 'emp' || p.kind === 'terminal-emp') return [p.origin];
  if (p.kind === 'spool-announce' && p.to) return [p.from, p.to];
  if (p.kind === 'spool-failed') return [p.from];
  return undefined;
}

/**
 * Headless LPGN board capture: real Board (Sensor Net + EMP/TO + piece art).
 * Driven by scripts/capture-lpgn-figures.mjs via window.__lpgnFigures.
 *
 * Manual: /harness/lpgn-figures — paste is via the capture script (load API).
 */
export function LpgnFiguresHarness() {
  const [replay, setReplay] = useState<LpgnReplayResult | null>(null);
  const [gameId, setGameId] = useState('lpgn-game');
  const [ply, setPly] = useState(0);

  const maxPly = replay?.plies.length ?? 0;
  const clamped = Math.min(Math.max(ply, 0), maxPly);

  const engine = useMemo(() => {
    if (!replay) return null;
    if (clamped === 0) {
      return SubspaceLatticeEngine.fromState(
        replay.initial,
        replay.engine.getRules(),
      );
    }
    const after = replay.plies[clamped - 1]!.after;
    return SubspaceLatticeEngine.fromState(after, replay.engine.getRules());
  }, [replay, clamped]);

  const focusCells = useMemo(
    () => (replay ? focusForPly(replay, clamped) : undefined),
    [replay, clamped],
  );

  const token =
    clamped > 0 && replay ? replay.plies[clamped - 1]!.token : '(start)';

  useEffect(() => {
    window.__lpgnFigures = {
      load: (text: string) => {
        const next = replayLpgn(text);
        const id = (
          next.parsed.headers.Sector ??
          next.parsed.headers.Event ??
          'lpgn-game'
        )
          .replace(/[^a-zA-Z0-9_-]+/g, '-')
          .slice(0, 72);
        setReplay(next);
        setGameId(id);
        setPly(0);
        return { plies: next.plies.length, id };
      },
      show: (nextPly: number) => setPly(nextPly),
      capture: async () => {
        const root = document.getElementById('figure-capture-root');
        if (!root) throw new Error('figure-capture-root missing');
        return elementToSvg(root, { embedFonts: false });
      },
      meta: () => ({
        id: gameId,
        plies: maxPly,
        ply: clamped,
        token,
      }),
    };
    return () => {
      delete window.__lpgnFigures;
    };
  }, [gameId, maxPly, clamped, token]);

  return (
    <main className="figures-harness" data-testid="lpgn-figures-harness">
      <header className="figures-harness-top">
        <Link to="/">← Home</Link>
        <h1>LPGN figures harness</h1>
        <p>
          Real Board capture for annotated match PDFs (Sensor Net, EMP / Terminal
          Overclock, Subspace Lattice piece art). Automated:{' '}
          <code>yarn capture:lpgn-figures -- --lpgn &lt;file&gt;</code>.
        </p>
      </header>

      <div className="figures-harness-layout">
        <nav className="figures-harness-nav" aria-label="LPGN ply">
          <p className="figures-harness-meta">
            {replay ? (
              <>
                <strong>{gameId}</strong>
                <br />
                {maxPly} plies loaded
              </>
            ) : (
              'Waiting for window.__lpgnFigures.load(lpgnText)…'
            )}
          </p>
          <label className="figures-harness-ply">
            Ply{' '}
            <input
              type="number"
              min={0}
              max={maxPly}
              value={clamped}
              disabled={!replay}
              onChange={(event) => {
                setPly(Number(event.target.value) || 0);
              }}
            />{' '}
            / {maxPly}
          </label>
          {replay && (
            <p className="figures-harness-file">
              Last ply: <code>{token}</code>
            </p>
          )}
        </nav>

        <section className="figures-harness-stage">
          <div className="figures-harness-meta">
            <h2>
              {gameId} — ply {clamped}
            </h2>
            <p>{token}</p>
          </div>

          <div className="figures-capture-shell">
            <div
              id="figure-capture-root"
              className="figures-capture-frame"
              data-testid="figures-capture-frame"
              data-mission-id={gameId}
              data-ply={clamped}
              data-token={token}
            >
              {engine ? (
                <Board
                  gameState={engine.getState()}
                  onMovePiece={() => undefined}
                  onPlacePiece={() => undefined}
                  localPlayer="OBSERVER"
                  guidance={
                    focusCells?.length ? { focusCells } : undefined
                  }
                  pieceStyle={defaultPieceStyleIndex()}
                  contrastOutline={true}
                />
              ) : (
                <p className="figures-capture-hint">No LPGN loaded.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
