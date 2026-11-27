import { addDays, daysBetween, dayOfWeek } from './dates';
import type { ImportRow } from './importSheet';
import type { Shift } from './types';

/**
 * What changes in the people between the source roster and the next one. Nothing is assigned automatically:
 * a leaver's shifts become open for the admin to fill, and a newcomer's shifts are set by the admin in the
 * preview.
 */
export type PeopleChange =
  | { kind: 'replace'; from: string; to: string } // X's shifts go to Y
  | { kind: 'remove'; name: string }; // X left: their shifts become open

export interface ContinuationOptions {
  /** The source: the original roster in this range. */
  from: string;
  to: string;
  /** First night of the new roster. */
  start: string;
  /** Who was on the first shift of a night is on the second, and back. */
  swapSlots: boolean;
  changes: PeopleChange[];
}

const same = (a: string | null, b: string | null) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/** The first night on or after `after` that falls on the same weekday as `like`. */
export function alignedStart(after: string, like: string): string {
  const shift = (((dayOfWeek(like) - dayOfWeek(after)) % 7) + 7) % 7;
  return addDays(after, shift);
}

/**
 * The next roster, built from the original roster of [from, to]: every night moved by the same number of
 * days so it starts at `start`, optionally with the first and second shifts swapped, and then the changes
 * in people applied in order. The result is in the import format, ready to preview and import.
 */
export function generateContinuation(shifts: Shift[], opts: ContinuationOptions): ImportRow[] {
  const offset = daysBetween(opts.from, opts.start);
  const planned = (s: Shift) => ('planned_assignee' in s ? (s.planned_assignee ?? null) : s.assignee);
  const nights = new Map<string, ImportRow>();
  for (const s of shifts) {
    if (s.night < opts.from || s.night > opts.to) continue;
    const night = addDays(s.night, offset);
    const row = nights.get(night) ?? { night, slot1: null, slot2: null };
    const slot = opts.swapSlots ? (s.slot === 1 ? 2 : 1) : s.slot;
    if (slot === 1) row.slot1 = planned(s);
    else row.slot2 = planned(s);
    nights.set(night, row);
  }
  const rows = [...nights.values()].sort((a, b) => a.night.localeCompare(b.night));

  for (const change of opts.changes) {
    if (change.kind === 'replace') replace(rows, change.from, change.to);
    else remove(rows, change.name);
  }
  return rows;
}

function replace(rows: ImportRow[], from: string, to: string) {
  for (const row of rows) {
    if (same(row.slot1, from)) row.slot1 = to;
    if (same(row.slot2, from)) row.slot2 = to;
  }
}

function remove(rows: ImportRow[], name: string) {
  for (const row of rows) {
    if (same(row.slot1, name)) row.slot1 = null;
    if (same(row.slot2, name)) row.slot2 = null;
  }
}

/** Months the next roster covers by default. */
export const DEFAULT_MONTHS = 3;

/** The day `months` months after `iso` (the 31st of a short month falls back to its last day). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/**
 * Default dates for the next roster: it starts on the first night from `today` with nobody on it (no shifts,
 * or both shifts empty; one open shift in a built night does not count) and runs DEFAULT_MONTHS months. The
 * source is the same number of days right before it, starting on the same weekday, so "keep the weekday"
 * does not move the start. Null when there is no roster yet.
 */
export function defaultContinuationRange(
  shifts: Shift[],
  today: string,
): { from: string; to: string; start: string; end: string } | null {
  if (shifts.length === 0) return null;
  const planned = (s: Shift) => ('planned_assignee' in s ? (s.planned_assignee ?? null) : s.assignee);
  const filled = new Set(shifts.filter((s) => planned(s) || s.assignee).map((s) => s.night));
  let start = today;
  while (filled.has(start)) start = addDays(start, 1);
  const end = addDays(addMonths(start, DEFAULT_MONTHS), -1);
  const length = daysBetween(start, end) + 1;
  const from = addDays(start, -7 * Math.ceil(length / 7));
  return { from, to: addDays(from, length - 1), start, end };
}
