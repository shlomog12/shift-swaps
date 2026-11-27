import { addDays, dayOfWeek } from './dates';

/**
 * Hebrew calendar dates and Israeli holidays, from the browser's built-in Hebrew calendar (Intl), so no
 * table of years is needed. A night shift dated D (00:00–06:00 on D) falls on D's Hebrew date, because the
 * Hebrew day began at the previous evening, so holidays are checked on D itself.
 */

interface HebrewParts {
  day: number;
  month: string; // Intl's English names: Tishri, Heshvan, Kislev, Tevet, Shevat, Adar I, Adar II, Adar, Nisan, …
  year: number;
}

const partsFormat = new Intl.DateTimeFormat('en-u-ca-hebrew', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthFormat = new Intl.DateTimeFormat('he-u-ca-hebrew', { month: 'long', timeZone: 'UTC' });

const toDate = (iso: string) => new Date(`${iso}T12:00:00Z`);

export function hebrewParts(iso: string): HebrewParts {
  const out: Record<string, string> = {};
  for (const p of partsFormat.formatToParts(toDate(iso))) out[p.type] = p.value;
  return { day: Number(out.day), month: out.month, year: Number(out.year) };
}

const LETTERS: [number, string][] = [
  [400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'],
  [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'],
  [3, 'ג'], [2, 'ב'], [1, 'א'],
];

/** A number in Hebrew letters: 25 → כ״ה, 15 → ט״ו, 787 → תשפ״ז, 5 → ה׳. */
export function gematria(n: number): string {
  let rest = n % 1000;
  let out = '';
  while (rest > 0) {
    if (rest === 15 || rest === 16) {
      out += rest === 15 ? 'טו' : 'טז';
      break;
    }
    const [value, letter] = LETTERS.find(([v]) => v <= rest)!;
    out += letter;
    rest -= value;
  }
  return out.length === 1 ? `${out}׳` : `${out.slice(0, -1)}״${out.slice(-1)}`;
}

function hebrewMonthName(iso: string): string {
  return monthFormat.format(toDate(iso));
}

/** "כ״ה בכסלו תשפ״ז". */
export function hebrewDate(iso: string): string {
  const p = hebrewParts(iso);
  return `${gematria(p.day)} ב${hebrewMonthName(iso)} ${gematria(p.year)}`;
}

/** The day alone, for a calendar cell: "כ״ה". */
export function hebrewDay(iso: string): string {
  return gematria(hebrewParts(iso).day);
}

/** The Hebrew months a Gregorian range spans: "חשוון–כסלו תשפ״ז" (or with both years when they differ). */
export function hebrewMonthsBetween(from: string, to: string): string {
  const a = hebrewParts(from);
  const b = hebrewParts(to);
  const first = hebrewMonthName(from);
  const last = hebrewMonthName(to);
  if (a.year !== b.year) return `${first} ${gematria(a.year)}–${last} ${gematria(b.year)}`;
  return first === last ? `${first} ${gematria(a.year)}` : `${first}–${last} ${gematria(a.year)}`;
}

export interface Holiday {
  name: string;
  /** A day of rest (yom tov) or Yom Kippur; other days are holidays, fasts and memorial days. */
  major: boolean;
}

/** Weekday (0 = Sunday) of day `target` of the same Hebrew month as `iso`. */
function weekdayOf(iso: string, day: number, target: number): number {
  return (((dayOfWeek(iso) + target - day) % 7) + 7) % 7;
}

const SAT = 6;
const FRI = 5;
const SUN = 0;
const MON = 1;

/** The Israeli holiday, fast or memorial day on that date, if any. */
export function holidayOn(iso: string): Holiday | null {
  const { day, month } = hebrewParts(iso);
  const major = (name: string): Holiday => ({ name, major: true });
  const minor = (name: string): Holiday => ({ name, major: false });

  // Hanukkah: eight days from 25 Kislev (it crosses into Tevet, whose start depends on Kislev's length).
  for (let i = 0; i < 8; i++) {
    const p = hebrewParts(addDays(iso, -i));
    if (p.month === 'Kislev' && p.day === 25) return minor(`חנוכה · נר ${gematria(i + 1)}`);
  }

  switch (month) {
    case 'Tishri': {
      if (day === 1 || day === 2) return major('ראש השנה');
      // Fast of Gedaliah: 3 Tishrei, put off to Sunday when it falls on Shabbat.
      const gedaliah = weekdayOf(iso, day, 3) === SAT ? 4 : 3;
      if (day === gedaliah) return minor('צום גדליה');
      if (day === 10) return major('יום כיפור');
      if (day === 15) return major('סוכות');
      if (day >= 16 && day <= 20) return minor('חול המועד סוכות');
      if (day === 21) return minor('הושענא רבה');
      if (day === 22) return major('שמיני עצרת · שמחת תורה');
      return null;
    }
    case 'Tevet':
      return day === 10 ? minor('עשרה בטבת') : null;
    case 'Shevat':
      return day === 15 ? minor('ט״ו בשבט') : null;
    case 'Adar':
    case 'Adar II': {
      // Fast of Esther: 13 Adar, brought forward to Thursday when it falls on Shabbat.
      const esther = weekdayOf(iso, day, 13) === SAT ? 11 : 13;
      if (day === esther) return minor('תענית אסתר');
      if (day === 14) return minor('פורים');
      if (day === 15) return minor('שושן פורים');
      return null;
    }
    case 'Nisan': {
      if (day === 15) return major('פסח');
      if (day >= 16 && day <= 20) return minor('חול המועד פסח');
      if (day === 21) return major('שביעי של פסח');
      // Holocaust Remembrance Day: 27 Nisan, moved off Friday (to Thursday) and Sunday (to Monday).
      const w = weekdayOf(iso, day, 27);
      const shoah = w === FRI ? 26 : w === SUN ? 28 : 27;
      return day === shoah ? minor('יום השואה') : null;
    }
    case 'Iyar': {
      // Independence Day: 5 Iyar, moved to Thursday from Friday or Shabbat, and to Tuesday from Monday;
      // Memorial Day is the day before.
      const w = weekdayOf(iso, day, 5);
      const independence = w === FRI ? 4 : w === SAT ? 3 : w === MON ? 6 : 5;
      if (day === independence - 1) return minor('יום הזיכרון');
      if (day === independence) return minor('יום העצמאות');
      if (day === 18) return minor('ל״ג בעומר');
      if (day === 28) return minor('יום ירושלים');
      return null;
    }
    case 'Sivan':
      return day === 6 ? major('שבועות') : null;
    case 'Tamuz': {
      const fast = weekdayOf(iso, day, 17) === SAT ? 18 : 17;
      return day === fast ? minor('צום י״ז בתמוז') : null;
    }
    case 'Av': {
      const fast = weekdayOf(iso, day, 9) === SAT ? 10 : 9;
      if (day === fast) return minor('תשעה באב');
      if (day === 15) return minor('ט״ו באב');
      return null;
    }
    default:
      return null;
  }
}

/** Extra marks for a date besides its holiday: the eve of a day of rest, and Shabbat or its eve. */
export interface DayMarks {
  holiday: Holiday | null;
  /** "ערב פסח" etc.: the day before a day of rest (yom tov or Yom Kippur), unless it is one itself. */
  eve: string | null;
  /** Saturday is Shabbat, Friday is its eve. A night shift dated Saturday is the night of Shabbat. */
  shabbat: 'shabbat' | 'eve' | null;
}

export function dayMarks(iso: string): DayMarks {
  const holiday = holidayOn(iso);
  const next = holidayOn(addDays(iso, 1));
  const eve = next?.major && !holiday?.major ? `ערב ${next.name.split(' · ')[0]}` : null;
  const weekday = dayOfWeek(iso);
  return { holiday, eve, shabbat: weekday === SAT ? 'shabbat' : weekday === FRI ? 'eve' : null };
}
