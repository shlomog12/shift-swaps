import { describe, expect, it } from 'vitest';
import { buildIcs, israelToUtc } from './ics.ts';

const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('calendar feed', () => {
  it('converts Israel wall-clock time to UTC in winter and summer', () => {
    expect(israelToUtc('2026-12-03', 0).toISOString()).toBe('2026-12-02T22:00:00.000Z'); // UTC+2
    expect(israelToUtc('2026-07-02', 3).toISOString()).toBe('2026-07-02T00:00:00.000Z'); // UTC+3
  });

  it('builds one event per shift with both days of the night', () => {
    const ics = buildIcs(
      'דנה',
      [
        { night: '2026-12-03', slot: 1, swap_requested: false, updated_at: '2026-11-20T10:00:00Z' },
        { night: '2026-12-03', slot: 2, swap_requested: true, updated_at: '2026-11-20T10:00:00Z' },
      ],
      'https://example.org/app/',
      new Date('2026-11-26T12:00:00Z'),
    );
    const text = unfold(ics);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(text).toContain('UID:2026-12-03-1@shift-swaps');
    expect(text).toContain('DTSTART:20261202T220000Z');
    expect(text).toContain('DTEND:20261203T010000Z');
    expect(text).toContain('DTSTART:20261203T010000Z');
    expect(text).toContain('SUMMARY:שמירה 03:00–06:00 · בקשת חילוף');
    expect(text).toContain('הלילה שבין רביעי לחמישי\\, 00:00–03:00.');
    expect(text).toContain('X-WR-CALNAME:שמירות – דנה');
  });

  it('folds long lines at 75 octets without splitting characters', () => {
    const ics = buildIcs('שם ארוך מאוד '.repeat(10), [], '');
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(unfold(ics)).toContain('שם ארוך מאוד '.repeat(10).trim());
  });
  it('escapes commas, semicolons and backslashes in text', () => {
    const text = unfold(buildIcs('א;ב,ג\\ד', [], ''));
    expect(text).toContain('X-WR-CALNAME:שמירות – א\\;ב\\,ג\\\\ד');
  });
});
