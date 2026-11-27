import { addDays, hasStarted } from './dates';
import type { Shift } from './types';

export interface FairnessRow {
  name: string;
  total: number;
  first: number; // 00:00–03:00
  second: number; // 03:00–06:00
}

export interface FairnessReport {
  rows: FairnessRow[];
  /** Average shifts per person, over the people in the report. */
  average: number;
  open: number;
}

/**
 * Shifts per person in the given shifts (e.g. one month), most first. `names` adds people with no shifts
 * in that period, so they show up with zero. Names match case-insensitively, as everywhere in the app.
 */
export function fairnessReport(shifts: Shift[], names: string[] = []): FairnessReport {
  const rows = new Map<string, FairnessRow>();
  const row = (name: string) => {
    const key = name.toLowerCase();
    if (!rows.has(key)) rows.set(key, { name, total: 0, first: 0, second: 0 });
    return rows.get(key)!;
  };
  let open = 0;
  for (const s of shifts) {
    if (!s.assignee) {
      open++;
      continue;
    }
    const r = row(s.assignee);
    r.total++;
    if (s.slot === 1) r.first++;
    else r.second++;
  }
  for (const name of names) row(name);
  const list = [...rows.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'he'));
  const average = list.length ? list.reduce((sum, r) => sum + r.total, 0) / list.length : 0;
  return { rows: list, average, open };
}

/** Open shifts that have not started and begin within `days` days of today. */
export function openSoon(shifts: Shift[], today: string, days = 7, now: Date = new Date()): Shift[] {
  const end = addDays(today, days);
  return shifts.filter((s) => !s.assignee && s.night <= end && !hasStarted(s.night, s.slot, now));
}
