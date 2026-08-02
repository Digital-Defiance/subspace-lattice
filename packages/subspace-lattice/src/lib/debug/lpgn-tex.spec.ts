import { describe, expect, it } from 'vitest';
import { formatSummaryItems } from './lpgn-tex';

describe('lpgn-tex', () => {
  it('nests summary child markers instead of double bullets', () => {
    const tex = formatSummaryItems([
      'White advisor (deep): avg 60%',
      'Largest advisor disagreements:',
      '  · ply 1 Pf4f5: eval #33/33 (0%) — advisor tip Infiltrator (8,0) → (5,4)',
      '  · ply 27 Pe5e6: eval #2/33 (40%) — advisor tip Carrier (7,0) → (7,5)',
      'No missed mate-in-1/2 for White under tactical scan.',
      '2 coaching branch point(s):',
      '  · ply 29: Enemy Hub adjacent',
    ]);
    expect(tex).toContain('\\begin{itemize}[leftmargin=1.25em');
    expect(tex).toContain(
      '\\item ply 1 Pf4f5: eval \\#33/33 (0\\%) — advisor tip Infiltrator (8,0) → (5,4)',
    );
    expect(tex).not.toMatch(/\\item\s+·/);
    expect(tex).not.toContain('allowbreak');
  });

  it('escapes # and % without soft-hyphenating phase labels', () => {
    const tex = formatSummaryItems(['opening-screen / Initiative Relay #1 (50%)']);
    expect(tex).toContain('opening-screen / Initiative Relay \\#1 (50\\%)');
    expect(tex).not.toContain('allowbreak');
  });
});
