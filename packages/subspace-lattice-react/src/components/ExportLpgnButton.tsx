import { useCallback, useEffect, useState } from 'react';
import type { LatticeDebugExport, RulesConfig } from '@subspace-lattice/core';
import { downloadLpgnExport } from '../lib/lpgn-export';

export interface ExportLpgnButtonProps {
  buildPayload: () => LatticeDebugExport | null;
  /** Rules used for LPGN headers (sector clock, EMP knobs, …). */
  getRules: () => RulesConfig | null;
  className?: string;
}

/**
 * Post-match LPGN save/share — works via download, OS share sheet, or clipboard
 * (`deliverBlob`) on web, Tauri desktop, and mobile.
 */
export function ExportLpgnButton({
  buildPayload,
  getRules,
  className = 'rules-btn',
}: ExportLpgnButtonProps) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const exportLpgn = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const payload = buildPayload();
      const rules = getRules();
      if (!payload || !rules) {
        setStatus('Nothing to export yet.');
        return;
      }
      const result = await downloadLpgnExport(payload, rules);
      if (result === 'copied') {
        setStatus('Match log copied to clipboard');
      } else if (result === 'shared') {
        setStatus('Match log ready in the share sheet');
      } else if (result === 'cancelled') {
        setStatus(null);
      } else {
        setStatus('Match log saved');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setStatus(
        err instanceof Error ? err.message : 'Could not export the match log',
      );
    } finally {
      setBusy(false);
    }
  }, [buildPayload, busy, getRules]);

  useEffect(() => {
    if (!status) return;
    const t = window.setTimeout(() => setStatus(null), 4000);
    return () => window.clearTimeout(t);
  }, [status]);

  return (
    <span className="export-debug-wrap">
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={() => void exportLpgn()}
        data-testid="export-lpgn"
        title="Save or share this match as LPGN (plain-text game notation)"
      >
        {busy ? 'Exporting…' : 'Save match log'}
      </button>
      {status && (
        <span className="export-debug-status" role="status">
          {status}
        </span>
      )}
    </span>
  );
}
