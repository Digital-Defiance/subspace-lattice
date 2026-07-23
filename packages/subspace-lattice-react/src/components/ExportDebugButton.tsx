import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { downloadDebugExport } from '../lib/debug-export';
import type { LatticeDebugExport } from '@subspace-lattice/core';

export interface DebugExportControls {
  busy: boolean;
  status: string | null;
  exportDebug: () => Promise<void>;
}

/** Shared download + status for match debug JSON. */
export function useDebugExport(
  buildPayload: () => LatticeDebugExport | null,
): DebugExportControls {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const exportDebug = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const payload = buildPayload();
      if (!payload) {
        setStatus('Nothing to export yet.');
        return;
      }
      const result = await downloadDebugExport(payload);
      if (result === 'copied') {
        setStatus('Debug log copied to clipboard');
      } else if (result === 'shared') {
        setStatus('Debug log ready in the share sheet');
      } else if (result === 'cancelled') {
        setStatus(null);
      } else {
        setStatus('Debug log downloaded');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setStatus(
        err instanceof Error ? err.message : 'Could not export the debug log',
      );
    } finally {
      setBusy(false);
    }
  }, [buildPayload, busy]);

  useEffect(() => {
    if (!status) return;
    const t = window.setTimeout(() => setStatus(null), 4000);
    return () => window.clearTimeout(t);
  }, [status]);

  return { busy, status, exportDebug };
}

export interface ExportDebugButtonProps {
  /** Build the payload at click time (reads latest refs / state). */
  buildPayload: () => LatticeDebugExport | null;
  disabled?: boolean;
  className?: string;
}

/**
 * Visible diagnostics control (kept for tests / explicit surfaces).
 * In-match UI prefers {@link MatchTitleDebugExport}.
 */
export function ExportDebugButton({
  buildPayload,
  disabled = false,
  className = 'rules-btn',
}: ExportDebugButtonProps) {
  const { busy, status, exportDebug } = useDebugExport(buildPayload);

  return (
    <span className="export-debug-wrap">
      <button
        type="button"
        className={className}
        disabled={disabled || busy}
        onClick={() => void exportDebug()}
        data-testid="export-debug-log"
        title="Download a JSON snapshot of this match for bug reports"
      >
        {busy ? 'Exporting…' : 'Export debug log'}
      </button>
      {status && (
        <span className="export-debug-status" role="status">
          {status}
        </span>
      )}
    </span>
  );
}

export interface MatchTitleDebugExportProps {
  buildPayload: () => LatticeDebugExport | null;
  children: ReactNode;
}

/**
 * Match title that exports a debug log on triple-click (hidden diagnostics).
 */
export function MatchTitleDebugExport({
  buildPayload,
  children,
}: MatchTitleDebugExportProps) {
  const { busy, status, exportDebug } = useDebugExport(buildPayload);

  const onTitleClick = (event: MouseEvent<HTMLHeadingElement>) => {
    if (event.detail !== 3 || busy) return;
    window.getSelection()?.removeAllRanges();
    void exportDebug();
  };

  return (
    <div className="match-title-debug">
      <h2
        className="match-title-debug__title"
        onClick={onTitleClick}
        title="Triple-click to export a debug log"
        data-testid="export-debug-log"
        data-busy={busy ? 'true' : undefined}
      >
        {children}
      </h2>
      {status && (
        <span className="export-debug-status" role="status">
          {status}
        </span>
      )}
    </div>
  );
}
