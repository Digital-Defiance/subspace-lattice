import React, { useEffect, useState } from 'react';

export interface ArmedConfirmButtonProps {
  label: string;
  /** Shown after the first click; second click fires `onConfirm`. */
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
  /** Optional test id for the button. */
  'data-testid'?: string;
  /** How long the armed state lasts before resetting (ms). */
  armMs?: number;
}

/**
 * Two-click confirm for destructive actions.
 *
 * Prefer this over `window.confirm()` — Tauri v2 WKWebView on macOS/iOS
 * never shows JS dialogs and `confirm()` always returns false.
 */
export const ArmedConfirmButton: React.FC<ArmedConfirmButtonProps> = ({
  label,
  confirmLabel,
  onConfirm,
  className,
  'data-testid': testId,
  armMs = 4000,
}) => {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), armMs);
    return () => window.clearTimeout(timer);
  }, [armed, armMs]);

  return (
    <button
      type="button"
      className={className}
      data-testid={testId}
      data-armed={armed ? 'true' : 'false'}
      aria-pressed={armed}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
};
