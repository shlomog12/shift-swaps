import { describe, expect, it } from 'vitest';
import {
  SLOT_HOURS,
  addDays,
  hasStarted,
  formatDateRange,
  urgencyLabel,
  weekLabel,
  weekStart,
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
  it('keeps a date range in reading order inside Hebrew text', () => {
    expect(formatDateRange('2026-11-26', '2026-12-02')).toBe('\u206626.11\u2060–\u20602.12\u2069');
    expect(formatDateRange('2026-11-26', '2026-12-02', true)).toBe('\u206626.11.2026\u2060–\u20602.12.2026\u2069');
  });
  it('groups nights by week and flags the urgent ones', () => {
    // 10:00 in Israel on Thursday 2026-10-01.
    const now = new Date('2026-10-01T07:00:00Z');
    expect(urgencyLabel('2026-10-02', 1, now)).toBe('הלילה');
    expect(urgencyLabel('2026-10-03', 2, now)).toBe('מחר בלילה');
    expect(urgencyLabel('2026-10-04', 1, now)).toBeNull();
    expect(weekStart('2026-10-01')).toBe('2026-09-27');
    expect(weekStart('2026-09-27')).toBe('2026-09-27');
    expect(weekLabel('2026-09-27', '2026-10-01')).toBe('השבוע');
    expect(weekLabel('2026-10-04', '2026-10-01')).toBe('שבוע הבא');
    expect(weekLabel('2026-10-11', '2026-10-01')).toBe(`שבוע ${formatDateRange('2026-10-11', '2026-10-17')}`);
  });
});
