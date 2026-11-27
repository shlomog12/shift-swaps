import { addDays, dayName } from './dates';
import type { Shift } from './types';

/** One CSV field: quoted when it holds a comma, a quote or a line break. */
function field(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The roster as CSV: date, night, first shift, second shift; one row per night. Readable in Excel and
 * Google Sheets (UTF-8 with a BOM, so Hebrew shows correctly), and accepted as-is by the app's import.
 * `planned` exports the original roster instead of who does each shift now.
 */
export function rosterCsv(shifts: Shift[], planned = false): string {
  const name = (s: Shift | undefined) =>
    (s ? (planned && 'planned_assignee' in s ? s.planned_assignee : s.assignee) : null) ?? '';
  const nights = new Map<string, { 1?: Shift; 2?: Shift }>();
  for (const s of shifts) nights.set(s.night, { ...nights.get(s.night), [s.slot]: s });

  const lines = [['תאריך', 'לילה', '00:00-03:00', '03:00-06:00'].join(',')];
  for (const night of [...nights.keys()].sort()) {
    const [y, m, d] = night.split('-').map(Number);
    const slots = nights.get(night)!;
    lines.push(
      [
        `${d}.${m}.${y}`,
        `הלילה שבין ${dayName(addDays(night, -1))} ל${dayName(night)}`,
        name(slots[1]),
        name(slots[2]),
      ]
        .map(field)
        .join(','),
    );
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Saves text as a file in the browser. */
export function downloadText(text: string, filename: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
