import { describe, expect, it } from 'vitest';
import { fairnessReport, openSoon } from './fairness';
import type { Shift } from './types';

const s = (night: string, slot: 1 | 2, assignee: string | null): Shift => ({
  night,
  slot,
  assignee,
  swap_requested: false,
  updated_at: '',
});

describe('fairness report', () => {
  it('counts shifts per person, most first, with empty names at zero', () => {
    const report = fairnessReport(
      [s('2026-12-01', 1, 'דנה'), s('2026-12-01', 2, 'אבי'), s('2026-12-02', 2, 'דנה'), s('2026-12-03', 1, null)],
      ['רון', 'דנה'],
    );
    expect(report.rows).toEqual([
      { name: 'דנה', total: 2, first: 1, second: 1 },
      { name: 'אבי', total: 1, first: 0, second: 1 },
      { name: 'רון', total: 0, first: 0, second: 0 },
    ]);
    expect(report.average).toBe(1);
    expect(report.open).toBe(1);
  });

  it('finds open shifts in the coming week', () => {
    const now = new Date('2026-12-01T07:00:00Z'); // 09:00 in Israel
    const shifts = [
      s('2026-12-01', 1, null), // started
      s('2026-12-02', 1, null),
      s('2026-12-08', 2, null),
      s('2026-12-09', 1, null), // beyond a week
      s('2026-12-03', 1, 'דנה'),
    ];
    expect(openSoon(shifts, '2026-12-01', 7, now).map((x) => x.night)).toEqual(['2026-12-02', '2026-12-08']);
  });
});
