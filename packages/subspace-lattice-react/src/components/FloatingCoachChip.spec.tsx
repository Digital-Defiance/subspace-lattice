import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AdvisorSuggestion } from '@subspace-lattice/core';
import { FloatingCoachChip } from './FloatingCoachChip';

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

const tip: AdvisorSuggestion = {
  pieceId: 'w-e3',
  from: { x: 5, y: 1 },
  to: { x: 5, y: 2 },
  reasons: ['Move Escort.'],
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

describe('FloatingCoachChip', () => {
  it('shows summary and dismisses', () => {
    const onDismiss = vi.fn();
    const el = mount(
      <FloatingCoachChip suggestion={tip} onDismiss={onDismiss} />,
    );
    expect(el.textContent).toMatch(/5,1/);
    act(() => {
      el.querySelector<HTMLButtonElement>(
        '[data-testid="floating-coach-dismiss"]',
      )?.click();
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('hides dismiss while teaching', () => {
    const el = mount(
      <FloatingCoachChip
        suggestion={tip}
        teachingMode
        onDismiss={vi.fn()}
      />,
    );
    expect(el.textContent).toMatch(/Teaching/);
    expect(
      el.querySelector('[data-testid="floating-coach-dismiss"]'),
    ).toBeNull();
  });
});
