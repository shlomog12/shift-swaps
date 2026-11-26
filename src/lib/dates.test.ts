import { describe, expect, it } from 'vitest';
import {
  SLOT_HOURS,
  addDays,
  hasStarted,
  monthBounds,
  monthGridBounds,
  nightLabel,
  nightShortLabel,
  shiftMonth,
  slotTime,
} from './dates';

describe('dates', () => {
  it('names both days of a night', () => {
    expect(nightLabel('2026-10-01')).toBe('הלילה שבין רביעי לחמישי');
    expect(nightShortLabel('2026-10-01')).toBe('רביעי ← חמישי');
    expect(slotTime('2026-10-01', 1)).toBe(`חמישי ${SLOT_HOURS[1]}`);
    expect(nightLabel('2026-10-04')).toBe('הלילה שבין שבת לראשון');
  });

  it('handles month arithmetic', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    // November 2026 starts on a Sunday and ends on a Monday.
    expect(monthGridBounds('2026-11')).toEqual({ from: '2026-11-01', to: '2026-12-05' });
    expect(monthGridBounds('2026-10')).toEqual({ from: '2026-09-27', to: '2026-10-31' });
  });

  it('knows when a shift has started, in Israel time', () => {
    // 2026-10-01 00:30 in Israel (UTC+3) is 2026-09-30 21:30 UTC.
    const now = new Date('2026-09-30T21:30:00Z');
    expect(hasStarted('2026-10-01', 1, now)).toBe(true);
    expect(hasStarted('2026-10-01', 2, now)).toBe(false);
    expect(hasStarted('2026-10-02', 1, now)).toBe(false);
  });
});
