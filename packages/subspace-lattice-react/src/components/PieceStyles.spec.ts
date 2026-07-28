import { describe, expect, it } from 'vitest';
import { resolveStyleRimFlags } from './PieceStyles';

describe('resolveStyleRimFlags', () => {
  it('honors independent needsOutlineBlack / needsOutlineWhite', () => {
    expect(
      resolveStyleRimFlags({
        needsOutlineBlack: true,
        needsOutlineWhite: false,
      }),
    ).toEqual({ lightRimOnBlack: false, lightRimOnWhite: true });

    expect(
      resolveStyleRimFlags({
        needsOutlineBlack: false,
        needsOutlineWhite: true,
      }),
    ).toEqual({ lightRimOnBlack: true, lightRimOnWhite: false });
  });

  it('lets needsOutline* override hasOutline for one side', () => {
    expect(
      resolveStyleRimFlags({
        hasOutline: true,
        needsOutlineBlack: true,
      }),
    ).toEqual({ lightRimOnBlack: false, lightRimOnWhite: true });
  });

  it('keeps legacy hasLightRim / hasLightRimWhite', () => {
    expect(
      resolveStyleRimFlags({
        hasLightRim: false,
        hasLightRimWhite: true,
      }),
    ).toEqual({ lightRimOnBlack: false, lightRimOnWhite: true });
  });

  it('falls back to SVG light-stroke detection', () => {
    expect(
      resolveStyleRimFlags(
        undefined,
        '<path style="stroke: #fff" />',
        '<path style="stroke: #000" />',
      ),
    ).toEqual({ lightRimOnBlack: true, lightRimOnWhite: false });
  });
});
