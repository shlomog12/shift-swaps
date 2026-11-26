import { describe, expect, it } from 'vitest';
import { addDays, hasStarted, monthBounds, nightLabel, shiftMonth } from './dates';

describe('dates', () => {
  it('labels nights like the old sheet', () => {
    expect(nightLabel('2026-10-01')).toBe('ליל חמישי – רביעי בלילה');
    expect(nightLabel('2026-10-04')).toBe('ליל ראשון – שבת בלילה');
  });

  it('handles month arithmetic', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('knows when a shift has started, in Israel time', () => {
    // 2026-10-01 00:30 in Israel (UTC+3) is 2026-09-30 21:30 UTC.
    const now = new Date('2026-09-30T21:30:00Z');
    expect(hasStarted('2026-10-01', 1, now)).toBe(true);
    expect(hasStarted('2026-10-01', 2, now)).toBe(false);
    expect(hasStarted('2026-10-02', 1, now)).toBe(false);
  });
});
