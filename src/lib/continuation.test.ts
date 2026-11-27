import { describe, expect, it } from 'vitest';
import { addMonths, alignedStart, defaultContinuationRange, generateContinuation } from './continuation';
import { addDays } from './dates';
import type { Shift } from './types';

const shift = (night: string, slot: 1 | 2, planned: string | null, actual: string | null = planned): Shift => ({
  night,
  slot,
  assignee: actual,
  planned_assignee: planned,
  swap_requested: false,
  updated_at: '',
});

/** Ten nights, four people taking turns, from 1.12.2026 (a Tuesday). */
function source(): Shift[] {
  const people = ['אבי', 'דנה', 'רון', 'מיכל'];
  const out: Shift[] = [];
  for (let i = 0; i < 10; i++) {
    const night = addDays('2026-12-01', i);
    out.push(shift(night, 1, people[(i * 2) % 4]), shift(night, 2, people[(i * 2 + 1) % 4]));
  }
  return out;
}

const base = { from: '2026-12-01', to: '2026-12-10', start: '2026-12-11', swapSlots: false, changes: [] };
const count = (rows: ReturnType<typeof generateContinuation>, name: string) =>
  rows.reduce((n, r) => n + (r.slot1 === name ? 1 : 0) + (r.slot2 === name ? 1 : 0), 0);

describe('next roster', () => {
  it('continues in the same order from the original, not from swaps', () => {
    const shifts = source();
    shifts[0] = shift('2026-12-01', 1, 'אבי', 'רון'); // swapped since: the original still says אבי
    const rows = generateContinuation(shifts, base);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toEqual({ night: '2026-12-11', slot1: 'אבי', slot2: 'דנה' });
    expect(rows[9].night).toBe('2026-12-20');
  });

  it('swaps the first and second shifts', () => {
    const rows = generateContinuation(source(), { ...base, swapSlots: true });
    expect(rows[0]).toEqual({ night: '2026-12-11', slot1: 'דנה', slot2: 'אבי' });
  });

  it('keeps the weekday when asked', () => {
    expect(alignedStart('2026-12-11', '2026-12-01')).toBe('2026-12-15'); // Friday → the next Tuesday
    expect(alignedStart('2026-12-15', '2026-12-01')).toBe('2026-12-15');
  });

  it('replaces a person', () => {
    const rows = generateContinuation(source(), { ...base, changes: [{ kind: 'replace', from: 'רון', to: 'שירה' }] });
    expect(count(rows, 'רון')).toBe(0);
    expect(count(rows, 'שירה')).toBe(5);
  });

  it('leaves a leaver\'s shifts open for the admin to fill', () => {
    const rows = generateContinuation(source(), { ...base, changes: [{ kind: 'remove', name: 'רון' }] });
    expect(count(rows, 'רון')).toBe(0);
    expect(rows.filter((r) => r.slot1 === null || r.slot2 === null)).toHaveLength(5);
    expect(count(rows, 'אבי')).toBe(5); // nobody else gets them automatically
  });
});

describe('defaultContinuationRange', () => {
  it('starts at the first empty night and runs three months, from a same-weekday source', () => {
    const shifts = [
      shift('2026-12-01', 1, 'אבי'),
      shift('2026-12-01', 2, 'דנה'),
      shift('2026-12-02', 1, null), // one open shift: the night is still built
      shift('2026-12-02', 2, 'רון'),
      shift('2026-12-03', 1, null),
      shift('2026-12-03', 2, null), // nobody on it: not built yet
    ];
    const r = defaultContinuationRange(shifts, '2026-12-01')!;
    expect(r.start).toBe('2026-12-03');
    expect(r.end).toBe('2027-03-02');
    expect(r.to).toBe(addDays(r.from, 90 - 1));
    expect(alignedStart(r.start, r.from)).toBe(r.start);
    expect(r.to < r.start).toBe(true);
  });

  it('is null with no roster', () => {
    expect(defaultContinuationRange([], '2026-12-01')).toBeNull();
  });
});

describe('addMonths', () => {
  it('keeps the day, or the last day of a shorter month', () => {
    expect(addMonths('2026-12-03', 3)).toBe('2027-03-03');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });
});
