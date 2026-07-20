import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SubspaceLatticeEngine } from '@subspace-lattice/core';
import { useAdvisor } from './useAdvisor';

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function renderHook<T>(fn: () => T): { result: { current: T }; rerender: () => void } {
  let current!: T;
  function Probe() {
    current = fn();
    return null;
  }
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<Probe />);
  });
  return {
    result: {
      get current() {
        return current;
      },
    },
    rerender: () => {
      act(() => {
        root!.render(<Probe />);
      });
    },
  };
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
});

describe('useAdvisor', () => {
  it('asks for consent before the first suggestion when required', () => {
    const engine = new SubspaceLatticeEngine({ rulesVersion: 'hybrid-fleet' });
    const { result } = renderHook(() => useAdvisor('fast'));

    act(() => {
      result.current.askAdvisor(engine, { requireConsent: true });
    });
    expect(result.current.consentOpen).toBe(true);
    expect(result.current.suggestion).toBeNull();
    expect(result.current.assisted).toBe(false);

    act(() => {
      result.current.confirmConsent(engine);
    });
    expect(result.current.consentOpen).toBe(false);
    expect(result.current.assisted).toBe(true);
    expect(result.current.suggestion).not.toBeNull();
    expect(result.current.guidance?.advisorFrom).toEqual(
      result.current.suggestion?.from,
    );
    expect(result.current.guidance?.advisorTo).toEqual(
      result.current.suggestion?.to,
    );
  });

  it('declining consent does not mark assisted', () => {
    const engine = new SubspaceLatticeEngine({ rulesVersion: 'hybrid-fleet' });
    const { result } = renderHook(() => useAdvisor('fast'));

    act(() => {
      result.current.askAdvisor(engine, { requireConsent: true });
      result.current.declineConsent();
    });
    expect(result.current.consentOpen).toBe(false);
    expect(result.current.assisted).toBe(false);
    expect(result.current.suggestion).toBeNull();
  });

  it('teaching mode refreshes suggestions and clears on disable', () => {
    const engine = new SubspaceLatticeEngine({ rulesVersion: 'hybrid-fleet' });
    const { result } = renderHook(() => useAdvisor('fast'));

    act(() => {
      result.current.enableTeaching(engine);
    });
    expect(result.current.teachingMode).toBe(true);
    expect(result.current.assisted).toBe(true);
    expect(result.current.suggestion).not.toBeNull();

    act(() => {
      result.current.refreshIfTeaching(engine);
    });
    expect(result.current.suggestion).not.toBeNull();

    act(() => {
      result.current.disableTeaching();
    });
    expect(result.current.teachingMode).toBe(false);
    expect(result.current.suggestion).toBeNull();
  });
});
