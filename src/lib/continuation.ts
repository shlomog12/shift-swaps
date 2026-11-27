import { addDays, daysBetween, dayOfWeek } from './dates';
import type { ImportRow } from './importSheet';
import type { Shift } from './types';

/** What changes in the people between the source roster and the next one. */
export type PeopleChange =
  | { kind: 'replace'; from: string; to: string } // X's shifts go to Y
  | { kind: 'remove'; name: string; spread: boolean } // X left: shifts open, or spread over everyone
  | { kind: 'add'; name: string }; // Y joined: takes a fair share from those with the most

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
    else if (change.kind === 'remove') remove(rows, change.name, change.spread);
    else add(rows, change.name);
  }
  return rows;
}

type Cell = { row: ImportRow; slot: 'slot1' | 'slot2' };

function cells(rows: ImportRow[]): Cell[] {
  return rows.flatMap((row) => [
    { row, slot: 'slot1' as const },
    { row, slot: 'slot2' as const },
  ]);
}

function countByName(rows: ImportRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { row, slot } of cells(rows)) {
    const name = row[slot];
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/** Someone may not hold both shifts of one night. */
function freeOnNight(row: ImportRow, name: string): boolean {
  return !same(row.slot1, name) && !same(row.slot2, name);
}

function replace(rows: ImportRow[], from: string, to: string) {
  for (const { row, slot } of cells(rows)) if (same(row[slot], from)) row[slot] = to;
}

/** A leaver's shifts become open, or each goes to whoever has the fewest shifts and is free that night. */
function remove(rows: ImportRow[], name: string, spread: boolean) {
  const theirs = cells(rows).filter(({ row, slot }) => same(row[slot], name));
  for (const c of theirs) c.row[c.slot] = null;
  if (!spread) return;
  for (const c of theirs) {
    const counts = countByName(rows);
    const candidates = [...counts.entries()]
      .filter(([other]) => freeOnNight(c.row, other))
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'he'));
    if (candidates.length > 0) c.row[c.slot] = candidates[0][0];
  }
}

/**
 * A newcomer takes a fair share (total shifts / people, rounded down), one shift at a time from whoever has
 * the most, choosing the shift farthest from the newcomer's other nights so theirs spread over the period.
 */
function add(rows: ImportRow[], name: string) {
  const counts = countByName(rows);
  if (counts.has(name)) return;
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const share = Math.floor(total / (counts.size + 1));
  const mine: string[] = [];
  for (let i = 0; i < share; i++) {
    const now = countByName(rows);
    const donor = [...now.entries()]
      .filter(([other]) => !same(other, name))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'he'))[0];
    if (!donor || donor[1] <= (now.get(name) ?? 0) + 1) break;
    const options = cells(rows).filter(({ row, slot }) => same(row[slot], donor[0]) && freeOnNight(row, name));
    if (options.length === 0) break;
    const distance = (night: string) =>
      mine.length === 0 ? Infinity : Math.min(...mine.map((m) => Math.abs(daysBetween(m, night))));
    // Farthest from the newcomer's nights; on a tie, the earliest (the first pick lands in the middle).
    const pick =
      mine.length === 0
        ? options[Math.floor(options.length / 2)]
        : options.reduce((best, c) => (distance(c.row.night) > distance(best.row.night) ? c : best));
    pick.row[pick.slot] = name;
    mine.push(pick.row.night);
  }
}
