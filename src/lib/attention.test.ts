import { describe, expect, it } from 'vitest';
import { awaitingMyDecision, nextShift } from './attention';
import { daysBetween, startsInLabel } from './dates';
import type { Shift, SwapOffer } from './types';

const shift = (night: string, slot: 1 | 2, assignee: string | null, swap = false): Shift => ({
  night,
  slot,
  assignee,
  swap_requested: swap,
  updated_at: '',
});

const offer = (night: string, slot: 1 | 2, volunteer: string, status: SwapOffer['status'] = 'pending'): SwapOffer => ({
  id: Math.random(),
  night,
  slot,
  requester: 'דנה',
  volunteer_id: volunteer,
  volunteer,
  status,
  created_at: '',
  decided_at: null,
});

const isDana = (name: string | null) => name === 'דנה';
// 10:00 in Israel on 2026-10-01.
const now = new Date('2026-10-01T07:00:00Z');

describe('attention', () => {
  it('lists my swap requests that have pending volunteers', () => {
    const shifts = [
      shift('2026-10-03', 1, 'דנה', true),
      shift('2026-10-04', 2, 'דנה', true),
      shift('2026-10-05', 1, 'יוסי', true),
      shift('2026-09-30', 1, 'דנה', true),
    ];
    const offers = [
      offer('2026-10-03', 1, 'אבי'),
      offer('2026-10-03', 1, 'רון'),
      offer('2026-10-04', 2, 'אבי', 'declined'),
      offer('2026-10-05', 1, 'אבי'),
      offer('2026-09-30', 1, 'אבי'),
    ];
    expect(awaitingMyDecision(shifts, offers, isDana, now)).toEqual([
      { shift: shifts[0], volunteers: ['אבי', 'רון'] },
    ]);
  });

  it('finds my next shift that has not started', () => {
    const shifts = [shift('2026-10-01', 1, 'דנה'), shift('2026-10-02', 1, 'יוסי'), shift('2026-10-03', 2, 'דנה')];
    expect(nextShift(shifts, isDana, now)).toBe(shifts[2]);
    expect(nextShift([], isDana, now)).toBeUndefined();
  });

  it('says how soon a shift starts', () => {
    expect(daysBetween('2026-09-30', '2026-10-02')).toBe(2);
    expect(startsInLabel('2026-10-02', 1, now)).toBe('הלילה');
    expect(startsInLabel('2026-10-03', 1, now)).toBe('מחר בלילה');
    expect(startsInLabel('2026-10-08', 2, now)).toBe('בעוד 7 ימים');
  });
});
