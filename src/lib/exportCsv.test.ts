import { describe, expect, it } from 'vitest';
import { rosterCsv } from './exportCsv';
import { parseSheet } from './importSheet';
import type { Shift } from './types';

const shift = (night: string, slot: 1 | 2, assignee: string | null, planned: string | null = assignee): Shift => ({
  night,
  slot,
  assignee,
  planned_assignee: planned,
  swap_requested: false,
  updated_at: '',
});

describe('roster CSV export', () => {
  const shifts = [
    shift('2026-12-03', 2, 'אבי'),
    shift('2026-12-03', 1, 'דנה', 'רון'),
    shift('2026-12-04', 1, null),
    shift('2026-12-04', 2, 'כהן, משה'),
  ];

  it('writes one row per night with both days named, Excel-friendly', () => {
    const csv = rosterCsv(shifts);
    expect(csv.startsWith('﻿תאריך,לילה,')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines[1]).toBe('3.12.2026,הלילה שבין רביעי לחמישי,דנה,אבי');
    expect(lines[2]).toBe('4.12.2026,הלילה שבין חמישי לשישי,,"כהן, משה"');
  });

  it('can export the original roster', () => {
    expect(rosterCsv(shifts, true).split('\r\n')[1]).toBe('3.12.2026,הלילה שבין רביעי לחמישי,רון,אבי');
  });

  it('goes back through the import unchanged', () => {
    expect(parseSheet(rosterCsv(shifts)).rows).toEqual([
      { night: '2026-12-03', slot1: 'דנה', slot2: 'אבי' },
      { night: '2026-12-04', slot1: null, slot2: 'כהן, משה' },
    ]);
  });
});
