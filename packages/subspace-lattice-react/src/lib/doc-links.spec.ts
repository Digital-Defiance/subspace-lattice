import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../firebase/platform', () => ({
  isTauriRuntime: vi.fn(() => false),
}));

import { isTauriRuntime } from '../firebase/platform';
import {
  latticeDocHref,
  LATTICE_DOCS_ORIGIN,
  LATTICE_HANDBOOK_ORIGIN,
} from './doc-links';

describe('latticeDocHref', () => {
  afterEach(() => {
    vi.mocked(isTauriRuntime).mockReturnValue(false);
  });

  it('uses same-origin paths in the browser', () => {
    expect(latticeDocHref('manual')).toBe(
      '/docs/subspace-lattice-manual.pdf',
    );
    expect(latticeDocHref('rules')).toBe('/docs/rules.pdf');
    expect(latticeDocHref('advanced')).toBe('/docs/advanced-manual.pdf');
    expect(latticeDocHref('story')).toBe('/docs/story.md');
    expect(latticeDocHref('storyPdf')).toBe('/docs/story.pdf');
    expect(latticeDocHref('overview')).toBe('/docs/player-overview.md');
    expect(latticeDocHref('handbook')).toBe(LATTICE_HANDBOOK_ORIGIN);
  });

  it('uses the hosted origin inside Tauri for site docs', () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    expect(latticeDocHref('rules')).toBe(
      `${LATTICE_DOCS_ORIGIN}/docs/rules.pdf`,
    );
    expect(latticeDocHref('manual')).toBe(
      `${LATTICE_DOCS_ORIGIN}/docs/subspace-lattice-manual.pdf`,
    );
    expect(latticeDocHref('advanced')).toBe(
      `${LATTICE_DOCS_ORIGIN}/docs/advanced-manual.pdf`,
    );
    expect(latticeDocHref('story')).toBe(
      `${LATTICE_DOCS_ORIGIN}/docs/story.md`,
    );
    expect(latticeDocHref('storyPdf')).toBe(
      `${LATTICE_DOCS_ORIGIN}/docs/story.pdf`,
    );
    expect(latticeDocHref('overview')).toBe(
      `${LATTICE_DOCS_ORIGIN}/docs/player-overview.md`,
    );
    expect(latticeDocHref('handbook')).toBe(LATTICE_HANDBOOK_ORIGIN);
  });
});
