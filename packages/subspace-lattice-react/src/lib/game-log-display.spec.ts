import { describe, expect, it } from 'vitest';
import {
  splitBodyByNames,
  splitGameLogLine,
} from './game-log-display';

describe('game-log-display', () => {
  it('splits timestamp and body', () => {
    const { timestamp, body } = splitGameLogLine(
      '[3:14:15 PM] White moved w-e3 → (5,2)',
    );
    expect(timestamp).toBe('3:14:15 PM');
    expect(body).toContain('White moved');
  });

  it('highlights TEI and coordinates', () => {
    const segments = splitBodyByNames(
      'Black C51 moved b-e3 → (5,8)',
      [{ name: 'Black', color: '#888' }],
    );
    const tei = segments.find((s) => s.tei);
    expect(tei?.tei).toEqual({ grade: 'C', score: '51', reference: false });
    const coord = segments.find((s) => s.coordinate);
    expect(coord?.coordinate).toEqual({
      left: '5',
      right: '8',
      separator: ',',
    });
    expect(segments.some((s) => s.color === '#888')).toBe(true);
  });

  it('parses ref TEI tokens', () => {
    const segments = splitBodyByNames('anchor ref V46 vs field');
    const tei = segments.find((s) => s.tei);
    expect(tei?.tei?.reference).toBe(true);
    expect(tei?.tei?.grade).toBe('V');
  });
});
