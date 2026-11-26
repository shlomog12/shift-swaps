import type { Slot } from './types';

const TIME_ZONE = 'Asia/Jerusalem';
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTH_NAMES = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

// Wrapped in Unicode isolates so the range reads left-to-right inside Hebrew text.
const ltr = (text: string) => `\u2066${text}\u2069`;

export const SLOT_HOURS: Record<Slot, string> = { 1: ltr('00:00–03:00'), 2: ltr('03:00–06:00') };
export const SLOT_NAME: Record<Slot, string> = { 1: 'ראשונה', 2: 'שנייה' };

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}

function toUtc(iso: string): Date {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return fromUtc(date);
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

export function dayName(iso: string): string {
  return DAY_NAMES[toUtc(iso).getUTCDay()];
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(iso: string): number {
  return toUtc(iso).getUTCDay();
}

export function dayOfMonth(iso: string): number {
  return parts(iso)[2];
}

/** First and last day of the Sunday-to-Saturday weeks that cover the month. */
export function monthGridBounds(key: string): { from: string; to: string } {
  const { from, to } = monthBounds(key);
  return { from: addDays(from, -dayOfWeek(from)), to: addDays(to, 6 - dayOfWeek(to)) };
}

/** "ליל חמישי – רביעי בלילה": the shift date is the morning after the evening it starts on. */
export function nightLabel(iso: string): string {
  return `ליל ${dayName(iso)} – ${dayName(addDays(iso, -1))} בלילה`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = parts(iso);
  return ltr(`${d}.${m}.${y}`);
}

export function formatShortDate(iso: string): string {
  const [, m, d] = parts(iso);
  return ltr(`${d}.${m}`);
}

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : `${count} ${many}`;
}

export function shiftTitle(night: string, slot: Slot): string {
  return `${formatDate(night)} · ${SLOT_HOURS[slot]}`;
}

/** Current date and time in Israel as "YYYY-MM-DD" and "HH:MM". */
export function israelNow(now: Date = new Date()): { date: string; time: string } {
  const values: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)) {
    values[part.type] = part.value;
  }
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

export function israelToday(): string {
  return israelNow().date;
}

/** True once the shift has started (mirrors public.shift_start in the database). */
export function hasStarted(night: string, slot: Slot, now: Date = new Date()): boolean {
  const { date, time } = israelNow(now);
  const start = slot === 1 ? '00:00' : '03:00';
  return `${date}T${time}` >= `${night}T${start}`;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return fromUtc(date).slice(0, 7);
}

export function monthBounds(key: string): { from: string; to: string } {
  const from = `${key}-01`;
  const to = addDays(`${shiftMonth(key, 1)}-01`, -1);
  return { from, to };
}

export function monthTitle(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function formatDateTime(timestamp: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'numeric',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}
