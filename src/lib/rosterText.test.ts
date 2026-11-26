import { describe, expect, it } from 'vitest';
import { SLOT_HOURS } from './dates';
import { rosterText } from './rosterText';
import type { Shift } from './types';

const shift = (night: string, slot: 1 | 2, assignee: string | null): Shift => ({
  night,
  slot,
  assignee,
  swap_requested: false,
  updated_at: '',
});

describe('rosterText', () => {
  it('lists one line per night in order, with both slots', () => {
    const text = rosterText(
      'שבצ"ק',
      [shift('2026-12-04', 1, 'רונית'), shift('2026-12-03', 2, 'יוסי'), shift('2026-12-03', 1, null)],
      'https://app',
    );
    const lines = text.split('\n');
    expect(lines[0]).toBe('שבצ"ק');
    expect(text).toContain(`\u20663.12\u2069 · בין רביעי לחמישי: ${SLOT_HOURS[1]} פנוי · ${SLOT_HOURS[2]} יוסי`);
    expect(text.indexOf('3.12')).toBeLessThan(text.indexOf('4.12'));
    expect(lines.at(-1)).toBe('https://app');
  });
});
