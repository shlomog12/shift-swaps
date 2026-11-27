import { describe, expect, it } from 'vitest';
import { alignedStart, generateContinuation } from './continuation';
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

  it('leaves a leaver\'s shifts open, or spreads them without doubling a night', () => {
    const open = generateContinuation(source(), { ...base, changes: [{ kind: 'remove', name: 'רון', spread: false }] });
    expect(open.filter((r) => r.slot1 === null || r.slot2 === null)).toHaveLength(5);

    const spread = generateContinuation(source(), { ...base, changes: [{ kind: 'remove', name: 'רון', spread: true }] });
    expect(count(spread, 'רון')).toBe(0);
    expect(spread.every((r) => r.slot1 && r.slot2 && r.slot1 !== r.slot2)).toBe(true);
    // רון always shared his nights with מיכל, so his shifts go to אבי and דנה, evenly.
    expect(count(spread, 'מיכל')).toBe(5);
    expect(count(spread, 'אבי') + count(spread, 'דנה')).toBe(15);
    expect(Math.abs(count(spread, 'אבי') - count(spread, 'דנה'))).toBeLessThanOrEqual(1);
  });

  it('gives a newcomer a fair share, spread out', () => {
    const rows = generateContinuation(source(), { ...base, changes: [{ kind: 'add', name: 'שירה' }] });
    expect(count(rows, 'שירה')).toBe(4); // 20 shifts / 5 people
    const counts = ['אבי', 'דנה', 'רון', 'מיכל', 'שירה'].map((n) => count(rows, n));
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(rows.every((r) => r.slot1 !== r.slot2)).toBe(true);
    const nights = rows.filter((r) => r.slot1 === 'שירה' || r.slot2 === 'שירה').map((r) => r.night);
    expect(new Set(nights).size).toBe(4);
  });
});
