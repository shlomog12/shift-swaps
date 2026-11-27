import { describe, expect, it } from 'vitest';
import { gematria, hebrewDate, hebrewDay, hebrewMonthsBetween, holidayOn } from './hebrewDate';

describe('Hebrew dates', () => {
  it('writes numbers in Hebrew letters', () => {
    expect(gematria(5)).toBe('ה׳');
    expect(gematria(15)).toBe('ט״ו');
    expect(gematria(16)).toBe('ט״ז');
    expect(gematria(25)).toBe('כ״ה');
    expect(gematria(30)).toBe('ל׳');
    expect(gematria(5787)).toBe('תשפ״ז');
  });

  it('formats the date', () => {
    expect(hebrewDate('2026-12-05')).toBe('כ״ה בכסלו תשפ״ז');
    expect(hebrewDay('2026-09-12')).toBe('א׳');
    expect(hebrewMonthsBetween('2026-11-01', '2026-11-30')).toBe('חשוון–כסלו תשפ״ז');
  });
});

describe('holidays', () => {
  const name = (iso: string) => holidayOn(iso)?.name ?? null;

  it('finds the fixed holidays', () => {
    expect(holidayOn('2026-09-12')).toEqual({ name: 'ראש השנה', major: true });
    expect(name('2026-09-21')).toBe('יום כיפור');
    expect(name('2026-09-26')).toBe('סוכות');
    expect(name('2026-09-28')).toBe('חול המועד סוכות');
    expect(name('2026-10-03')).toBe('שמיני עצרת · שמחת תורה');
    expect(name('2027-04-22')).toBe('פסח');
    expect(name('2027-03-23')).toBe('פורים'); // 14 Adar II in a leap year
    expect(name('2026-03-03')).toBe('פורים'); // 14 Adar in a regular year
    expect(name('2026-11-20')).toBeNull();
  });

  it('counts the eight days of Hanukkah into Tevet', () => {
    expect(name('2026-12-05')).toBe('חנוכה · נר א׳');
    expect(name('2026-12-12')).toBe('חנוכה · נר ח׳');
    expect(name('2026-12-13')).toBeNull();
  });

  it('moves days that may not fall on certain weekdays', () => {
    // 2025: 5 Iyar was Shabbat, so Independence Day moved to Thursday 1 May and Memorial Day to 30 April.
    expect(name('2025-05-01')).toBe('יום העצמאות');
    expect(name('2025-04-30')).toBe('יום הזיכרון');
    expect(name('2025-05-03')).toBeNull();
    // 2026: 5 Iyar on a Wednesday stays.
    expect(name('2026-04-22')).toBe('יום העצמאות');
    // 2025: 9 Av was Shabbat, so the fast moved to Sunday.
    expect(name('2025-08-03')).toBe('תשעה באב');
    expect(name('2025-08-02')).toBeNull();
  });
});
