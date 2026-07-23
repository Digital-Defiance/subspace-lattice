import type { MouseEvent, ReactNode } from 'react';
import {
  latticeDocHref,
  openLatticeDocUrl,
  type LatticeDocId,
} from '../lib/doc-links';
import { isTauriRuntime } from '../firebase/platform';

export type DocLinkProps = {
  doc: LatticeDocId;
  children: ReactNode;
  className?: string;
};

/**
 * Link to the introductory manual or official rules PDF.
 * On Tauri, opens the hosted PDF with the system viewer/browser (fixes macOS
 * WKWebView blank `target="_blank"` on bundled asset paths).
 */
export function DocLink({ doc, children, className }: DocLinkProps) {
  const href = latticeDocHref(doc);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isTauriRuntime()) {
      return;
    }
    event.preventDefault();
    void openLatticeDocUrl(href).catch(() => {
      window.open(href, '_blank', 'noopener,noreferrer');
    });
  };

  return (
    <a
      href={href}
      className={className}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
    >
      {children}
    </a>
  );
}
