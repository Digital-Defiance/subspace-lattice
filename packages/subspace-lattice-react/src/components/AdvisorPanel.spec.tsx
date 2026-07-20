import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AdvisorSuggestion } from '@subspace-lattice/core';
import { AdvisorPanel } from './AdvisorPanel';

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

const tip: AdvisorSuggestion = {
  pieceId: 'w-e3',
  from: { x: 5, y: 1 },
  to: { x: 5, y: 2 },
  reasons: ['Move Escort.', 'Closes distance on the enemy Command Hub.'],
  strength: 'fast',
  summary: 'Escort (5,1) → (5,2)',
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(node: React.ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(node);
  });
  return host;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
});

describe('AdvisorPanel', () => {
  it('renders Ask / Teaching and suggestion lines', () => {
    const onAsk = vi.fn();
    const onToggle = vi.fn();
    const el = mount(
      <AdvisorPanel
        suggestion={tip}
        teachingMode={false}
        assisted
        canAsk
        onAsk={onAsk}
        onClear={vi.fn()}
        onToggleTeaching={onToggle}
      />,
    );

    expect(el.querySelector('[data-testid="advisor-assisted"]')).toBeTruthy();
    expect(
      el.querySelector('[data-testid="advisor-suggestion"]')?.textContent,
    ).toMatch(/5,1/);
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-testid="advisor-ask"]')?.click();
      el.querySelector<HTMLButtonElement>(
        '[data-testid="advisor-teach"]',
      )?.click();
    });
    expect(onAsk).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('shows consent dialog actions', () => {
    const onYes = vi.fn();
    const onNo = vi.fn();
    const el = mount(
      <AdvisorPanel
        suggestion={null}
        teachingMode={false}
        assisted={false}
        canAsk
        onAsk={vi.fn()}
        onClear={vi.fn()}
        onToggleTeaching={vi.fn()}
        consentOpen
        onConfirmConsent={onYes}
        onDeclineConsent={onNo}
      />,
    );
    act(() => {
      el.querySelector<HTMLButtonElement>(
        '[data-testid="advisor-consent-yes"]',
      )?.click();
      el.querySelector<HTMLButtonElement>(
        '[data-testid="advisor-consent-no"]',
      )?.click();
    });
    expect(onYes).toHaveBeenCalledOnce();
    expect(onNo).toHaveBeenCalledOnce();
  });

  it('shows rated suppressed unlock CTA', () => {
    const onUnlock = vi.fn();
    const el = mount(
      <AdvisorPanel
        suggestion={null}
        teachingMode={false}
        assisted={false}
        canAsk={false}
        suppressed
        onAsk={vi.fn()}
        onClear={vi.fn()}
        onToggleTeaching={vi.fn()}
        onMakeCasual={onUnlock}
      />,
    );
    expect(el.querySelector('[data-testid="advisor-suppressed"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="advisor-ask"]')).toBeNull();
    act(() => {
      el.querySelector<HTMLButtonElement>(
        '[data-testid="advisor-make-casual"]',
      )?.click();
    });
    expect(onUnlock).toHaveBeenCalledOnce();
  });
});
