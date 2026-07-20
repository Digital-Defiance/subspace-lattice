import { describe, expect, it } from 'vitest';
import {
  coachIndicatorForSeat,
  COACH_FLASH_MS,
  type CoachPresence,
} from './coach-presence';

describe('coachIndicatorForSeat', () => {
  it('is idle with no presence', () => {
    expect(coachIndicatorForSeat(undefined)).toEqual({
      flash: false,
      usedThisMatch: false,
    });
  });

  it('flashes within the Warp window and marks usedThisMatch', () => {
    const now = Date.parse('2026-07-22T00:00:00.000Z');
    const presence: CoachPresence = {
      coachRequestedAt: new Date(now - 1_000).toISOString(),
      coachUsedThisMatch: true,
      plyCount: 3,
    };
    expect(coachIndicatorForSeat(presence, now)).toEqual({
      flash: true,
      usedThisMatch: true,
    });
  });

  it('stops flashing after COACH_FLASH_MS but keeps usedThisMatch', () => {
    const now = Date.parse('2026-07-22T00:00:00.000Z');
    const presence: CoachPresence = {
      coachRequestedAt: new Date(now - COACH_FLASH_MS - 1).toISOString(),
      coachUsedThisMatch: true,
    };
    expect(coachIndicatorForSeat(presence, now)).toEqual({
      flash: false,
      usedThisMatch: true,
    });
  });
});
