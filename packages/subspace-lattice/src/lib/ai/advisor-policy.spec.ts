import { describe, expect, it } from 'vitest';
import {
  advisorRequiresUnrateConsent,
  isAdvisorAvailable,
  isRoomRated,
  shouldRecordOnlineTei,
} from './advisor-policy';

describe('advisor-policy', () => {
  it('treats rated+unassisted as advisor-suppressed', () => {
    expect(isRoomRated({ rated: true, assisted: false })).toBe(true);
    expect(isAdvisorAvailable({ rated: true, assisted: false })).toBe(false);
  });

  it('unlocks advisor once assisted (casual)', () => {
    expect(isRoomRated({ rated: true, assisted: true })).toBe(false);
    expect(isAdvisorAvailable({ rated: true, assisted: true })).toBe(true);
  });

  it('allows advisor on casual rooms', () => {
    expect(isAdvisorAvailable({ rated: false })).toBe(true);
    expect(isAdvisorAvailable({})).toBe(true);
  });

  it('requires unrate consent only for rated unassisted rooms', () => {
    expect(
      advisorRequiresUnrateConsent({ rated: true, assisted: false }, false),
    ).toBe(true);
    expect(
      advisorRequiresUnrateConsent({ rated: true, assisted: true }, false),
    ).toBe(false);
    expect(advisorRequiresUnrateConsent({ rated: false }, false)).toBe(false);
    expect(advisorRequiresUnrateConsent(null, false)).toBe(true);
    expect(advisorRequiresUnrateConsent(null, true)).toBe(false);
  });

  it('records online TEI only for rated unassisted rooms', () => {
    expect(shouldRecordOnlineTei({ rated: true, assisted: false })).toBe(true);
    expect(shouldRecordOnlineTei({ rated: true, assisted: true })).toBe(false);
    expect(shouldRecordOnlineTei({ rated: false })).toBe(false);
  });
});
