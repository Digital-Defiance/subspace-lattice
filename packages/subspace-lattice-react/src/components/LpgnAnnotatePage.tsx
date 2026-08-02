import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PlayerColor,
  SubspaceLatticeEngine,
  annotateLpgnReplay,
  replayLpgn,
  type AiStrengthId,
  type AnnotateLpgnProgress,
  type LpgnAnnotationReport,
  type LpgnPlyAnnotation,
} from '@subspace-lattice/core';
import { Board } from './Board';
import { defaultPieceStyleIndex } from '../hooks/usePieceStyle';
import './LpgnAnnotatePage.scss';

type PerspectiveId = 'white' | 'black';

const noopMove = () => undefined;
const noopPlace = () => undefined;

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const m2 = m % 60;
  return m2 > 0 ? `${h}h ${m2}m` : `${h}h`;
}

/** Linear ETA from overall %; null until we have a usable sample. */
function estimateEtaMs(
  startedAt: number,
  percent: number,
  now = Date.now(),
): number | null {
  if (percent < 0.8) return null;
  const elapsed = now - startedAt;
  if (elapsed < 3000) return null;
  return elapsed * ((100 - percent) / percent);
}

/**
 * Overall bar stays tiny during the first Deep tip (~1/135). Extrapolate from
 * the current MCTS step across ~half the plies (graded seat).
 */
function effectiveEtaPercent(
  p: AnnotateLpgnProgress,
): number {
  if (p.percent >= 1) return p.percent;
  const step = p.step;
  if (
    step &&
    step.total >= 40 &&
    step.current > 0 &&
    /sims/i.test(step.label)
  ) {
    const gradedTotal = Math.max(1, Math.ceil(p.total / 2));
    const gradedDone = Math.floor(p.current / 2);
    const stepFrac = step.current / Math.max(1, step.total);
    return Math.min(99, (100 * (gradedDone + stepFrac)) / gradedTotal);
  }
  return p.percent;
}

const STRENGTHS: { id: AiStrengthId; label: string; note: string }[] = [
  { id: 'fast', label: 'Fast', note: 'heuristic only — quickest' },
  { id: 'normal', label: 'Normal', note: 'MCTS@50 — solid default' },
  { id: 'strong', label: 'Strong', note: 'MCTS@200 — slow on long games' },
  { id: 'deep', label: 'Deep', note: 'MCTS@800 — very slow in-browser' },
];

function reportTitle(report: LpgnAnnotationReport): string {
  const h = report.replay.parsed.headers;
  return (h.Sector ?? h.Event ?? 'LPGN match').trim() || 'LPGN match';
}

function seedReport(
  replay: LpgnAnnotationReport['replay'],
): LpgnAnnotationReport {
  const h = replay.parsed.headers;
  return {
    replay,
    annotations: [],
    shortcuts: [],
    branches: [],
    summary: [
      `${h.White ?? 'White'} vs ${h.Black ?? 'Black'} — annotating…`,
      `${replay.plies.length} plies · ${h.Rules ?? '?'} · ${h.HeavyWing ?? '?'}`,
    ],
  };
}

function AnnotateBoard({
  report,
  ann,
}: {
  report: LpgnAnnotationReport;
  ann: LpgnPlyAnnotation;
}) {
  const engine = useMemo(() => {
    const after = report.replay.plies[ann.ply - 1]?.after;
    if (!after) return null;
    return SubspaceLatticeEngine.fromState(after, report.replay.engine.getRules());
  }, [report, ann.ply]);

  if (!engine) return null;

  return (
    <div className="lpgn-annotate-board">
      <Board
        gameState={engine.getState()}
        onMovePiece={noopMove}
        onPlacePiece={noopPlace}
        localPlayer="OBSERVER"
        interactive={false}
        guidance={ann.focus.length ? { focusCells: ann.focus } : undefined}
        pieceStyle={defaultPieceStyleIndex()}
        contrastOutline={true}
      />
    </div>
  );
}

function PlyBlock({
  report,
  ann,
  showBoard,
}: {
  report: LpgnAnnotationReport;
  ann: LpgnPlyAnnotation;
  showBoard: boolean;
}) {
  const grade = ann.grade;
  return (
    <article
      className={`lpgn-annotate-ply${ann.isKeyDiagram ? ' is-key' : ''}`}
      data-ply={ann.ply}
    >
      <header>
        <h3>
          {ann.heading}{' '}
          <code>{ann.token}</code>
        </h3>
        {ann.phase ? <p className="lpgn-annotate-phase">{ann.phase}</p> : null}
      </header>

      {showBoard ? <AnnotateBoard report={report} ann={ann} /> : null}

      {ann.facts.length > 0 ? (
        <ul className="lpgn-annotate-facts">
          {ann.facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}

      {ann.why.length > 0 ? (
        <div className="lpgn-annotate-why">
          <h4>Why</h4>
          <ul>
            {ann.why.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {grade ? (
        <div className="lpgn-annotate-grade">
          <h4>Grade</h4>
          <p>
            1-ply shortlist rank {grade.rank}/
            {Math.max(1, grade.candidateCount)} · {grade.optimalityPct}%
            {grade.agreesWithTop
              ? ' · matched advisor tip'
              : grade.rank === 1
                ? ' · shortlist liked this; deeper search preferred another plan'
                : ' · deeper search preferred another plan'}
          </p>
          {grade.alternative ? (
            <p className="lpgn-annotate-alt">
              Try instead: {grade.alternative.summary}
              {grade.alternative.reasons
                .filter(
                  (r) =>
                    !r.startsWith('Move ') &&
                    !r.startsWith('Selected by the tactical'),
                )
                .slice(0, 1)
                .map((r) => ` — ${r}`)
                .join('')}
            </p>
          ) : null}
        </div>
      ) : null}

      {ann.shortcut ? (
        <p className="lpgn-annotate-callout is-shortcut">
          Shortcut: {ann.shortcut.note}
        </p>
      ) : null}
      {ann.branch ? (
        <p className="lpgn-annotate-callout is-branch">
          {ann.branch.title}: {ann.branch.note}
          {ann.branch.betterIdea ? ` — ${ann.branch.betterIdea}` : ''}
        </p>
      ) : null}
    </article>
  );
}

/**
 * Client-side LPGN annotate: runs replay + advisor grading in the browser,
 * streams plies into a live report, then prints as HTML (your CPU, not ours).
 */
export function LpgnAnnotatePage() {
  const [text, setText] = useState('');
  const [perspective, setPerspective] = useState<PerspectiveId>('white');
  const [strength, setStrength] = useState<AiStrengthId>('fast');
  const [diagrams, setDiagrams] = useState<'key' | 'all' | 'none'>('key');
  const [progress, setProgress] = useState<AnnotateLpgnProgress | null>(null);
  const [report, setReport] = useState<LpgnAnnotationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const liveTailRef = useRef<HTMLDivElement | null>(null);
  const annotateStartedAtRef = useRef(0);
  const [clockMs, setClockMs] = useState(0);

  const annotationCount = report?.annotations.length ?? 0;

  useEffect(() => {
    if (!running || annotationCount === 0) return;
    liveTailRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [running, annotationCount]);

  useEffect(() => {
    if (!running) return;
    setClockMs(Date.now());
    const id = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const etaLabel = (() => {
    if (!running || !progress || progress.phase !== 'annotate') return null;
    if (progress.percent >= 100) return null;
    const start = annotateStartedAtRef.current;
    if (!start) return null;
    const pct = effectiveEtaPercent(progress);
    const eta = estimateEtaMs(start, pct, clockMs || Date.now());
    if (eta == null) return 'Estimating time left…';
    const elapsed = formatDuration((clockMs || Date.now()) - start);
    return `~${formatDuration(eta)} left · elapsed ${elapsed}`;
  })();

  const onFile = async (file: File | null) => {
    if (!file) return;
    setText(await file.text());
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  const run = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Paste or upload an LPGN file first.');
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    setError(null);
    setReport(null);
    annotateStartedAtRef.current = 0;

    let lastUi = 0;
    let pending: AnnotateLpgnProgress | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flushProgress = (p: AnnotateLpgnProgress) => {
      pending = null;
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      lastUi = Date.now();
      setProgress(p);
    };
    const pushProgress = (p: AnnotateLpgnProgress, force = false) => {
      if (force || p.annotation || p.percent >= 100 || Date.now() - lastUi >= 120) {
        flushProgress(p);
        return;
      }
      pending = p;
      if (timer == null) {
        timer = setTimeout(() => {
          timer = null;
          if (pending) flushProgress(pending);
        }, 120);
      }
    };

    setProgress({
      phase: 'replay',
      current: 0,
      total: 1,
      percent: 0,
      message: 'Replaying LPGN…',
      step: {
        label: 'Replay LPGN',
        current: 0,
        total: 1,
        percent: 0,
      },
    });

    try {
      // Let the 0% label paint before sync replay (usually <100ms).
      await new Promise((r) => setTimeout(r, 0));
      const replay = replayLpgn(trimmed);
      if (ac.signal.aborted) {
        const err = new Error('Annotation aborted');
        err.name = 'AbortError';
        throw err;
      }
      setReport(seedReport(replay));
      annotateStartedAtRef.current = Date.now();
      setClockMs(Date.now());
      flushProgress({
        phase: 'annotate',
        current: 0,
        total: Math.max(1, replay.plies.length),
        percent: 0,
        message: `Replayed ${replay.plies.length} plies — annotating…`,
      });
      await new Promise((r) => setTimeout(r, 0));
      const next = await annotateLpgnReplay(replay, {
        perspective:
          perspective === 'black' ? PlayerColor.Black : PlayerColor.White,
        advisorStrength: strength,
        yieldEvery: 1,
        signal: ac.signal,
        onProgress: (p) => {
          // Always paint step updates — they are already rate-limited in core.
          pushProgress(p, Boolean(p.annotation) || Boolean(p.step));
          if (!p.annotation) return;
          const ann = p.annotation;
          setReport((prev) =>
            prev
              ? { ...prev, annotations: [...prev.annotations, ann] }
              : prev,
          );
        },
      });
      setReport(next);
      flushProgress({
        phase: 'annotate',
        current: next.annotations.length,
        total: Math.max(1, next.annotations.length),
        percent: 100,
        message: 'Done — ready to print.',
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Annotation cancelled — partial report kept below.');
      } else {
        setError(err instanceof Error ? err.message : String(err));
        setReport(null);
      }
    } finally {
      if (timer != null) clearTimeout(timer);
      setRunning(false);
    }
  };

  const printReport = () => {
    window.print();
  };

  const canPrint = Boolean(report && report.annotations.length > 0 && !running);

  return (
    <main className="lpgn-annotate" data-testid="lpgn-annotate-page">
      <header className="lpgn-annotate-chrome">
        <Link to="/">← Home</Link>
        <h1>Annotate match</h1>
        <p>
          Paste an LPGN from Save match log. Grading runs in your browser —
          plies appear as they finish, then print this page for a PDF-style
          report.
        </p>
      </header>

      <section className="lpgn-annotate-setup no-print">
        <label className="lpgn-annotate-field">
          <span>LPGN</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            spellCheck={false}
            placeholder={'[Event "…"]\n…\n1. Pe2e3 …'}
            disabled={running}
          />
        </label>

        <div className="lpgn-annotate-row">
          <label className="lpgn-annotate-field">
            <span>Upload</span>
            <input
              type="file"
              accept=".lpgn,.txt,text/plain"
              disabled={running}
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <label className="lpgn-annotate-field">
            <span>Your seat (graded)</span>
            <select
              value={perspective}
              disabled={running}
              onChange={(e) => setPerspective(e.target.value as PerspectiveId)}
            >
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </label>

          <label className="lpgn-annotate-field">
            <span>Advisor</span>
            <select
              value={strength}
              disabled={running}
              onChange={(e) => setStrength(e.target.value as AiStrengthId)}
            >
              {STRENGTHS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} — {s.note}
                </option>
              ))}
            </select>
          </label>

          <label className="lpgn-annotate-field">
            <span>Diagrams</span>
            <select
              value={diagrams}
              disabled={running}
              onChange={(e) =>
                setDiagrams(e.target.value as 'key' | 'all' | 'none')
              }
            >
              <option value="key">Key positions only</option>
              <option value="all">Every ply (heavy)</option>
              <option value="none">Text only</option>
            </select>
          </label>
        </div>

        <div className="lpgn-annotate-actions">
          {!running ? (
            <button type="button" className="lpgn-annotate-primary" onClick={() => void run()}>
              Annotate in browser
            </button>
          ) : (
            <button type="button" className="lpgn-annotate-ghost" onClick={cancel}>
              Cancel
            </button>
          )}
          {canPrint ? (
            <button type="button" className="lpgn-annotate-primary" onClick={printReport}>
              Print / Save as PDF
            </button>
          ) : null}
        </div>

        {running || progress !== null ? (
          <div className="lpgn-annotate-progress" aria-label="Annotation progress">
            <div
              className="lpgn-annotate-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress?.percent ?? 0}
              aria-label="Overall progress"
            >
              <span style={{ width: `${progress?.percent ?? 0}%` }} />
            </div>
            <p>
              Overall {progress?.percent ?? 0}%
              {progress && progress.total > 0
                ? ` · ${progress.current}/${progress.total} plies`
                : ''}{' '}
              — {progress?.message ?? 'Working…'}
            </p>
            {etaLabel ? (
              <p className="lpgn-annotate-progress-eta">{etaLabel}</p>
            ) : null}
            {progress?.step ? (
              <>
                <div
                  className="lpgn-annotate-progress-track is-step"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress.step.percent}
                  aria-label="Current step progress"
                >
                  <span style={{ width: `${progress.step.percent}%` }} />
                </div>
                <p className="lpgn-annotate-progress-step">
                  This ply: {progress.step.label} — {progress.step.current}/
                  {progress.step.total} ({progress.step.percent}%)
                </p>
              </>
            ) : null}
            {running && strength === 'deep' ? (
              <p className="lpgn-annotate-progress-step">
                Deep runs ~800 simulations on each of your plies — the overall
                bar barely moves until a ply finishes; watch the step bar above.
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="lpgn-annotate-error">{error}</p> : null}
      </section>

      {report ? (
        <section className="lpgn-annotate-report" data-testid="lpgn-annotate-report">
          <header className="lpgn-annotate-report-head">
            <p className="lpgn-annotate-kicker">Subspace Lattice · match report</p>
            <h2>{reportTitle(report)}</h2>
            <p className="lpgn-annotate-meta">
              {report.replay.plies.length} plies · perspective{' '}
              {perspective === 'black' ? 'Black' : 'White'} · advisor {strength}
              {running
                ? ` · live ${report.annotations.length}/${report.replay.plies.length}`
                : ''}
            </p>
            <ul className="lpgn-annotate-summary">
              {report.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {running ? (
              <p className="lpgn-annotate-live no-print" aria-live="polite">
                Streaming text as each ply finishes — board diagrams load when
                grading completes so the tab stays responsive.
              </p>
            ) : null}
          </header>

          {report.annotations.map((ann) => {
            // Defer Board mounts until the run finishes so React paint + MCTS
            // don't stack into a long task (browser "not responding" dialog).
            const showBoard =
              !running &&
              (diagrams === 'all' ||
                (diagrams === 'key' && ann.isKeyDiagram));
            return (
              <PlyBlock
                key={ann.ply}
                report={report}
                ann={ann}
                showBoard={showBoard}
              />
            );
          })}
          <div ref={liveTailRef} className="lpgn-annotate-live-tail" aria-hidden />
        </section>
      ) : null}
    </main>
  );
}
