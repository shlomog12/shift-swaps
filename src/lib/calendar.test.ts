import { describe, expect, it } from 'vitest';
import { feedUrl, googleCalendarUrl, webcalUrl } from './calendar';
import { myShiftsText } from './rosterText';

describe('sharing my shifts', () => {
  it('builds a Google Calendar link for a shift in Israel time', () => {
    const url = new URL(googleCalendarUrl('2026-12-03', 2, 'https://example.org/app/'));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('dates')).toBe('20261203T030000/20261203T060000');
    expect(url.searchParams.get('ctz')).toBe('Asia/Jerusalem');
    expect(url.searchParams.get('text')).toBe('שמירה 03:00–06:00');
    expect(url.searchParams.get('details')).toContain('הלילה שבין רביעי לחמישי');
  });

  it('lists my shifts with both days of each night', () => {
    const text = myShiftsText('המשמרות שלי', [
      { night: '2026-12-08', slot: 1, assignee: 'דנה', swap_requested: false, updated_at: '' },
      { night: '2026-12-03', slot: 2, assignee: 'דנה', swap_requested: false, updated_at: '' },
    ]);
    const lines = text.split('\n');
    expect(lines[0]).toBe('המשמרות שלי');
    expect(lines[1]).toContain('הלילה שבין רביעי לחמישי');
    expect(lines[2]).toContain('הלילה שבין שני לשלישי');
    expect(text).not.toContain('http');
  });
  it('builds the subscription addresses', () => {
    const feed = feedUrl('https://abc.supabase.co/', 'f'.repeat(64));
    expect(feed).toBe(`https://abc.supabase.co/functions/v1/calendar-feed?token=${'f'.repeat(64)}`);
    expect(webcalUrl(feed).startsWith('webcal://abc.supabase.co/')).toBe(true);
  });
});
