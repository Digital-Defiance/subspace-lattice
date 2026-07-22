import { describe, expect, it } from 'vitest';
import {
  TEI_AI_ANCHORS,
  getTeiDisplay,
  getTeiGrade,
  getTeiGradeColor,
  getTeiGradeName,
} from './tei-grade';

describe('tei-grade (via warp12-engine)', () => {
  it('maps sigma bands to E/V/C/I/P', () => {
    expect(getTeiGrade(0.3)).toBe('E');
    expect(getTeiGrade(0.5)).toBe('V');
    expect(getTeiGrade(1.5)).toBe('C');
    expect(getTeiGrade(2.5)).toBe('I');
    expect(getTeiGrade(4.0)).toBe('P');
  });

  it('formats AI anchors', () => {
    const cmd = getTeiDisplay(TEI_AI_ANCHORS.commander);
    expect(cmd.formatted).toMatch(/^[EVCIP]\d{1,2}$/);
    expect(getTeiGradeName(cmd.grade)).toBeTruthy();
    expect(getTeiGradeColor(cmd.grade)).toBeTruthy();
  });
});
