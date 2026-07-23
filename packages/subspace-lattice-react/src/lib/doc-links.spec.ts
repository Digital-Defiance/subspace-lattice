import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../firebase/platform', () => ({
  isTauriRuntime: vi.fn(() => false),
}));

import { isTauriRuntime } from '../firebase/platform';
import { latticeDocHref, LATTICE_DOCS_ORIGIN } from './doc-links';

describe('latticeDocHref', () => {
  afterEach(() => {
    vi.mocked(isTauriRuntime).mockReturnValue(false);
  });

  it('uses same-origin paths in the browser', () => {
    expect(latticeDocHref('manual')).toBe(
      '/docs/subspace-lattice-manual.pdf',
    );
    expect(latticeDocHref('rules')).toBe('/docs/rules.pdf');
  });

  it('uses the hosted origin inside Tauri', () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    expect(latticeDocHref('rules')).toBe(
      `${LATTICE_DOCS_ORIGIN}/docs/rules.pdf`,
    );
    expect(latticeDocHref('manual')).toBe(
      `${LATTICE_DOCS_ORIGIN}/docs/subspace-lattice-manual.pdf`,
    );
  });
});
